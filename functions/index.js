/**
 * OPTIONAL server code: alerts that reach vendors even when the app is closed.
 *  - Push notifications (Firebase Cloud Messaging) to vendors who switched on
 *    "Phone notifications" in Me -> Notifications.
 *  - WhatsApp messages (WhatsApp Cloud API) to vendors who switched on
 *    "WhatsApp messages", max 10 per vendor per day.
 * Every alert respects each vendor's own settings. See NOTIFICATIONS.md.
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const APP_URL = defineString('APP_URL', { description: 'Your site, e.g. https://yourdomain.com/ (ending with /)' });
const OWNER_EMAIL = defineString('OWNER_EMAIL', { description: 'Platform owner email (same as config.js)' });
const WA_ENABLED = defineString('WHATSAPP_ENABLED', { default: 'false' });
const WA_PHONE_ID = defineString('WHATSAPP_PHONE_ID', { default: '' });
const WA_TEMPLATE = defineString('WHATSAPP_TEMPLATE', { default: 'dealer_alert' });
const WA_LANG = defineString('WHATSAPP_TEMPLATE_LANG', { default: 'en' });
const WA_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WA_DAILY_MAX = 10;
const FAN_OUT_MAX = 1000;

const DEFAULTS = { newPosts: 'all', types: ['sell', 'buy', 'swap', 'news'], keywords: '', maxPrice: 0, city: '', state: '', storeNew: false, deals: true, orders: true, escrows: true, reviews: true, comments: true, push: false, wa: false, tokens: [] };
const TYPE_NAME = { sell: 'Selling', buy: 'Looking for', swap: 'Swap', news: 'Info' };
const naira = n => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const dayNum = () => Math.floor((Date.now() + 3600000) / 86400000);
const clip = (s, n) => String(s || '').slice(0, n);
// WhatsApp template parameters may not contain new lines, tabs or long runs of spaces
const waSafe = s => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ');

async function prefsOf(uid) {
  const s = await db.doc(`members/${uid}/prefs/notify`).get();
  return { ...DEFAULTS, ...(s.exists ? s.data() : {}) };
}
async function memberOf(uid) {
  const s = await db.doc(`members/${uid}`).get();
  return s.exists ? s.data() : null;
}
let ownerUidCache = null;
async function ownerUid() {
  if (ownerUidCache) return ownerUidCache;
  try { ownerUidCache = (await getAuth().getUserByEmail(OWNER_EMAIL.value())).uid; } catch (e) { logger.warn('owner not found', e.message); }
  return ownerUidCache;
}

// same matching rule as the app (Me -> Notifications -> alerts)
function postMatches(p, pr, authorCity, authorState) {
  if (!(pr.types || []).includes(p.type)) return false;
  const words = String(pr.keywords || '').toLowerCase().split(',').map(w => w.trim()).filter(Boolean);
  const hay = [p.model, p.storage, p.condition, p.text].join(' ').toLowerCase();
  if (words.length && !words.some(w => w.split(/\s+/).every(x => hay.includes(x)))) return false;
  if (Number(pr.maxPrice) > 0 && Number(p.price) > Number(pr.maxPrice)) return false;
  if (pr.city && String(p.city || authorCity || '').toLowerCase() !== String(pr.city).toLowerCase()) return false;
  if (pr.state && (p.state || authorState || '') !== pr.state) return false;
  return true;
}

async function sendPush(uid, pr, title, body, path) {
  const tokens = (pr.tokens || []).filter(Boolean);
  if (!pr.push || !tokens.length) return;
  const link = APP_URL.value() + (path || 'hub.html');
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: clip(title, 80), body: clip(body, 160) },
    webpush: { fcmOptions: { link }, notification: { icon: APP_URL.value() + 'icon-192.png' } },
    data: { url: link },
  });
  // forget tokens of phones that uninstalled or blocked notifications
  const dead = [];
  res.responses.forEach((r, i) => { if (!r.success && /not-registered|invalid-registration|invalid-argument/.test(r.error?.code || '')) dead.push(tokens[i]); });
  if (dead.length) await db.doc(`members/${uid}/prefs/notify`).update({ tokens: FieldValue.arrayRemove(...dead) });
}

function waNumber(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '234' + d.slice(1); else if (d.length === 10) d = '234' + d; return d; }

async function sendWhatsApp(uid, pr, title, body) {
  if (WA_ENABLED.value() !== 'true' || !pr.wa || !WA_PHONE_ID.value()) return;
  const m = await memberOf(uid); const to = waNumber(m && m.phone);
  if (!to) return;
  // daily cap per vendor
  const logRef = db.doc(`notifylog/${uid}`);
  const ok = await db.runTransaction(async t => {
    const s = await t.get(logRef); const d = dayNum();
    const n = s.exists && s.data().day === d ? s.data().wa || 0 : 0;
    if (n >= WA_DAILY_MAX) return false;
    t.set(logRef, { day: d, wa: n + 1 }, { merge: true }); return true;
  });
  if (!ok) return;
  const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID.value()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: WA_TEMPLATE.value(), language: { code: WA_LANG.value() },
        components: [{ type: 'body', parameters: [{ type: 'text', text: waSafe(clip(title, 120)) }, { type: 'text', text: waSafe(clip(body, 500)) || '-' }] }] },
    }),
  });
  if (!r.ok) logger.error('WhatsApp send failed', r.status, await r.text());
}

// kind: which setting allows it; wa: also send WhatsApp (important alerts only)
async function notify(uid, kind, title, body, path, wa = false) {
  if (!uid) return;
  try {
    const pr = await prefsOf(uid);
    if (kind && pr[kind] === false) return;
    await sendPush(uid, pr, title, body, path);
    if (wa) await sendWhatsApp(uid, pr, title, body);
  } catch (e) { logger.error('notify failed', uid, e); }
}

const secretsOpt = { secrets: [WA_TOKEN] };

// ---------- new broadcast post -> vendors whose settings want it ----------
exports.onNewPost = onDocumentCreated({ document: 'posts/{postId}', ...secretsOpt }, async event => {
  const p = event.data && event.data.data(); if (!p) return;
  const author = await memberOf(p.authorId);
  const all = await db.collectionGroup('prefs').get();
  const jobs = [];
  for (const d of all.docs) {
    if (d.id !== 'notify' || jobs.length >= FAN_OUT_MAX) continue;
    const uid = d.ref.parent.parent.id; if (uid === p.authorId) continue;
    const pr = { ...DEFAULTS, ...d.data() };
    if (pr.newPosts === 'off' || (!pr.push && !pr.wa)) continue;
    const matches = postMatches(p, pr, author && author.city, author && author.state);
    if (pr.newPosts === 'alerts' && !matches) continue;
    const title = `${p.shopName}: ${TYPE_NAME[p.type] || 'Post'}${p.model ? ' ' + p.model : ''}`;
    const body = `${p.price ? naira(p.price) + '. ' : ''}${clip(p.text, 120)}`;
    jobs.push((async () => {
      const m = await memberOf(uid); if (!m || m.status !== 'active') return;
      await sendPush(uid, pr, title, body, 'hub.html');
      if (pr.newPosts === 'alerts' && matches) await sendWhatsApp(uid, pr, 'Matches your alert: ' + title, body);
    })().catch(e => logger.error(e)));
  }
  await Promise.all(jobs);
});

// ---------- store orders ----------
exports.onNewOrder = onDocumentCreated({ document: 'orders/{orderId}', ...secretsOpt }, async event => {
  const o = event.data && event.data.data(); if (!o) return;
  await notify(o.vendorId, 'orders', 'New store order 🛍️', `${o.item}, ${naira(o.amount)}. Is it available? Confirm now.`, 'hub.html', true);
});
exports.onOrderUpdate = onDocumentUpdated({ document: 'orders/{orderId}', ...secretsOpt }, async event => {
  const a = event.data.before.data(), b = event.data.after.data();
  if (a.status === b.status) return;
  const owner = await ownerUid();
  if (b.status === 'accepted') await notify(owner, 'orders', 'Order confirmed by seller', `${b.item}: send payment details to the customer.`, 'hub.html');
  if (b.status === 'paid') await notify(b.vendorId, 'orders', 'Customer paid: deliver now', `${b.item}, delivery in ${b.city}. Open the app for the address.`, 'hub.html', true);
  if (b.status === 'received') await notify(owner, 'orders', 'Customer confirmed delivery', `${b.item}: pay the vendor.`, 'hub.html');
  if (b.status === 'disputed') { await notify(owner, 'orders', 'Problem reported on an order', `${b.item}: ${clip(b.problem, 100)}`, 'hub.html', true); await notify(b.vendorId, 'orders', 'Customer reported a problem', b.item, 'hub.html'); }
  if (b.status === 'completed') await notify(b.vendorId, 'orders', 'You have been paid ✓', `${b.item}: ${naira((b.amount || 0) - (b.commission || 0))}`, 'hub.html');
});

// ---------- deals between vendors ----------
exports.onNewDeal = onDocumentCreated({ document: 'moves/{dealId}', ...secretsOpt }, async event => {
  const m = event.data && event.data.data(); if (!m) return;
  const other = m.createdBy === m.ownerId ? m.holderId : m.ownerId;
  const who = m.createdBy === m.ownerId ? m.ownerName : m.holderName;
  await notify(other, 'deals', 'Confirm a deal', `${who} recorded ${[m.dev && m.dev.model, m.dev && m.dev.storage].filter(Boolean).join(' ')} at ${naira(m.price)}.`, 'hub.html', true);
});
exports.onDealUpdate = onDocumentUpdated({ document: 'moves/{dealId}', ...secretsOpt }, async event => {
  const a = event.data.before.data(), b = event.data.after.data();
  const item = [b.dev && b.dev.model, b.dev && b.dev.storage].filter(Boolean).join(' ');
  if (a.status !== b.status && b.status === 'returning') await notify(b.ownerId, 'deals', 'Phone returned?', `${b.holderName} says ${item} is back. Confirm.`, 'hub.html');
  if (a.status !== b.status && b.status === 'sold') await notify(b.ownerId, 'deals', 'Your phone was sold', `${b.holderName} sold ${item}. They owe ${naira(b.price)}.`, 'hub.html', true);
  if ((b.claimedPaid || 0) > (a.claimedPaid || 0)) await notify(b.ownerId, 'deals', 'Payment to confirm', `${b.holderName} says they paid for ${item}.`, 'hub.html');
});

// ---------- middleman ----------
exports.onNewEscrow = onDocumentCreated({ document: 'escrows/{id}', ...secretsOpt }, async event => {
  const e = event.data && event.data.data(); if (!e) return;
  await notify(e.sellerId, 'escrows', 'Middleman request', `${e.item}, ${naira(e.amount)}. Accept or decline.`, 'hub.html', true);
});
exports.onEscrowUpdate = onDocumentUpdated({ document: 'escrows/{id}', ...secretsOpt }, async event => {
  const a = event.data.before.data(), b = event.data.after.data();
  if (a.status === b.status) return;
  const owner = await ownerUid();
  const map = { accepted: [[b.buyerId, 'Seller accepted: pay now'], [owner, 'Middleman: buyer will pay']], paid: [[b.sellerId, 'Money received: hand over the phone']], delivered: [[b.buyerId, 'Phone handed over: check and confirm']], received: [[owner, 'Buyer confirmed: release payment']], disputed: [[owner, 'Middleman dispute opened']], released: [[b.sellerId, 'You have been paid ✓']], refunded: [[b.buyerId, 'You have been refunded']] };
  for (const [uid, title] of map[b.status] || []) await notify(uid, 'escrows', title, `${b.item}, ${naira(b.amount)}`, 'hub.html', ['accepted', 'paid', 'disputed'].includes(b.status));
});

// ---------- reviews and comments (push only) ----------
exports.onNewRating = onDocumentCreated('ratings/{id}', async event => {
  const r = event.data && event.data.data(); if (!r) return;
  await notify(r.vendorId, 'reviews', `${r.raterName} rated you ${r.stars}★`, clip(r.text, 120), 'hub.html');
});
exports.onNewComment = onDocumentCreated('posts/{postId}/comments/{cid}', async event => {
  const c = event.data && event.data.data(); if (!c) return;
  const post = (await db.doc(`posts/${event.params.postId}`).get()).data();
  if (!post || post.authorId === c.authorId) return;
  await notify(post.authorId, 'comments', `${c.shopName} commented on your post`, clip(c.text, 120), 'hub.html');
});

// ---------- reports from the site -> owner ----------
exports.onNewSiteReport = onDocumentCreated('feedback/{id}', async event => {
  const f = event.data && event.data.data(); if (!f) return;
  await notify(await ownerUid(), null, 'New report from the site', `${f.category}: ${clip(f.details, 120)}`, 'hub.html');
});
