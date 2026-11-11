import * as CFG from './config.js';
const { firebaseConfig, OWNER_EMAIL, PLATFORM_NAME, OWNER_PHONE, FREE_POSTS_PER_DAY, PREMIUM_PRICE, PAYMENT_DETAILS } = CFG;
const MIDDLEMAN_ON = CFG.MIDDLEMAN_ENABLED !== false, FEE_PCT = Number(CFG.MIDDLEMAN_FEE_PERCENT ?? 2), FEE_MIN = Number(CFG.MIDDLEMAN_FEE_MIN ?? 2000), EMBED_VIDEO = CFG.EMBED_TIKTOK !== false;
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app-check.js';
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, getDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

// ================= helpers =================
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };
const naira = n => (n < 0 ? '−' : '') + '₦' + Math.abs(Math.round(n || 0)).toLocaleString('en-NG');
const short = n => { const a = Math.abs(n), s = n < 0 ? '−' : ''; return a >= 1e6 ? s + '₦' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, '') + 'm' : a >= 1e3 ? s + '₦' + Math.round(a / 1e3) + 'k' : s + '₦' + Math.round(a); };
// Lagos-time day numbers (the security rules use the same formula)
const dayNum = () => Math.floor((Date.now() + 3600000) / 86400000);
const isoToDay = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
const dayToIso = n => new Date(n * 86400000).toISOString().slice(0, 10);
const todayISO = () => dayToIso(dayNum());
const addDays = (iso, n) => dayToIso(isoToDay(iso) + n);
const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '—';
const fmtShort = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) : '—';
const fmtTs = ts => new Date(ts).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const daysSince = iso => iso ? dayNum() - isoToDay(iso) : 0;
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago'; return fmtShort(new Date(ts).toISOString().slice(0, 10)); };
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2800); };
const devName = d => [d?.model, d?.storage, d?.color].filter(Boolean).join(' ') || 'iPhone';
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const OWNER = OWNER_EMAIL.trim().toLowerCase();
const APP = PLATFORM_NAME || 'iPhone Dealers Hub';
document.title = APP;
function waNumber(p) { let d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '234' + d.slice(1); else if (d.length === 10) d = '234' + d; return d; }
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
const telLink = phone => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
async function copy(text, ok = 'Copied') { try { await navigator.clipboard.writeText(text); toast(ok); } catch { openSheet(`<h3>Copy this</h3><textarea style="min-height:220px" readonly>${esc(text)}</textarea><div class="btns"><button class="btn" data-a="close">Close</button></div>`); } }
const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-label="Approved shop"><path fill="var(--green)" d="M12 1.5l2.6 2 3.3-.2.9 3.2 2.8 1.8-1.2 3.1 1.2 3.1-2.8 1.8-.9 3.2-3.3-.2-2.6 2-2.6-2-3.3.2-.9-3.2-2.8-1.8 1.2-3.1-1.2-3.1 2.8-1.8.9-3.2 3.3.2z"/><path d="M8 12.3l2.6 2.6L16.2 9.3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// every iPhone from the 7 series to the 18 series, oldest first, grouped by series
const MODEL_GROUPS = [
  ['iPhone 7 series', ['iPhone 7', 'iPhone 7 Plus']],
  ['iPhone 8 series', ['iPhone 8', 'iPhone 8 Plus']],
  ['iPhone X series', ['iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max']],
  ['iPhone 11 series', ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max']],
  ['iPhone SE', ['iPhone SE (2020)', 'iPhone SE (2022)']],
  ['iPhone 12 series', ['iPhone 12 mini', 'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max']],
  ['iPhone 13 series', ['iPhone 13 mini', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max']],
  ['iPhone 14 series', ['iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max']],
  ['iPhone 15 series', ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max']],
  ['iPhone 16 series', ['iPhone 16e', 'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max']],
  ['iPhone 17 series', ['iPhone 17e', 'iPhone 17', 'iPhone Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max']],
  ['iPhone 18 series', ['iPhone 18e', 'iPhone 18', 'iPhone 18 Pro', 'iPhone 18 Pro Max']],
];
const MODELS = MODEL_GROUPS.flatMap(g => g[1]);
// model dropdown; "Another model" opens a box for anything not on the list
function modelField(id, cur = '') {
  const known = !cur || MODELS.includes(cur);
  return `<label for="${id}">Model</label><select id="${id}" class="model-sel"><option value="">Choose the model</option>${MODEL_GROUPS.map(([g, ms]) => `<optgroup label="${g}">${ms.map(m => `<option ${m === cur ? 'selected' : ''}>${m}</option>`).join('')}</optgroup>`).join('')}<option value="__other" ${known ? '' : 'selected'}>Another model (type it)</option></select>
    <input id="${id}-other" maxlength="60" placeholder="Type the model" value="${known ? '' : esc(cur)}" ${known ? 'hidden' : ''} style="margin-top:8px">`;
}
const readModel = id => (val(id) === '__other' ? val(id + '-other') : val(id)).slice(0, 60);
const STORAGES = ['', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
const CONDITIONS = ['UK used', 'US used', 'Nigerian used', 'Brand new (sealed)', 'Open box', 'Refurbished', 'Faulty'];
// the 36 states of Nigeria and the FCT; keep in step with store.js and firestore.rules
const NG_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
const stateOpts = (sel, any = 'Choose your state') => `<option value="">${any}</option>` + NG_STATES.map(x => `<option ${sel === x ? 'selected' : ''}>${x}</option>`).join('');
const PARTS = ['Screen', 'Battery', 'Back glass', 'Housing', 'Front camera', 'Back camera', 'Face ID', 'Charging port', 'Speaker', 'Motherboard'];
// parts check in dealer terms, plus Face ID (ID or Off ID):
//   Non display = all original; DM = display message (screen changed);
//   DDM = display, battery or any other changed parts (ticked)
const DM_LABEL = {original: 'Non display', dm: 'Display screen (DM)', ddm: 'DDM', changed: 'DDM'};
const FACE_LABEL = {id: 'ID', off: 'Off ID'};
// dropdown choices: the owner edits them in Me → Dropdown options (saved in settings/options)
const DEF_PARTS = ['Non display', 'Display screen (DM)', 'DDM'], DEF_FACE = ['ID', 'Off ID'];
const PARTS_OPTS = () => (S.options?.partsOptions || []).length ? S.options.partsOptions : DEF_PARTS;
const FACE_OPTS = () => (S.options?.faceOptions || []).length ? S.options.faceOptions : DEF_FACE;
const faceOf = d => !d ? '' : d.face || FACE_LABEL[d.faceId] || '';
// one line, e.g. "Display screen (DM), Off ID" or "Non display, ID"
const partsText = d => {
  if (!d) return '';
  return [partsOnly(d), faceOf(d)].filter(Boolean).join(', ').slice(0, 200);
};
// the parts wording the dealer typed (older phones: built from the earlier dropdown)
const partsOnly = d => {
  if (!d) return '';
  if (typeof d.parts === 'string') return d.parts;   // copy kept in a deal, post or listing
  if (d.partsInfo) return d.partsInfo;
  const dm = DM_LABEL[d.partsStatus] || '', list = d.parts || [];
  const what = d.partsStatus === 'dm' ? '' : d.partsStatus === 'ddm' || d.partsStatus === 'changed' ? ' (' + (list.join(', ') || 'parts changed') + ')' : d.partsStatus === 'changed' && list.length ? ': ' + list.join(', ') : '';
  return dm ? dm + what + (dm !== 'Non display' && d.partsNote ? ', ' + d.partsNote : '') : '';
};
// shop logo: a small square picture saved on the shop's profile; initials when there is none
const LOGO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const avInner = (m, name) => m?.logo && LOGO_RE.test(m.logo) ? `<img src="${m.logo}" alt="">` : esc(initials(name));
async function shrinkLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 160);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    let q = .85, out = c.toDataURL('image/jpeg', q);
    while (out.length > 30000 && q > .35) { q -= .1; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
const capWords = t => String(t || '').trim().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
const place = (...a) => { const seen = new Set(); return a.filter(Boolean).map(capWords).filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(', '); };   // "Kaduna, Kaduna" shows once
const devCopy = d => ({model: d.model || '', storage: d.storage || '', color: d.color || '', imei: d.imei || '', condition: d.condition || '', battery: d.battery || '', parts: partsOnly(d), face: faceOf(d)});
const TYPES = {sell: ['Selling', 't-sell'], buy: ['Looking for', 't-buy'], swap: ['Swap', 't-swap'], news: ['Info', 't-news']};
const SLOW_DAYS = 14;
// daily caps per member; must match capOf() in firestore.rules
const CAPS = {comments: 150, reports: 10, ratings: 30, deals: 100, escrows: 20, sales: 60};
const CAP_NAMES = {comments: 'comments', reports: 'reports', ratings: 'new reviews', deals: 'deals', escrows: 'middleman requests', sales: 'sold announcements'};
const IDLE_MIN = Number(CFG.IDLE_LOGOUT_MINUTES ?? 120);
const STORE_NAME = CFG.STORE_NAME || 'Customer store', COMM_PCT = Number(CFG.STORE_COMMISSION_PERCENT ?? 5), STORE_URL = CFG.STORE_URL || 'store.html';
const START_URL = CFG.START_URL || 'index.html#choose';
const PUSH_ON = CFG.PUSH_ENABLED === true && !!CFG.FCM_VAPID_KEY && !String(CFG.FCM_VAPID_KEY).includes('PASTE');
const WA_ALERTS = CFG.WHATSAPP_ALERTS_ENABLED === true;
const COMMUNITY_URL = CFG.WHATSAPP_COMMUNITY_URL || '';
const DEFAULT_PREFS = {lastSeen: 0, seenComments: {}, newPosts: 'all', types: ['sell', 'buy', 'swap', 'news'], keywords: '', maxPrice: 0, city: '', state: '', storeNew: false, deals: true, orders: true, escrows: true, reviews: true, comments: true, push: false, wa: false, tokens: []};
const BELL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>';
const commissionFor = amt => Math.round(num(amt) * COMM_PCT / 100);
const ORD_LABEL = {new: 'Waiting for seller', accepted: 'Waiting for payment', paid: 'Paid, seller delivering', delivered: 'Delivered, customer checking', received: 'Customer confirmed', completed: 'Completed', rejected: 'Not available', cancelled: 'Cancelled', disputed: 'Problem reported', refunded: 'Refunded'};
const ORD_OPEN = ['new', 'accepted', 'paid', 'delivered', 'received', 'disputed'];
const CREDIT = '<footer class="credit">Powered by <b>Syngle</b> (M.A Haske)<div style="margin-top:8px"><a href="store.html#report" data-site-report style="color:var(--mute);font-weight:600">Report a problem</a></div></footer>';
const SITE_CATS = {seller: 'A seller or shop', listing: 'A fake or wrong listing', order: 'A problem with an order', scam: 'Scam or fraud', website: 'The app is not working', other: 'Something else'};
const REASONS = {scam: 'Scam or fraud', fake: 'Fake, stolen or iCloud-locked phone', nopay: "Didn't pay me", noreturn: "Didn't return my phone", abuse: 'Rude or abusive', spam: 'Spam or misleading posts', other: 'Something else'};
const FREE = FREE_POSTS_PER_DAY || 2;

// ================= setup check =================
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('PASTE')) {
  $('#app').innerHTML = `<div class="center"><h1 class="brand">Almost ready</h1><div class="alert">Open <b>config.js</b> and paste your Firebase settings and your owner email. SETUP-GUIDE.md, step 4, shows how.</div></div>`;
  throw new Error('config.js not filled');
}
const fbApp = initializeApp(firebaseConfig);
// App Check: only your real website (with a valid reCAPTCHA token) can reach the database
const APP_CHECK_ON = !!(CFG.RECAPTCHA_SITE_KEY && !String(CFG.RECAPTCHA_SITE_KEY).includes('PASTE'));
if (APP_CHECK_ON) { try { initializeAppCheck(fbApp, {provider: new ReCaptchaV3Provider(CFG.RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true}); } catch (e) { console.error('App Check', e); } }
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ================= state =================
const S = { user: null, me: null, members: {}, devices: {}, moves: {}, posts: [], quota: null, view: 'feed', filter: 'open', feedType: 'all', q: '', unsubs: [], postLimit: 25, chartSel: null, adminFilter: 'pending', partnerQ: '', postUnsub: null, ratings: {}, reports: {}, reportFilter: 'open', draftStars: 0, escrows: {}, escFilter: 'open', listings: {}, orders: {}, ordFilter: 'todo', sales: [], feedback: {}, reportSource: 'members', custLimits: null, prefs: null, storeLive: [], alerted: null, storeUnsub: null, limits: null, settings: {joinsOpen: true, postingOpen: true, storeOpen: true} };
const uid = () => S.user?.uid;
const isOwner = () => (S.user?.email || '').toLowerCase() === OWNER;
const member = id => S.members[id] || {};
const nameOf = id => id === uid() ? (S.me?.shopName || 'You') : (member(id).shopName || 'Unknown shop');
const isPremium = m => !!m && (m.premiumUntil >= dayNum());
const unlimited = () => isOwner() || S.me?.unlimited === true || isPremium(S.me);
const postsLeft = () => { if (unlimited()) return Infinity; const q = S.quota; return Math.max(0, FREE - (q && q.day === dayNum() ? q.count : 0)); };
function capLeft(kind) { if (isOwner()) return Infinity; const l = S.limits && S.limits.day === dayNum() ? S.limits : {}; return CAPS[kind] - (l[kind] || 0); }
function capGuard(kind) { if (capLeft(kind) > 0) return true; toast(`Daily limit reached for ${CAP_NAMES[kind]}. It resets at midnight.`); return false; }
function bumpLimit(batch, kind) {
  if (isOwner()) return;
  const d = dayNum(), l = S.limits && S.limits.day === d ? S.limits : {day: d};
  const next = {day: d}; Object.keys(CAPS).forEach(k => { if (l[k]) next[k] = l[k]; });
  next[kind] = (l[kind] || 0) + 1;
  batch.set(doc(db, 'limits', uid()), next);
}
const activeMembers = () => Object.values(S.members).filter(m => m.status === 'active');
function ensureRatings(ids) {
  if (isOwner() || !S.ratingLoaded) return Promise.resolve(false);
  const need = [...new Set(ids)].filter(i => i && !S.ratingLoaded.has(i));
  if (!need.length) return Promise.resolve(false);
  need.forEach(i => S.ratingLoaded.add(i));
  const jobs = [];
  for (let i = 0; i < need.length; i += 30) jobs.push(getDocs(query(collection(db, 'ratings'), where('vendorId', 'in', need.slice(i, i + 30)))).then(s => s.forEach(d => { S.ratings[d.id] = {id: d.id, ...d.data()}; })));
  return Promise.all(jobs).then(() => { render(); refreshOpenPost(); return true; }).catch(e => { need.forEach(i => S.ratingLoaded.delete(i)); console.error(e); return false; });
}
const ratingsFor = vid => Object.values(S.ratings).filter(r => r.vendorId === vid).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
function ratingOf(vid) { const r = ratingsFor(vid); return {n: r.length, avg: r.length ? r.reduce((a, x) => a + x.stars, 0) / r.length : 0}; }
const starsInline = vid => { const r = ratingOf(vid); return r.n ? `<span class="stars" aria-label="Rated ${r.avg.toFixed(1)} out of 5 by ${r.n}">★ ${r.avg.toFixed(1)} <span>(${r.n})</span></span>` : ''; };
const starRow = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const openReports = () => Object.values(S.reports).filter(r => r.status === 'open');
const openSite = () => Object.values(S.feedback || {}).filter(r => r.status === 'open');
// ----- TikTok -----
function tiktokUrl(u) { try { const x = new URL(String(u).trim()); return /(^|\.)tiktok\.com$/i.test(x.hostname) && x.protocol === 'https:' ? x.href : ''; } catch { return ''; } }
function tiktokId(u) { const m = String(u || '').match(/\/video\/(\d{8,25})/); return m ? m[1] : ''; }
function videoBlock(url, full) {
  const u = tiktokUrl(url); if (!u) return '';
  const id = tiktokId(u);
  return (EMBED_VIDEO && full && id ? `<div class="tt"><iframe src="https://www.tiktok.com/embed/v2/${id}" title="TikTok video" allow="encrypted-media; fullscreen" loading="lazy"></iframe></div>` : '')
    + `<div class="btns" style="margin-top:8px"><a class="btn tk sm" target="_blank" rel="noopener" href="${esc(u)}">▶ Watch on TikTok</a></div>`;
}
// ----- middleman (escrow) -----
const feeFor = amt => Math.max(FEE_MIN, Math.round(num(amt) * FEE_PCT / 100));
const ESC_STEPS = [['accepted', 'Seller agreed'], ['paid', 'Buyer paid'], ['delivered', 'Phone handed over'], ['received', 'Buyer confirmed'], ['released', 'Seller paid']];
const ESC_LABEL = {requested: 'Waiting for seller', accepted: 'Waiting for payment', paid: 'Money with middleman', delivered: 'Phone handed over', received: 'Releasing to seller', released: 'Completed', refunded: 'Refunded to buyer', declined: 'Declined', cancelled: 'Cancelled', disputed: 'In dispute'};
const prefs = () => ({...DEFAULT_PREFS, lastSeen: Date.now() - 864e5, ...(S.prefs || {})});
const prefRef = () => doc(db, 'members', uid(), 'prefs', 'notify');
function postMatches(p, pr) {
  if (!(pr.types || []).includes(p.type)) return false;
  const words = String(pr.keywords || '').toLowerCase().split(',').map(w => w.trim()).filter(Boolean);
  const hay = [p.model, p.storage, p.condition, p.text].join(' ').toLowerCase();
  if (words.length && !words.some(w => w.split(/\s+/).every(x => hay.includes(x)))) return false;
  if (num(pr.maxPrice) > 0 && num(p.price) > num(pr.maxPrice)) return false;
  if (pr.city && String(p.city || member(p.authorId).city || '').toLowerCase() !== String(pr.city).toLowerCase()) return false;
  if (pr.state && (p.state || member(p.authorId).state || '') !== pr.state) return false;
  return true;
}
function notifs() {
  const pr = prefs(), me = uid(), seen = pr.lastSeen || 0, out = [];
  const add = (n) => out.push({...n, unread: n.act || n.flag || (n.ts || 0) > seen});
  if (pr.deals) Object.values(S.moves).filter(needsMe).forEach(m => add({k: 'm' + m.id + m.status, ts: m.updatedAt, act: true, kind: 'move', id: m.id, title: `Deal: ${devName(m.dev)}`, body: m.status === 'pending' ? `${otherName(m)} needs you to confirm` : m.status === 'returning' ? `${otherName(m)} says it was returned` : `${otherName(m)} says they paid`}));
  if (pr.orders) Object.values(S.orders).filter(ordNeedsMe).forEach(o => add({k: 'o' + o.id + o.status, ts: o.updatedAt, act: true, kind: 'order', id: o.id, title: `Store order: ${o.item}`, body: {new: 'A customer wants it. Is it available?', paid: 'Customer paid. Deliver now.', accepted: 'Confirm when the customer pays', received: 'Customer confirmed. Pay the vendor.', disputed: 'Problem reported'}[o.status] || ORD_LABEL[o.status]}));
  if (pr.escrows && MIDDLEMAN_ON) Object.values(S.escrows).filter(escNeedsMe).forEach(e => add({k: 'e' + e.id + e.status, ts: e.updatedAt, act: true, kind: 'escrow', id: e.id, title: `Middleman: ${e.item}`, body: ESC_LABEL[e.status] || e.status}));
  if (pr.newPosts !== 'off') S.posts.filter(p => p.authorId !== me && (pr.newPosts === 'all' || postMatches(p, pr))).forEach(p => add({k: 'p' + p.id, ts: p.createdAt, kind: 'post', id: p.id, title: `${p.shopName}: ${(TYPES[p.type] || TYPES.news)[0]}${p.model ? ' ' + p.model : ''}`, body: (p.price ? naira(p.price) + '. ' : '') + (p.text || '').slice(0, 90)}));
  if (pr.storeNew) S.storeLive.filter(l => l.vendorId !== me).forEach(l => add({k: 'l' + l.id, ts: l.createdAt, kind: 'listing', id: l.id, title: `New in the store: ${[l.model, l.storage].join(' ')}`, body: `${l.shopName}, ${naira(l.price)}`}));
  if (pr.reviews) ratingsFor(me).forEach(r => add({k: 'r' + r.id + (r.updatedAt || 0), ts: r.updatedAt || r.createdAt, kind: 'review', id: me, title: `${r.raterName} rated you ${r.stars}★`, body: r.text || ''}));
  if (pr.comments) S.posts.filter(p => p.authorId === me && (p.commentCount || 0) > ((pr.seenComments || {})[p.id] || 0)).forEach(p => add({k: 'c' + p.id + p.commentCount, ts: p.updatedAt || p.createdAt, flag: true, kind: 'post', id: p.id, title: `New comment${(p.commentCount - ((pr.seenComments || {})[p.id] || 0)) > 1 ? 's' : ''} on your post`, body: p.model || (p.text || '').slice(0, 60)}));
  return out.sort((a, b) => (b.act - a.act) || (b.ts || 0) - (a.ts || 0));
}
function popupCheck() {
  const list = notifs().filter(n => n.unread);
  if (!S.alerted) { S.alerted = new Set(list.map(n => n.k)); return; }
  const fresh = list.filter(n => !S.alerted.has(n.k));
  fresh.forEach(n => S.alerted.add(n.k));
  if (!fresh.length) return;
  if (document.hidden && prefs().push && 'Notification' in window && Notification.permission === 'granted') {
    const show = fresh.length > 3 ? [{title: `${fresh.length} new updates on ${APP}`, body: fresh.slice(0, 3).map(n => n.title).join(' · '), k: 'many'}] : fresh;
    show.forEach(n => showPopup(n.title, n.body, n.k));
  } else if (!document.hidden) toast(fresh[0].title + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''));
}
async function showPopup(title, body, tag) {
  const opts = {body: String(body || '').slice(0, 140), tag, icon: 'icon-192.png', badge: 'icon-192.png'};
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) return reg.showNotification(title, opts); new Notification(title, opts); } catch (e) { console.error(e); }
}
function syncStoreWatch() {
  const want = prefs().storeNew;
  if (want && !S.storeUnsub) S.storeUnsub = onSnapshot(query(collection(db, 'listings'), where('status', '==', 'live'), limit(30)), s => { const a = []; s.forEach(d => a.push({id: d.id, ...d.data()})); S.storeLive = a; render(); }, () => {});
  if (!want && S.storeUnsub) { S.storeUnsub(); S.storeUnsub = null; S.storeLive = []; }
}
// "Recently sold": buyers are never named
function saleDoc({sellerId, shopName, item, buyerType, buyerLabel, via}) {
  return {sellerId, shopName: String(shopName || '').slice(0, 60), item: String(item || 'iPhone').slice(0, 120), buyerType, buyerLabel: String(buyerLabel || '').slice(0, 60), via, createdAt: Date.now()};
}
function addSale(batch, data) { batch.set(doc(db, 'sales', rid()), saleDoc(data)); if (data.sellerId === uid()) bumpLimit(batch, 'sales'); }
const soldLine = x => 'to ' + (x.buyerLabel || (x.buyerType === 'customer' ? 'a customer' : 'a dealer'));
function soldStrip() {
  if (!S.sales.length) return '';
  return `<div style="margin-top:12px"><div class="ch" style="margin:0 2px 6px"><b style="font-family:var(--disp);font-size:16px">Recently sold</b><button class="small-btn" data-a="allSales" style="padding:5px 10px">See all</button></div>
    <div class="chips" style="gap:8px">${S.sales.slice(0, 12).map(x => `<div class="card" style="margin:0;min-width:210px;max-width:240px;padding:11px 12px;flex:none"><div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">✓ ${esc(x.item)}</div><div class="mute" style="font-size:12.5px;white-space:normal">sold by <span class="who-link" data-member="${esc(x.sellerId)}" style="color:var(--ink);font-weight:600">${esc(x.shopName)}</span> ${esc(soldLine(x))}, ${ago(x.createdAt)}</div></div>`).join('')}</div></div>`;
}
const listingFor = devId => S.listings[uid() + '_' + devId];
function ordNeedsMe(o) {
  if (o.vendorId === uid() && (o.status === 'new' || o.status === 'paid')) return true;
  return isOwner() && ['accepted', 'received', 'disputed'].includes(o.status);
}
const ordTag = o => `<span class="tag ${['completed'].includes(o.status) ? 'g' : ['rejected', 'cancelled', 'refunded'].includes(o.status) ? 'gr' : o.status === 'disputed' ? 'rd' : ordNeedsMe(o) ? 'rd' : 'y'}">${ordNeedsMe(o) && o.status !== 'disputed' ? 'Your turn' : ORD_LABEL[o.status] || o.status}</span>`;
S.contacts = {};
const canSeeContact = o => isOwner() || (o.vendorId === uid() && ['paid', 'delivered', 'received', 'disputed', 'completed'].includes(o.status));
async function loadContact(id) {
  const o = S.orders[id]; if (!o || !canSeeContact(o)) return null;
  if (S.contacts[id]) return S.contacts[id];
  try { const snap = await getDoc(doc(db, 'orders', id, 'private', 'contact')); S.contacts[id] = snap.exists() ? snap.data() : {}; } catch (e) { console.error(e); S.contacts[id] = {}; }
  return S.contacts[id];
}
const ordItem = o => `<button class="item ${ordNeedsMe(o) ? 'hl' : ''}" data-order="${esc(o.id)}"><span class="glyph ${ORD_OPEN.includes(o.status) ? 'in' : 'done'}"></span><span style="min-width:0"><div class="t">${esc(o.item)}</div><div class="m">${isOwner() && o.vendorId !== uid() ? esc(nameOf(o.vendorId)) + ', ' : ''}customer in ${esc(place(o.city, o.state))}, ${ago(o.createdAt)}</div></span><span class="r"><div class="p">${short(o.amount)}</div>${ordTag(o)}</span></button>`;
const escOpen = e => !['released', 'refunded', 'declined', 'cancelled'].includes(e.status);
function escNeedsMe(e) {
  const me = uid();
  if (isOwner() && e.buyerId !== me && e.sellerId !== me) return ['accepted', 'received', 'disputed'].includes(e.status);
  if (e.sellerId === me) return e.status === 'requested' || e.status === 'paid';
  if (e.buyerId === me) return e.status === 'accepted' || e.status === 'delivered';
  return false;
}
function escTag(e) {
  const cls = {released: 'g', refunded: 'gr', declined: 'gr', cancelled: 'gr', disputed: 'rd'}[e.status] || (escNeedsMe(e) ? 'rd' : 'y');
  return `<span class="tag ${cls}">${escNeedsMe(e) && escOpen(e) && e.status !== 'disputed' ? 'Your turn' : ESC_LABEL[e.status] || e.status}</span>`;
}
const escItem = e => `<button class="item ${escNeedsMe(e) ? 'hl' : ''}" data-escrow="${esc(e.id)}"><span class="glyph ${escOpen(e) ? 'in' : 'done'}"></span><span style="min-width:0"><div class="t">${esc(e.item)}</div><div class="m">${esc(nameOf(e.buyerId))} buying from ${esc(nameOf(e.sellerId))}</div></span><span class="r"><div class="p">${short(e.amount)}</div>${escTag(e)}</span></button>`;

// ================= deal logic =================
// ownerId owns the phone and gets paid; holderId has the phone and pays
const OPEN = ['pending', 'active', 'returning'];
const iHold = m => m.holderId === uid();
const iOwn = m => m.ownerId === uid();
const iCreated = m => m.createdBy === uid();
const otherId = m => iOwn(m) ? m.holderId : m.ownerId;
const otherName = m => member(otherId(m)).shopName || (iOwn(m) ? m.holderName : m.ownerName) || 'Partner';
const owed = m => m.status === 'sold' ? Math.max(0, num(m.price) - num(m.paid)) : 0;
const overdue = m => m.status === 'active' && m.due && m.due < todayISO();
const isClosed = m => ['returned', 'rejected', 'cancelled'].includes(m.status) || (m.status === 'sold' && owed(m) === 0);
function needsMe(m) {
  if (m.status === 'pending' && !iCreated(m)) return true;
  if (m.status === 'returning' && iOwn(m)) return true;
  if (m.status === 'sold' && owed(m) > 0 && iOwn(m) && num(m.claimedPaid) > num(m.paid)) return true;
  return false;
}
function moveTag(m) {
  if (m.status === 'pending') return iCreated(m) ? '<span class="tag y">Awaiting confirm</span>' : '<span class="tag rd">Confirm now</span>';
  if (m.status === 'active') return overdue(m) ? `<span class="tag rd">${daysSince(m.due)}d late</span>` : `<span class="tag b">${iHold(m) ? 'You have it' : esc(otherName(m)) + ' has it'}</span>`;
  if (m.status === 'returning') return '<span class="tag y">Return to confirm</span>';
  if (m.status === 'returned') return '<span class="tag g">Returned</span>';
  if (m.status === 'sold') return owed(m) > 0 ? (num(m.claimedPaid) > num(m.paid) ? '<span class="tag y">Payment to confirm</span>' : `<span class="tag o">${short(owed(m))} owed</span>`) : '<span class="tag v">Sold and paid</span>';
  if (m.status === 'rejected') return '<span class="tag gr">Rejected</span>';
  if (m.status === 'cancelled') return '<span class="tag gr">Cancelled</span>';
  return '';
}
const moveLine = m => (iOwn(m) ? 'Given to ' : 'Collected from ') + esc(otherName(m)) + (OPEN.includes(m.status) && m.due ? ', due ' + fmtShort(m.due) : '');
const moveItem = m => `<button class="item ${needsMe(m) ? 'hl' : overdue(m) ? 'late' : ''}" data-move="${esc(m.id)}"><span class="glyph ${isClosed(m) ? 'done' : iOwn(m) ? 'out' : 'in'}"></span>
  <span style="min-width:0"><div class="t">${esc(devName(m.dev))}</div><div class="m">${moveLine(m)}</div></span>
  <span class="r"><div class="p">${short(m.price)}</div>${moveTag(m)}</span></button>`;
const moveList = arr => arr.length ? `<div class="list">${arr.map(moveItem).join('')}</div>` : '';
const matchQ = text => !S.q || text.toLowerCase().includes(S.q);
const moveText = m => [devName(m.dev), m.dev?.imei, otherName(m), m.note].join(' ');
const sortMoves = arr => arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
const movesArr = () => sortMoves(Object.values(S.moves).filter(m => matchQ(moveText(m))));

// ================= stock =================
function openMoveFor(devId) { return Object.values(S.moves).find(m => m.deviceId === devId && iOwn(m) && (OPEN.includes(m.status) || m.status === 'sold')); }
function devState(d) { if (d.sale) return 'sold'; const m = openMoveFor(d.id); if (!m) return 'stock'; return m.status === 'sold' ? 'soldPartner' : 'out'; }
const expTotal = d => (d.expenses || []).reduce((s, e) => s + num(e.amount), 0);
const devOwed = d => d.sale ? Math.max(0, num(d.sale.amount) - num(d.sale.paid)) : 0;
const devText = d => [devName(d), d.imei, d.condition, partsText(d), d.notes, d.from, d.sale?.to].join(' ');
const devRef = id => doc(db, 'members', uid(), 'devices', id);
function salesList() {
  const out = [];
  // cost price was removed, so reports measure sales (money in), not profit
  Object.values(S.devices).forEach(d => { if (d.sale) out.push({date: d.sale.date, model: d.model, revenue: num(d.sale.amount), partner: ''}); });
  Object.values(S.moves).forEach(m => {
    if (m.status !== 'sold') return;
    if (iOwn(m)) out.push({date: m.soldAt, model: m.dev?.model, revenue: num(m.price), partner: m.holderId});
    else if (num(m.soldInfo?.amount)) out.push({date: m.soldAt, model: m.dev?.model, revenue: num(m.soldInfo.amount), partner: ''});
  });
  return out;
}
function partnerScore(pid) {
  const fin = Object.values(S.moves).filter(m => m.holderId === pid && iOwn(m) && m.closedAt && (m.status === 'returned' || (m.status === 'sold' && owed(m) === 0)));
  return {fin: fin.length, onTime: fin.filter(m => !m.due || m.closedAt <= m.due).length};
}

// ================= auth & loading =================
onSnapshot(doc(db, 'settings', 'options'), s => { S.options = s.exists() ? s.data() : {}; }, () => {});
onSnapshot(doc(db, 'settings', 'platform'), s => { S.settings = {joinsOpen: true, postingOpen: true, ...(s.exists() ? s.data() : {})}; if (S.started) render(); }, () => {});
onAuthStateChanged(auth, user => boot(user));
async function boot(user) {
  stopAll();
  Object.assign(S, {user, me: null, members: {}, devices: {}, moves: {}, posts: [], quota: null, view: 'feed', q: '', filter: 'open', feedType: 'all', postLimit: 25, chartSel: null, ratings: {}, reports: {}, escrows: {}, listings: {}, orders: {}, prefs: null, storeLive: [], alerted: null, limits: null});
  if (user && user.isAnonymous) { await signOut(auth); return; }
  if (!user) return authView('login');
  try {
    const snap = await getDoc(doc(db, 'members', user.uid));
    if (!snap.exists()) return profileForm(true);
    S.me = {id: snap.id, ...snap.data()};
    if (!user.emailVerified) return verifyGate();
    if (isOwner() && S.me.status !== 'active') { await updateDoc(doc(db, 'members', user.uid), {status: 'active'}); S.me.status = 'active'; }
    S.memberUnsub = onSnapshot(doc(db, 'members', user.uid), s => {
      if (!s.exists()) return signOut(auth);
      S.me = {id: s.id, ...s.data()};
      if (S.me.status === 'active' || isOwner()) { if (!S.started) startApp(); else render(); }
      else { stopApp(); gateView(); }
    }, dbErr);
  } catch (e) { dbErr(e); }
}
let lastActive = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, {passive: true}));
if (IDLE_MIN > 0) setInterval(() => { if (S.user && Date.now() - lastActive > IDLE_MIN * 60000) { lastActive = Date.now(); stopAll(); signOut(auth); setTimeout(() => toast('Logged out after being idle, to keep your account safe'), 300); } }, 60000);
function stopApp() { S.unsubs.forEach(u => u()); S.unsubs = []; if (S.postUnsub) S.postUnsub(); S.postUnsub = null; S.started = false; closeSheet(); }
function stopAll() { stopApp(); if (S.memberUnsub) S.memberUnsub(); S.memberUnsub = null; }
function startApp() {
  if (S.started) return; S.started = true;
  const u = uid();
  S.unsubs.push(onSnapshot(isOwner() ? collection(db, 'members') : query(collection(db, 'members'), where('status', '==', 'active')), s => { S.members = {}; s.forEach(d => S.members[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(collection(db, 'members', u, 'devices'), s => { S.devices = {}; s.forEach(d => S.devices[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(query(collection(db, 'moves'), where('parties', 'array-contains', u)), s => { S.moves = {}; s.forEach(d => S.moves[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(doc(db, 'quota', u), s => { S.quota = s.exists() ? s.data() : null; render(); }, () => {}));
  S.unsubs.push(onSnapshot(doc(db, 'limits', u), s => { S.limits = s.exists() ? s.data() : null; }, () => {}));
  // ratings: the owner watches all; members watch their own and load others only for shops on screen
  S.ratingLoaded = new Set([u]);
  S.unsubs.push(onSnapshot(isOwner() ? collection(db, 'ratings') : query(collection(db, 'ratings'), where('vendorId', '==', u)), s => {
    if (isOwner()) S.ratings = {}; else Object.keys(S.ratings).forEach(k => { if (S.ratings[k].vendorId === u) delete S.ratings[k]; });
    s.forEach(d => S.ratings[d.id] = {id: d.id, ...d.data()}); render(); refreshOpenPost();
  }, dbErr));
  S.unsubs.push(onSnapshot(isOwner() ? collection(db, 'reports') : query(collection(db, 'reports'), where('reporterId', '==', u)), s => { S.reports = {}; s.forEach(d => S.reports[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  if (isOwner()) S.unsubs.push(onSnapshot(collection(db, 'feedback'), s => { S.feedback = {}; s.forEach(d => S.feedback[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(doc(db, 'custlimits', u), s => { S.custLimits = s.exists() ? s.data() : null; }, () => {}));
  S.unsubs.push(onSnapshot(doc(db, 'members', u, 'prefs', 'notify'), s => { S.prefs = s.exists() ? s.data() : null; syncStoreWatch(); render(); }, () => {}));
  S.unsubs.push(() => { if (S.storeUnsub) { S.storeUnsub(); S.storeUnsub = null; } });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js' + (PUSH_ON ? '?c=' + encodeURIComponent(JSON.stringify(firebaseConfig)) : '')).catch(() => {});
  S.unsubs.push(onSnapshot(query(collection(db, 'listings'), where('vendorId', '==', u)), s => { S.listings = {}; s.forEach(d => S.listings[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(isOwner() ? collection(db, 'orders') : query(collection(db, 'orders'), where('vendorId', '==', u)), s => { S.orders = {}; s.forEach(d => S.orders[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  if (MIDDLEMAN_ON) S.unsubs.push(onSnapshot(isOwner() ? collection(db, 'escrows') : query(collection(db, 'escrows'), where('parties', 'array-contains', u)), s => { S.escrows = {}; s.forEach(d => S.escrows[d.id] = {id: d.id, ...d.data()}); render(); }, dbErr));
  S.unsubs.push(onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(40)), s => { const a = []; s.forEach(d => a.push({id: d.id, ...d.data()})); S.sales = a; if (S.view === 'feed') render(); }, () => {}));
  subscribePosts();
  render();
}
function subscribePosts() {
  if (S.postUnsub) S.postUnsub();
  S.postUnsub = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(S.postLimit)), s => { const a = []; s.forEach(d => a.push({id: d.id, ...d.data()})); S.posts = a; if (S.view === 'feed') render(); refreshOpenPost(); }, dbErr);
}
function dbErr(e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Access denied. If you set this up, check guide step 5.' : 'Connection problem: ' + (e?.message || e)); }

// ================= join / login =================
const loginLock = {fails: 0, until: 0};
function authView(mode) {
  const join = mode === 'join';
  if (join && S.settings.joinsOpen === false) {
    $('#app').innerHTML = `<div class="center"><img class="logo" src="logo-mark.svg" width="72" height="72" alt=""><h1 class="brand" style="font-size:32px">${esc(APP)}</h1><div class="alert">New sign-ups are paused for now. Please check back later${OWNER_PHONE ? ' or message us on WhatsApp' : ''}.</div>
      ${OWNER_PHONE ? `<div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(OWNER_PHONE, 'Hello, I want to join ' + APP + '.')}">WhatsApp ${esc(APP)}</a></div>` : ''}<div class="btns"><button class="btn" data-auth="login">Back to log in</button></div>${CREDIT}</div>`;
    return;
  }
  $('#app').innerHTML = `<div class="center">
    <img class="logo" src="logo-mark.svg" width="72" height="72" alt=""><h1 class="brand" style="font-size:32px">${esc(APP)}</h1>
    <p class="mute" style="margin:6px 0 16px">The private network for iPhone dealers. Broadcast what you have, find what you need, and track every phone you give out.</p>
    <div class="chips" style="margin-bottom:6px"><button class="chip ${join ? '' : 'on'}" data-auth="login">Log in</button><button class="chip ${join ? 'on' : ''}" data-auth="join">Join with your shop</button></div>
    <form id="af">
      ${join ? `<label for="j-shop">Shop name</label><input id="j-shop" required placeholder="Tunde Phones">
      <label for="j-name">Your name</label><input id="j-name" required>
      <div class="row"><div><label for="j-addr">Market or address</label><input id="j-addr" required placeholder="Farm Centre"></div><div><label for="j-city">City</label><input id="j-city" required placeholder="Kano"></div></div>
      <label for="j-state">State</label><select id="j-state" required>${stateOpts('')}</select>
      <label for="j-phone">WhatsApp number</label><input id="j-phone" inputmode="tel" required>` : ''}
      <label for="login-email">Email</label><input id="login-email" type="email" autocomplete="username" required>
      <label for="login-pass">Password${join ? ': at least 8 characters, with letters and numbers' : ''}</label><div class="pw"><input id="login-pass" type="password" autocomplete="${join ? 'new-password' : 'current-password'}" required minlength="${join ? 8 : 6}"><button type="button" class="pw-eye" data-pw="login-pass" aria-label="Show password" aria-pressed="false">Show</button></div>
      ${join ? `<label for="login-pass2">Confirm password</label><div class="pw"><input id="login-pass2" type="password" autocomplete="new-password" required minlength="8"><button type="button" class="pw-eye" data-pw="login-pass2" aria-label="Show password" aria-pressed="false">Show</button></div><div class="mute" id="pw-match" style="font-size:12.5px;margin-top:5px" aria-live="polite"></div>` : ''}
      ${join ? '<label class="toggle"><input type="checkbox" id="j-ok" required>I own or run a phone shop</label>' : ''}
      <div class="btns"><button class="btn pri" type="submit">${join ? 'Apply to join' : 'Log in'}</button></div></form>
    ${join ? `<p class="mute" style="font-size:13px;margin-top:14px">${esc(APP)} checks every shop before it goes live. You'll be able to log in straight away and see when you're approved.</p>` : `<div class="btns"><button class="btn" id="forgot" type="button">Reset my password</button></div>`}
    <div class="card" style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span style="font-size:14px">Shopping for a phone?</span><a class="btn sm" style="background:#F2541B;color:#fff;border-color:#F2541B" href="${esc(STORE_URL)}" data-store-link>Go to the store</a></div>
    <p style="text-align:center;margin:12px 0 0"><a href="${esc(START_URL)}" data-start-link style="color:var(--mute);font-size:13px">← Back to start</a></p>
  ${CREDIT}</div>`;
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const em = $('#login-email').value.trim(), pw = $('#login-pass').value;
    if (!join) {
      const wait = Math.ceil((loginLock.until - Date.now()) / 1000);
      if (wait > 0) return toast(`Too many wrong tries. Try again in ${wait} seconds.`);
      try { await signInWithEmailAndPassword(auth, em, pw); loginLock.fails = 0; }
      catch (err) {
        loginLock.fails++;
        if (loginLock.fails >= 5) { loginLock.until = Date.now() + Math.min(15, 2 ** (loginLock.fails - 5)) * 60000; }
        toast(err.code === 'auth/too-many-requests' ? 'Too many tries on this account. Wait a few minutes or reset your password.' : 'Email or password is wrong');
      }
      return;
    }
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return toast('Use at least 8 characters with letters and numbers');
    if (pw !== $('#login-pass2').value) { $('#login-pass2').focus(); return toast("The two passwords don't match"); }
    const prof = {shopName: $('#j-shop').value.trim(), name: $('#j-name').value.trim(), address: $('#j-addr').value.trim(), city: $('#j-city').value.trim(), state: $('#j-state').value, phone: $('#j-phone').value.trim()};
    if (!prof.state) return toast('Choose your state');
    try {
      S.pendingProfile = prof;
      await createUserWithEmailAndPassword(auth, em, pw);
    } catch (err) { S.pendingProfile = null; toast(err.code === 'auth/email-already-in-use' ? 'That email already has an account. Log in instead.' : err.code === 'auth/weak-password' ? 'Password needs at least 6 characters' : "Couldn't create account: " + err.code); }
  };
  if (join) { const chk = () => { const a = $('#login-pass').value, b = $('#login-pass2').value, m = $('#pw-match'); m.textContent = !b ? '' : a === b ? '✓ Passwords match' : "Passwords don't match yet"; m.style.color = !b ? '' : a === b ? 'var(--green-ink)' : 'var(--red)'; }; $('#login-pass').oninput = chk; $('#login-pass2').oninput = chk; }
  if (!join) $('#forgot').onclick = async () => { const em = $('#login-email').value.trim(); if (!em) return toast('Type your email first'); try { await sendPasswordResetEmail(auth, em); toast('Reset link sent to ' + em); } catch { toast("Couldn't send the reset email"); } };
}
async function createMember(prof) {
  const clean = {shopName: (prof.shopName || '').slice(0, 60), name: (prof.name || '').slice(0, 60), phone: (prof.phone || '').slice(0, 20), address: (prof.address || '').slice(0, 120), city: (prof.city || '').slice(0, 60), state: NG_STATES.includes(prof.state) ? prof.state : '', bio: (prof.bio || '').slice(0, 500), tiktok: (prof.tiktok || '').slice(0, 200), ...(prof.logo && LOGO_RE.test(prof.logo) ? {logo: prof.logo} : {})};
  await setDoc(doc(db, 'members', uid()), {...clean, status: 'pending', premiumUntil: 0, unlimited: false, createdAt: Date.now()});
  if (!S.user.emailVerified) { try { await sendEmailVerification(S.user); } catch (e) { console.error(e); } }
  boot(S.user);
}
function profileForm(isNew) {
  if (isNew && S.pendingProfile) { const p = S.pendingProfile; S.pendingProfile = null; return createMember(p).catch(dbErr); }
  const e = isNew ? {} : S.me;
  const html = `<h3>${isNew ? 'Tell us about your shop' : 'Your shop profile'}</h3>
    <label for="p-shop">Shop name</label><input id="p-shop" value="${esc(e.shopName)}" ${!isNew && !isOwner() ? `disabled title="Ask ${esc(APP)} to change your shop name"` : ''}>${!isNew && !isOwner() ? `<div class="mute" style="font-size:12.5px;margin-top:4px">To change your shop name, message ${esc(APP)}. This stops shops pretending to be each other.</div>` : ''}
    <label for="p-logo">Shop logo (optional)</label><div class="logo-pick"><div class="av av-lg" id="p-logo-prev" aria-hidden="true">${avInner(e, e.shopName || 'Shop')}</div><div style="flex:1;min-width:0"><input id="p-logo" type="file" accept="image/*"><div class="mute" style="font-size:12.5px;margin-top:4px">A square picture works best. It shows on your posts, your profile and your store listings.</div>${e.logo ? '<button type="button" class="btn sm" data-a="dropLogo" style="margin-top:6px">Remove logo</button>' : ''}</div></div>
    <label for="p-name">Your name</label><input id="p-name" value="${esc(e.name)}">
    <div class="row"><div><label for="p-addr">Market or address</label><input id="p-addr" value="${esc(e.address)}"></div><div><label for="p-city">City</label><input id="p-city" value="${esc(e.city)}"></div></div>
    <label for="p-state">State</label><select id="p-state">${stateOpts(e.state)}</select>
    <label for="p-phone">WhatsApp number</label><input id="p-phone" inputmode="tel" value="${esc(e.phone)}">
    <label for="p-tiktok">TikTok page (optional)</label><input id="p-tiktok" inputmode="url" value="${esc(e.tiktok)}" placeholder="https://www.tiktok.com/@yourshop">
    <label for="p-bio">About your shop</label><textarea id="p-bio" placeholder="UK used and new iPhones, swaps welcome">${esc(e.bio)}</textarea>
    <div class="btns">${isNew ? '<button class="btn" data-a="logout">Log out</button>' : '<button class="btn" data-a="close">Cancel</button>'}<button class="btn pri" data-a="saveProfile" data-id="${isNew ? 'new' : ''}">${isNew ? 'Continue' : 'Save profile'}</button></div>`;
  S.draftLogo = undefined;
  if (isNew) $('#app').innerHTML = `<div class="center">${html}${CREDIT}</div>`; else openSheet(html);
}
function verifyGate() {
  $('#app').innerHTML = `<div class="center"><h1 class="brand">Check your email</h1>
    <div class="notice">We sent a link to <b>${esc(S.user.email)}</b>. Open it to confirm your email, then come back and tap <b>I've confirmed</b>. This keeps fake and robot accounts out of ${esc(APP)}.</div>
    <p class="mute" style="font-size:13.5px">Can't find it? Look in Spam or Promotions.</p>
    <div class="btns"><button class="btn pri" id="vdone">I've confirmed</button></div>
    <div class="btns"><button class="btn" id="vsend">Send the link again</button><button class="btn" data-a="logout">Log out</button></div>${CREDIT}</div>`;
  $('#vdone').onclick = async () => { try { await reload(S.user); await S.user.getIdToken(true); } catch {} if (auth.currentUser?.emailVerified) boot(auth.currentUser); else toast("Not confirmed yet. Open the link in the email first."); };
  $('#vsend').onclick = async () => { try { await sendEmailVerification(S.user); toast('Link sent to ' + S.user.email); } catch (e) { toast(e?.code === 'auth/too-many-requests' ? 'Please wait a few minutes before asking again' : "Couldn't send the email"); } };
}
function gateView() {
  const st = S.me?.status;
  $('#app').innerHTML = `<div class="center"><h1 class="brand">${esc(S.me?.shopName)}</h1>
    ${st === 'suspended' ? `<div class="alert">This account is suspended. Contact ${esc(APP)} if you think this is a mistake.</div>`
      : `<div class="notice"><b>Application received.</b> ${esc(APP)} checks every shop before approval. This page opens automatically once you're approved.</div>`}
    ${OWNER_PHONE ? `<div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(OWNER_PHONE, `Hello, I applied to join ${APP}. Shop: ${S.me?.shopName}, ${S.me?.address}, ${S.me?.city}.`)}">Message ${esc(APP)} on WhatsApp</a></div>` : ''}
    <div class="btns"><button class="btn" data-a="logout">Log out</button></div>${CREDIT}</div>`;
}

// ================= shell =================
const ICONS = {
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 10v4l11 5V5z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M7 14.5 8.5 20h2.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 5.5h3"/></svg>',
  moves: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
};
const TAB_OF = {feed: 'feed', home: 'home', stock: 'stock', moves: 'moves', me: 'me', partners: 'me', reports: 'me', admin: 'me', vreports: 'me', escrow: 'me', security: 'me', listings: 'me', orders: 'me'};
const TITLES = {feed: 'Broadcast', home: 'Today', stock: 'Stock', moves: 'Deals', me: 'Me', partners: 'Partners', reports: 'Reports', admin: 'Members', vreports: 'Vendor reports', escrow: 'Middleman deals', security: 'Security', listings: 'My store listings', orders: 'Store orders'};
function render() {
  if (!S.started || !S.me) return;
  ensureRatings(S.posts.map(p => p.authorId).concat(S.view === 'partners' ? activeMembers().map(m => m.id) : []));
  const action = Object.values(S.moves).filter(needsMe).length;
  const pending = (isOwner() ? Object.values(S.members).filter(m => m.status === 'pending').length + openReports().length + openSite().length : 0) + Object.values(S.escrows).filter(escNeedsMe).length + Object.values(S.orders).filter(ordNeedsMe).length;
  const keepQ = $('#q') && document.activeElement === $('#q');
  const searchable = ['feed', 'home', 'stock', 'moves', 'partners', 'admin', 'vreports'].includes(S.view);
  const fab = {feed: ['compose', 'Post'], stock: ['addDev', 'Add iPhone'], home: ['collect', 'Record a deal'], moves: ['collect', 'Record a deal']}[S.view];
  $('#app').innerHTML = `<header><div class="hrow"><div><h1 class="brand">${S.view === 'feed' ? '<img class="hlogo" src="logo-mark.svg" alt="">' + esc(APP) : esc(TITLES[S.view])}</h1>
    <div class="who">${esc(S.me?.shopName || '')}${isOwner() ? ', platform owner' : isPremium(S.me) ? ', Premium' : ''}</div></div>
    <div style="display:flex;gap:8px;align-items:center">${['partners', 'reports', 'admin', 'vreports', 'escrow', 'security', 'listings', 'orders'].includes(S.view) ? '<button class="small-btn" data-tab="me">Back</button>' : ''}
    <button class="small-btn" data-a="notifs" aria-label="Notifications" style="position:relative;padding:7px 9px;line-height:0">${BELL}${(() => { const n = notifs().filter(x => x.unread).length; return n ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:99px;font-size:10.5px;font-weight:700;padding:1px 6px;line-height:1.5">${n > 99 ? '99+' : n}</span>` : ''; })()}</button></div></div>
    ${searchable ? `<input class="search" id="q" type="search" placeholder="${S.view === 'feed' ? 'Search posts: model, shop, city' : S.view === 'admin' ? 'Search members' : S.view === 'vreports' ? 'Search reports' : S.view === 'partners' ? 'Search shops' : 'Search model, IMEI, partner'}" value="${esc(S.q)}" autocomplete="off" aria-label="Search">` : ''}</header>
    <main id="main">${views[S.view]()}${CREDIT}</main>
    ${fab ? `<button class="fab" data-a="${fab[0]}">+ ${fab[1]}</button>` : ''}
    <nav>${[['feed', 'Broadcast'], ['home', 'Today'], ['stock', 'Stock'], ['moves', 'Deals'], ['me', 'Me']].map(([k, l]) => `<button data-tab="${k}" class="${TAB_OF[S.view] === k ? 'on' : ''}" aria-label="${l}">${ICONS[k]}${l}${k === 'home' && action ? `<span class="dot">${action}</span>` : ''}${k === 'me' && pending ? `<span class="dot">${pending}</span>` : ''}</button>`).join('')}</nav>`;
  try { popupCheck(); } catch (e) { console.error(e); }
  const q = $('#q');
  if (q) { q.oninput = e => { S.q = e.target.value.trim().toLowerCase(); $('#main').innerHTML = views[S.view]() + CREDIT; }; if (keepQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
const views = { feed: feedView, home: homeView, stock: stockView, moves: movesView, me: meView, partners: partnersView, reports: reportsView, admin: adminView, vreports: vendorReportsView, escrow: escrowView, security: securityView, listings: listingsView, orders: ordersView };
const perf = '<div class="perf"><i></i><i></i></div>';

// ================= broadcast feed =================
function quotaPill() {
  if (unlimited()) return `<span class="quota prem">${isOwner() ? 'Owner' : 'Unlimited'}</span>`;
  const l = postsLeft();
  return `<span class="quota ${l ? 'g' : 'rd'}">${l} of ${FREE} left today</span>`;
}
function postCard(p, full) {
  const a = member(p.authorId), prem = isPremium(a) || a.unlimited, mine = p.authorId === uid();
  const T = TYPES[p.type] || TYPES.news;
  const phone = a.phone || p.phone;
  return `<article class="post ${prem ? 'premium' : ''} ${p.status === 'sold' ? 'sold' : ''}" data-post="${esc(p.id)}">
    <div class="post-h"><div class="av ${prem ? 'gold' : ''} who-link" data-member="${esc(p.authorId)}" aria-hidden="true">${avInner(member(p.authorId), p.shopName)}</div>
      <div style="min-width:0;flex:1"><div class="nm"><span class="who-link" data-member="${esc(p.authorId)}">${esc(p.shopName)}</span> ${a.status === 'active' ? TICK : ''}${prem ? '<span class="tag prem" style="margin:0">Premium</span>' : ''}${starsInline(p.authorId)}</div>
      <div class="sb">${esc(place(a.address || '', a.city || p.city || '', a.state || p.state || ''))}${a.address || a.city || p.city || a.state || p.state ? ', ' : ''}${ago(p.createdAt)}</div></div>
      <span class="type ${T[1]}">${p.status === 'sold' ? 'SOLD' : T[0]}</span></div>
    ${p.text ? `<div class="post-body">${esc(full || p.text.length < 280 ? p.text : p.text.slice(0, 260) + '…')}</div>` : ''}
    ${p.model || p.price ? `<div class="post-spec">${p.model ? `<span class="spec">${esc(p.model)}${p.storage ? ' ' + esc(p.storage) : ''}</span>` : ''}${p.condition ? `<span class="spec">${esc(p.condition)}</span>` : ''}${p.parts ? `<span class="spec">${esc(p.parts)}</span>` : ''}${p.face ? `<span class="spec">Face ID: ${esc(p.face)}</span>` : ''}${p.price ? `<span class="post-price">${naira(p.price)}</span>` : ''}</div>` : ''}
    ${p.photo ? `<img class="post-photo" src="${esc(p.photo)}" alt="${esc(p.model || 'Photo')}" loading="lazy">` : ''}
    ${p.video ? videoBlock(p.video, full) : ''}
    <div class="post-f">
      ${!mine && phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(phone, `Hello ${p.shopName}, I saw your post on ${APP}: ${p.model || (p.text || '').slice(0, 60)}${p.price ? ' at ' + naira(p.price) : ''}. `)}">WhatsApp</a><a class="btn" href="${telLink(phone)}">Call</a>` : ''}
      ${full ? '' : `<button class="btn" data-a="openPost" data-id="${esc(p.id)}">Comments${p.commentCount ? ' ' + p.commentCount : ''}</button>`}
      ${mine && p.status !== 'sold' && p.type === 'sell' ? `<button class="btn" data-a="postSold" data-id="${esc(p.id)}">Mark sold</button>` : ''}
      ${full && MIDDLEMAN_ON && !mine && p.type === 'sell' && p.status !== 'sold' ? `<button class="btn gold" data-a="escrowForm" data-id="${esc(p.authorId)}" data-post="${esc(p.id)}">Buy with middleman</button>` : ''}
      ${mine || isOwner() ? `<button class="btn red" data-a="postDelAsk" data-id="${esc(p.id)}">Delete</button>` : ''}
    </div></article>`;
}
function feedView() {
  const types = {all: 'All', sell: 'Selling', buy: 'Looking for', swap: 'Swap', news: 'Info'};
  let list = S.posts.filter(p => S.feedType === 'all' || p.type === S.feedType);
  if (S.feedState) list = list.filter(p => (p.state || member(p.authorId).state || '') === S.feedState);
  if (S.q) list = list.filter(p => [p.text, p.model, p.shopName, p.condition, p.parts, p.state, member(p.authorId).city, member(p.authorId).state, member(p.authorId).address].join(' ').toLowerCase().includes(S.q));
  return `<button class="compose-bar" data-a="compose"><div class="av ${isPremium(S.me) || S.me?.unlimited ? 'gold' : ''}">${avInner(S.me, S.me?.shopName)}</div><span>What are you selling or looking for?</span>${quotaPill()}</button>
    ${S.q ? '' : soldStrip()}
    <div class="chips" style="margin-top:12px">${Object.entries(types).map(([k, l]) => `<button class="chip ${S.feedType === k ? 'on' : ''}" data-ft="${k}">${l}</button>`).join('')}</div>
    <div class="state-filter"><label for="feed-state">Location</label><select id="feed-state">${stateOpts(S.feedState || '', 'All states')}</select></div>
    ${S.me && !S.me.state ? '<button class="card click" data-a="editProfile" style="margin-top:10px"><b>Add your state</b><div class="mute" style="font-size:13px">So dealers and buyers searching your state can find you.</div></button>' : ''}
    <div style="margin-top:12px">${!S.posts.length && S.feedType === 'all' && !S.q && !S.feedState ? examplesBlock('feed') : ''}${list.map(p => postCard(p)).join('') || (!S.posts.length ? '' : `<div class="empty"><b>${S.posts.length ? 'No posts match' : 'No broadcasts yet'}</b>${S.posts.length ? 'Try another filter or search.' : 'Be the first: post a phone you have, or ask for one you need.'}</div>`)}</div>
    ${S.posts.length >= S.postLimit ? '<div class="btns"><button class="btn" data-a="morePosts">Show older posts</button></div>' : ''}`;
}
function composeForm(prefill = {}) {
  if (!isOwner() && S.settings.postingOpen === false) return toast(`Posting is paused by ${APP} for now. Try again later.`);
  if (!unlimited() && postsLeft() <= 0) return premiumSheet(true);
  const p = {type: 'sell', ...prefill};
  openSheet(`<h3>New broadcast</h3><div class="hint">${unlimited() ? 'You can post as much as you like.' : `You have <b>${postsLeft()} of ${FREE}</b> free posts left today. They reset at midnight.`}</div>
    <div class="typepick">${Object.entries(TYPES).map(([k, [l]]) => `<span><input type="radio" name="ptype" id="pt-${k}" value="${k}" ${p.type === k ? 'checked' : ''}><label for="pt-${k}">${l}</label></span>`).join('')}</div>
    ${modelField('c-model', p.model || '')}
    <div class="row"><div><label for="c-storage">Storage</label><select id="c-storage">${STORAGES.map(s => `<option ${p.storage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div><label for="c-cond">Condition</label><select id="c-cond"><option value="">—</option>${CONDITIONS.map(s => `<option ${p.condition === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
    <label for="c-price">Price (₦)</label><input id="c-price" inputmode="numeric" value="${esc(p.price || '')}" placeholder="Optional">
    ${partsFields(p, 'c')}
    <label for="c-text">Details</label><textarea id="c-text" maxlength="1000" placeholder="Colour, battery health, Face ID, what comes with it, swap terms…">${esc(p.text)}</textarea>
    <label for="c-video">TikTok video link (optional)</label><input id="c-video" inputmode="url" placeholder="https://www.tiktok.com/@yourshop/video/…" value="${esc(p.video || '')}">
    <label for="c-photo">Photo</label><input id="c-photo" type="file" accept="image/*"><div class="photo-prev" id="c-prev" hidden><img alt="Photo preview"><div class="btns"><button class="btn sm" data-a="dropPhoto" type="button">Remove photo</button></div></div>
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="publish">Post it</button></div>`);
  S.draftPhoto = null;
}
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight, max = 900;
    if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h > max) { w = Math.round(w * max / h); h = max; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    let q = .72, out = c.toDataURL('image/jpeg', q);
    while (out.length > 240000 && q > .3) { q -= .1; out = c.toDataURL('image/jpeg', q); }
    if (out.length > 250000) { const c2 = document.createElement('canvas'); c2.width = w / 1.6; c2.height = h / 1.6; c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); out = c2.toDataURL('image/jpeg', .6); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
document.addEventListener('change', async e => {
  if (e.target.id === 'c-photo' && e.target.files?.[0]) {
    try { S.draftPhoto = await shrinkImage(e.target.files[0]); const pv = $('#c-prev'); pv.hidden = false; pv.querySelector('img').src = S.draftPhoto; }
    catch { toast("Couldn't read that photo. Try another one."); }
  }
  if (e.target.classList?.contains('model-sel')) { const o = $('#' + e.target.id + '-other'); if (o) { o.hidden = e.target.value !== '__other'; if (!o.hidden) o.focus(); } }
  if (e.target.id === 'p-logo' && e.target.files?.[0]) {
    try { S.draftLogo = await shrinkLogo(e.target.files[0]); const pv = $('#p-logo-prev'); if (pv) pv.innerHTML = `<img src="${S.draftLogo}" alt="">`; }
    catch { toast("Couldn't read that picture. Try another one."); }
  }
  if (e.target.id === 's-swap') { const b = $('#swapBox'); if (b) b.hidden = !e.target.checked; }
  if (e.target.name === 'np') { const b = $('#alertBox'); if (b) b.hidden = e.target.value !== 'alerts'; }
  if (e.target.id === 'feed-state' || e.target.id === 'mem-state') { S[e.target.id === 'feed-state' ? 'feedState' : 'memState'] = e.target.value; $('#main').innerHTML = views[S.view]() + CREDIT; }
});
function publish() {
  const type = sheet.querySelector('input[name=ptype]:checked')?.value || 'sell';
  const text = val('c-text').slice(0, 1000), model = readModel('c-model'), price = Math.min(num(val('c-price')), 1e9);
  if (!text && !model) return toast('Add a model or some details');
  const vraw = val('c-video'), video = vraw ? tiktokUrl(vraw) : '';
  if (vraw && !video) return toast('That isn\'t a TikTok link. Copy it from TikTok → Share → Copy link.');
  if (!unlimited() && postsLeft() <= 0) return premiumSheet(true);
  return guard(async () => {
    const id = rid(), b = writeBatch(db);
    const post = {authorId: uid(), shopName: S.me.shopName, phone: S.me.phone || '', city: S.me.city || '', state: S.me.state || '', type, text, model, storage: val('c-storage'), condition: val('c-cond'), parts: readParts('c').partsInfo, face: readParts('c').face, price, status: 'open', commentCount: 0, createdAt: Date.now()};
    if (S.draftPhoto) post.photo = S.draftPhoto;
    if (video) post.video = video;
    b.set(doc(db, 'posts', id), post);
    if (!unlimited()) { const q = S.quota, d = dayNum(); b.set(doc(db, 'quota', uid()), {day: d, count: q && q.day === d ? q.count + 1 : 1, last: id}); }
    await b.commit();
    S.draftPhoto = null; S.view = 'feed'; S.feedType = 'all'; render(); scrollTo(0, 0);
    const share = `📱 ${(TYPES[type] || TYPES.news)[0]}: ${[model, val('c-storage'), val('c-cond'), readParts('c').partsInfo, readParts('c').face].filter(Boolean).join(' ')}${price ? ' — ' + naira(price) : ''}\n${text}\n\n${S.me.shopName}${S.me.phone ? ', ' + S.me.phone : ''}${S.me.city ? ', ' + S.me.city : ''}${S.me.state ? ', ' + S.me.state : ''}`;
    openSheet(`<h3>Posted ✓</h3><div class="hint">${unlimited() ? 'Your broadcast is live.' : `Your broadcast is live. ${postsLeft()} free post${postsLeft() === 1 ? '' : 's'} left today.`} Members who chose alerts for this get notified.</div>
      <p style="font-size:14px">Want more eyes on it? Share it to your WhatsApp groups and status too.</p>
      <div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(share)}">Share on WhatsApp</a><button class="btn" data-a="close">Done</button></div>`);
  });
}
function premiumSheet(limitHit) {
  openSheet(`<h3>${limitHit ? "You've used today's free posts" : 'Go Premium'}</h3>
    ${limitHit ? `<div class="hint">Free members get ${FREE} broadcasts a day. They reset at midnight.</div>` : ''}
    <div class="premium-card"><h4>Premium</h4><div style="font-size:14px">Price: ${esc(PREMIUM_PRICE)}</div>
      <ul><li>Unlimited broadcasts every day</li><li>Gold border on your posts, so buyers notice them first</li><li>Premium badge on your shop name</li></ul></div>
    <div class="hint" style="white-space:pre-line"><b>How to pay</b>\n${esc(PAYMENT_DETAILS)}\n\nSend the payment proof on WhatsApp and we'll switch Premium on.</div>
    <div class="btns">${OWNER_PHONE ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(OWNER_PHONE, `Hello, I want Premium on ${APP}. Shop: ${S.me?.shopName}. Please send me the price and account details.`)}">Ask about Premium on WhatsApp</a>` : ''}<button class="btn" data-a="close">Close</button></div>`);
}
let postCommentsUnsub = null, openPostId = null;
function openPost(id) {
  const p = S.posts.find(x => x.id === id); if (!p) return;
  openPostId = id;
  openSheet(`<div id="pp">${postCard(p, true)}</div><h2>Comments</h2><div id="cmts"><p class="mute">Loading comments…</p></div>
    <label for="cm-text">Add a comment</label><textarea id="cm-text" maxlength="500" placeholder="Ask about price, condition, location…"></textarea>
    <div class="btns"><button class="btn" data-a="close">Close</button><button class="btn pri" data-a="comment" data-id="${esc(id)}">Comment</button></div>
    ${p.authorId !== uid() ? `<div class="btns"><button class="btn sm red" data-a="reportForm" data-id="${esc(p.authorId)}" data-post="${esc(id)}">Report this post</button></div>` : ''}`);
  if (postCommentsUnsub) postCommentsUnsub();
  postCommentsUnsub = onSnapshot(query(collection(db, 'posts', id, 'comments'), orderBy('createdAt', 'asc')), s => {
    const el = $('#cmts'); if (!el || openPostId !== id) return;
    const a = []; s.forEach(d => a.push({id: d.id, ...d.data()}));
    el.innerHTML = a.length ? a.map(c => `<div class="cmt"><div class="av ${isPremium(member(c.authorId)) ? 'gold' : ''}">${avInner(member(c.authorId), c.shopName)}</div><div style="flex:1;min-width:0"><b>${esc(c.shopName)}</b> <span class="mute" style="font-size:12.5px">${ago(c.createdAt)}</span><p>${esc(c.text)}</p>
      ${c.authorId === uid() || p.authorId === uid() || isOwner() ? `<button class="small-btn" style="margin-top:6px" data-a="delComment" data-id="${esc(id)}" data-cid="${esc(c.id)}">Delete</button>` : ''}</div></div>`).join('') : '<p class="mute">No comments yet. Ask a question or make an offer.</p>';
  }, () => { const el = $('#cmts'); if (el) el.innerHTML = '<p class="mute">Couldn\'t load comments.</p>'; });
}
function refreshOpenPost() { if (!openPostId || !bg.classList.contains('open')) return; const p = S.posts.find(x => x.id === openPostId), el = $('#pp'); if (p && el) el.innerHTML = postCard(p, true); }
function comment(id) {
  const text = val('cm-text'); if (!text) return toast('Write a comment first');
  const p = S.posts.find(x => x.id === id); if (!p) return;
  if (!capGuard('comments')) return;
  return guard(async () => {
    const b = writeBatch(db);
    b.set(doc(db, 'posts', id, 'comments', rid()), {authorId: uid(), shopName: S.me.shopName, text, createdAt: Date.now()});
    bumpLimit(b, 'comments');
    b.update(doc(db, 'posts', id), {commentCount: (p.commentCount || 0) + 1});
    await b.commit(); sheet.querySelector('#cm-text').value = '';
  });
}
function delComment(id, cid) {
  const p = S.posts.find(x => x.id === id);
  return guard(async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'posts', id, 'comments', cid));
    if (p && p.commentCount > 0) b.update(doc(db, 'posts', id), {commentCount: p.commentCount - 1});
    await b.commit();
  });
}

// ================= today =================
function homeView() {
  const D = Object.values(S.devices), M = Object.values(S.moves);
  if (S.q) { const r = moveList(movesArr()) + devList(D.filter(d => matchQ(devText(d)))); return '<h2>Search results</h2>' + (r || '<div class="empty">Nothing matches that search.</div>'); }
  const stock = D.filter(d => devState(d) === 'stock');
  const gaveOut = M.filter(m => iOwn(m) && OPEN.includes(m.status));
  const holding = M.filter(m => iHold(m) && OPEN.includes(m.status));
  const over = M.filter(overdue);
  const slow = stock.filter(d => daysSince(d.added) >= SLOW_DAYS);
  const owedToMe = M.filter(iOwn).reduce((s, m) => s + owed(m), 0) + D.reduce((s, d) => s + devOwed(d), 0);
  const outVal = gaveOut.reduce((s, m) => s + num(m.price), 0);
  const iOwe = M.filter(iHold).reduce((s, m) => s + owed(m), 0);
  const month = todayISO().slice(0, 7), sm = salesList().filter(x => (x.date || '').startsWith(month));
  const salesVal = sm.reduce((s, x) => s + x.revenue, 0);
  const action = sortMoves(M.filter(needsMe));
  if (!D.length && !M.length) return `<div class="empty" style="margin-top:12px"><b>Your private tracker</b>Only you can see your stock. Add your phones in <b>Stock</b>. When you give a phone to another member, open it and tap <b>Give to a partner</b>; they confirm on their phone. When you collect one from them, tap <b>Record a deal</b>.</div>`;
  let h = `<section class="slip" aria-label="Money position"><div class="lab">Your money outside with partners</div>
    <div class="big">${naira(owedToMe + outVal)}</div><div class="note">${naira(outVal)} in phones they're holding, plus ${naira(owedToMe)} unpaid</div>${perf}
    <div class="halves"><div><span class="lab">Sales this month</span><b>${naira(salesVal)}</b><span class="note">${sm.length} sold</span></div>
    <div><span class="lab">You owe partners</span><b>${naira(iOwe)}</b><span class="note">${holding.length} of their phones with you</span></div></div></section>
    <div class="tiles"><button class="tile" data-tab="stock"><b>${stock.length}</b><span>In stock</span></button>
      <button class="tile" data-goto="moves:open"><b>${gaveOut.length}</b><span>With partners</span></button>
      <button class="tile ${over.length ? 'bad' : ''}" data-goto="moves:overdue"><b>${over.length}</b><span>Overdue</span></button></div>`;
  if (action.length) h += `<h2>Waiting on you <small>${action.length}</small></h2>` + moveList(action);
  if (over.length) h += `<h2>Overdue <small>chase these today</small></h2>` + moveList(sortMoves(over));
  if (holding.length) h += `<h2>Partners' phones you're holding</h2>` + moveList(sortMoves(holding));
  if (slow.length) h += `<h2>Slow movers <small>${SLOW_DAYS}+ days in stock</small></h2>` + devList(slow.sort((a, b) => (a.added || '').localeCompare(b.added || '')).slice(0, 5));
  if (!action.length && !over.length) h += `<div class="notice" style="margin-top:18px">All clear. Nothing is waiting on you and nothing is overdue.</div>`;
  return h;
}
function movesView() {
  const all = movesArr();
  const F = {open: ['Open', m => OPEN.includes(m.status)], unpaid: ['Unpaid', m => owed(m) > 0], overdue: ['Overdue', overdue], done: ['Closed', isClosed], all: ['All', () => true]};
  if (!F[S.filter]) S.filter = 'open';
  return `<div class="chips">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <h2>${F[S.filter][0]} deals</h2>` + (!all.length ? examplesBlock('moves') : moveList(all.filter(F[S.filter][1])) || '<div class="empty">No deals here.</div>');
}

// ================= stock =================
function devItem(d) {
  const st = devState(d), m = openMoveFor(d.id);
  let tag = '<span class="tag g">In stock</span>', sub = d.imei ? 'IMEI ends ' + esc(d.imei.slice(-6)) : esc(d.condition || ''), price = short(num(d.price)), cls = 'in';
  const age = daysSince(d.added);
  if (st === 'stock' && age >= SLOW_DAYS) tag = `<span class="tag o">${age} days</span>`;
  if (st === 'out') { cls = 'out'; tag = m.status === 'pending' ? '<span class="tag y">Awaiting partner</span>' : overdue(m) ? '<span class="tag rd">Overdue</span>' : '<span class="tag b">With partner</span>'; sub = esc(otherName(m)) + ', due ' + fmtShort(m.due); price = short(m.price); }
  if (st === 'soldPartner') { cls = 'done'; tag = owed(m) ? `<span class="tag o">${short(owed(m))} owed</span>` : '<span class="tag v">Sold</span>'; sub = 'Sold by ' + esc(otherName(m)); price = short(m.price); }
  if (st === 'sold') { cls = 'done'; tag = devOwed(d) ? `<span class="tag o">${short(devOwed(d))} owed</span>` : '<span class="tag v">Sold</span>'; sub = 'Sold ' + fmtShort(d.sale.date) + (d.sale.to ? ' to ' + esc(d.sale.to) : ''); price = short(d.sale.amount); }
  return `<button class="item" data-dev="${esc(d.id)}"><span class="glyph ${cls}"></span><span style="min-width:0"><div class="t">${esc(devName(d))}</div><div class="m">${sub}</div></span><span class="r"><div class="p">${price}</div>${tag}</span></button>`;
}
const devList = arr => arr.length ? `<div class="list">${arr.map(devItem).join('')}</div>` : '';
function stockView() {
  const D = Object.values(S.devices).filter(d => matchQ(devText(d))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const F = {stock: 'In stock', out: 'With partners', sold: 'Sold', all: 'All'};
  if (!F[S.filter]) S.filter = 'stock';
  const is = (d, k) => { const s = devState(d); return k === 'all' || (k === 'stock' && s === 'stock') || (k === 'out' && s === 'out') || (k === 'sold' && (s === 'sold' || s === 'soldPartner')); };
  const inStock = D.filter(d => is(d, 'stock'));
  return `<div class="chips">${Object.entries(F).map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-f="${k}">${l} ${D.filter(d => is(d, k)).length}</button>`).join('')}</div>
    ${S.filter === 'stock' && inStock.length ? `<div class="btns"><button class="btn" data-a="priceList">Share price list</button></div>` : ''}
    <h2>${F[S.filter]} <small>${S.filter === 'stock' ? 'worth ' + naira(inStock.reduce((s, d) => s + num(d.price), 0)) : ''}</small></h2>`
    + (!Object.keys(S.devices).length && !S.q ? examplesBlock('stock') : '')
    + (devList(D.filter(d => is(d, S.filter))) || (!Object.keys(S.devices).length && !S.q ? '' : `<div class="empty">${S.filter === 'stock' ? '<b>No phones in stock</b>Tap <b>Add iPhone</b> to record one. Only you can see your stock.' : 'Nothing here yet.'}</div>`));
}
function priceListText() {
  const items = Object.values(S.devices).filter(d => devState(d) === 'stock').sort((a, b) => num(b.price) - num(a.price));
  return `📱 Available now at ${S.me.shopName}\n\n` + items.map(d => `• ${devName(d)}${d.condition ? ', ' + d.condition : ''}${d.battery ? ', battery ' + d.battery + '%' : ''}${partsText(d) ? ', ' + partsText(d) : ''}: ${d.price ? naira(d.price) : 'call for price'}`).join('\n') + `\n\n${S.me.phone ? 'Call or WhatsApp ' + S.me.phone : ''}${S.me.address ? '\n' + S.me.address + (S.me.city ? ', ' + S.me.city : '') : ''}`;
}

// ================= me / partners / reports / admin =================
function meView() {
  const m = S.me, prem = isPremium(m);
  const pending = isOwner() ? Object.values(S.members).filter(x => x.status === 'pending').length : 0;
  const myReports = Object.values(S.reports).filter(r => r.reporterId === uid()).sort((a, b) => b.createdAt - a.createdAt);
  return `<div class="card" style="margin-top:6px"><div class="mrow"><div class="av ${prem || m.unlimited ? 'gold' : ''}" style="width:52px;height:52px;font-size:19px">${avInner(m, m.shopName)}</div>
    <div style="flex:1;min-width:0"><b style="font-family:var(--disp);font-size:20px">${esc(m.shopName)}</b> ${TICK}<div class="mute" style="font-size:13.5px">${esc(m.name)}, ${esc(place(m.address, m.city, m.state))}</div><div class="mute" style="font-size:13.5px">${esc(m.phone)}</div>${ratingOf(uid()).n ? `<div style="margin-top:4px">${starsInline(uid())}</div>` : ''}</div></div>
    <div class="btns"><button class="btn" data-a="editProfile">Edit profile</button><button class="btn" data-member="${esc(uid())}">My reviews${ratingOf(uid()).n ? ' ' + ratingOf(uid()).n : ''}</button></div></div>
    ${isOwner() ? `<button class="card click" data-tab="admin"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Members</b><div class="mute" style="font-size:13.5px">Approve shops, give Premium, suspend</div></div>${pending ? `<span class="tag rd">${pending} waiting</span>` : '<span style="font-size:20px">›</span>'}</div></button>
      <button class="card click" data-a="optionsForm"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Dropdown options</b><div class="mute" style="font-size:13.5px">Edit the Parts and Face ID choices</div></div><span style="font-size:20px">›</span></div></button>
      <button class="card click" data-tab="security"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Security</b><div class="mute" style="font-size:13.5px">Emergency switches and safety checklist</div></div>${S.settings.joinsOpen === false || S.settings.postingOpen === false ? '<span class="tag rd">Lockdown on</span>' : '<span style="font-size:20px">›</span>'}</div></button>
      <button class="card click" data-tab="vreports"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Vendor reports</b><div class="mute" style="font-size:13.5px">Complaints members sent about shops</div></div>${openReports().length + openSite().length ? `<span class="tag rd">${openReports().length + openSite().length} open</span>` : '<span style="font-size:20px">›</span>'}</div></button>`
      : prem ? `<div class="premium-card"><h4>Premium</h4>Active until ${fmtDate(dayToIso(m.premiumUntil))}. Unlimited broadcasts and gold posts.<div class="btns"><button class="btn gold" data-a="premium">Renew</button></div></div>`
      : m.unlimited ? `<div class="premium-card"><h4>Unlimited posting</h4>Approved by ${esc(APP)}.</div>`
      : `<div class="premium-card"><h4>Free plan</h4>${postsLeft()} of ${FREE} broadcasts left today.<div class="btns"><button class="btn gold" data-a="premium">Go Premium</button></div></div>`}
    ${MIDDLEMAN_ON ? `<button class="card click" data-tab="escrow"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">${isOwner() ? 'Middleman desk' : 'Middleman deals'}</b><div class="mute" style="font-size:13.5px">${isOwner() ? 'Hold buyer payments, release to sellers, settle disputes' : `Buy and sell safely: ${esc(APP)} holds the money until the buyer confirms`}</div></div>${Object.values(S.escrows).filter(escNeedsMe).length ? `<span class="tag rd">${Object.values(S.escrows).filter(escNeedsMe).length} to do</span>` : '<span style="font-size:20px">›</span>'}</div></button>` : ''}
    <button class="card click" data-a="prefsForm"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Notifications</b><div class="mute" style="font-size:13.5px">${(() => { const pr = prefs(); return (pr.newPosts === 'off' ? 'New posts off' : pr.newPosts === 'alerts' ? 'Only posts matching your alerts' : 'Every new post') + (pr.push ? ', phone pop-ups on' : '') + (pr.wa && WA_ALERTS ? ', WhatsApp on' : ''); })()}</div></div><span style="font-size:20px">›</span></div></button>
    ${isOwner() ? `<button class="card click" data-a="digest"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">WhatsApp daily digest</b><div class="mute" style="font-size:13.5px">Today's listings, ready to post in your WhatsApp group</div></div><span style="font-size:20px">›</span></div></button>` : ''}
    <button class="card click" data-tab="orders"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Store orders</b><div class="mute" style="font-size:13.5px">${isOwner() ? 'Customer orders across all shops' : `Customers buying your phones in ${esc(STORE_NAME)}`}</div></div>${Object.values(S.orders).filter(ordNeedsMe).length ? `<span class="tag rd">${Object.values(S.orders).filter(ordNeedsMe).length} to do</span>` : '<span style="font-size:20px">›</span>'}</div></button>
    <button class="card click" data-tab="listings"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">My store listings</b><div class="mute" style="font-size:13.5px">${Object.values(S.listings).filter(l => l.status === 'live').length} live in the customer store, at your customer prices</div></div><span style="font-size:20px">›</span></div></button>
    <button class="card click" data-tab="partners"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Partners</b><div class="mute" style="font-size:13.5px">Shops you trade with, and the member directory</div></div><span style="font-size:20px">›</span></div></button>
    <button class="card click" data-tab="reports"><div class="ch"><div><b style="font-family:var(--disp);font-size:18px">Reports</b><div class="mute" style="font-size:13.5px">Sales by month, best sellers, export</div></div><span style="font-size:20px">›</span></div></button>
    ${!isOwner() && myReports.length ? `<h2>Your reports <small>only you and ${esc(APP)} see these</small></h2>` + myReports.map(r => `<div class="card"><div class="ch"><b>${esc(nameOf(r.vendorId))}</b>${r.status === 'open' ? '<span class="tag y">Being checked</span>' : '<span class="tag g">Resolved</span>'}</div><div class="mute" style="font-size:13px">${esc(REASONS[r.reason] || r.reason)}, ${ago(r.createdAt)}</div></div>`).join('') : ''}
    <div class="btns"><button class="btn" data-a="logout">Log out</button></div>`;
}
function partnersView() {
  const mine = new Set(Object.values(S.moves).map(otherId));
  const list = activeMembers().filter(m => m.id !== uid() && (!S.memState || m.state === S.memState) && matchQ([m.shopName, m.name, m.city, m.state, m.address, m.phone].join(' ')));
  const card = m => {
    const M = Object.values(S.moves).filter(x => otherId(x) === m.id);
    const theyOwe = M.filter(iOwn).reduce((t, x) => t + owed(x), 0), iOwe = M.filter(iHold).reduce((t, x) => t + owed(x), 0);
    const holding = M.filter(x => iOwn(x) && OPEN.includes(x.status)).length, sc = partnerScore(m.id);
    return `<button class="card click" data-member="${esc(m.id)}"><div class="mrow"><div class="av ${isPremium(m) ? 'gold' : ''}">${avInner(m, m.shopName)}</div><div style="flex:1;min-width:0"><b>${esc(m.shopName)}</b> ${isPremium(m) ? '<span class="tag prem" style="margin:0">Premium</span>' : ''} ${starsInline(m.id)}<div class="mute" style="font-size:13px">${esc(place(m.address, m.city, m.state))}</div></div>
      ${sc.fin ? `<div style="text-align:right"><span class="score" style="color:${sc.onTime / sc.fin >= .8 ? 'var(--green-ink)' : sc.onTime / sc.fin >= .5 ? 'var(--amber)' : 'var(--red)'}">${Math.round(sc.onTime / sc.fin * 100)}%</span><div class="mute" style="font-size:12px">on time</div></div>` : ''}</div>
      ${M.length ? `<div style="font-size:13.5px;margin-top:8px">Holding ${holding} of yours${theyOwe ? `. <span style="color:var(--amber);font-weight:700">Owes you ${naira(theyOwe)}</span>` : ''}${iOwe ? `. You owe ${naira(iOwe)}` : ''}</div>` : ''}</button>`;
  };
  const traded = list.filter(m => mine.has(m.id)), others = list.filter(m => !mine.has(m.id));
  return `<div class="state-filter"><label for="mem-state">Location</label><select id="mem-state">${stateOpts(S.memState || '', 'All states')}</select></div>` + (traded.length ? `<h2>Your partners <small>${traded.length}</small></h2>` + traded.map(card).join('') : '')
    + `<h2>All members <small>${others.length}</small></h2>` + (others.map(card).join('') || '<div class="empty">No other members yet.</div>');
}
function memberSheet(id) {
  const m = member(id); if (!m.id) return;
  ensureRatings([id]).then(n => { if (n && bg.classList.contains('open')) memberSheet(id); });
  const self = id === uid();
  const M = sortMoves(Object.values(S.moves).filter(x => otherId(x) === id)), sc = partnerScore(id);
  const R = ratingsFor(id), rt = ratingOf(id), mine = S.ratings[id + '_' + uid()];
  const dist = [5, 4, 3, 2, 1].map(n => [n, R.filter(r => r.stars === n).length]);
  openSheet(`<div class="mrow"><div class="av ${isPremium(m) ? 'gold' : ''}" style="width:52px;height:52px;font-size:19px">${avInner(m, m.shopName)}</div><div><h3 style="margin:0">${esc(m.shopName)} ${m.status === 'active' ? TICK : ''}</h3><div class="mute" style="font-size:13.5px">${esc(m.name)}, ${esc(place(m.address, m.city, m.state))}</div></div></div>
    ${m.bio ? `<p>${esc(m.bio)}</p>` : ''}${self && tiktokUrl(m.tiktok) ? `<div class="btns"><a class="btn tk sm" target="_blank" rel="noopener" href="${esc(tiktokUrl(m.tiktok))}">Your TikTok</a></div>` : ''}
    <div class="card" style="margin-top:12px"><div class="ch"><div><div style="font-family:var(--disp);font-weight:800;font-size:34px;letter-spacing:-.03em;line-height:1">${rt.n ? rt.avg.toFixed(1) : '–'}</div><div class="stars" style="font-size:16px">${rt.n ? starRow(Math.round(rt.avg)) : ''}</div><div class="mute" style="font-size:13px">${rt.n ? rt.n + ' review' + (rt.n === 1 ? '' : 's') : 'No reviews yet'}</div></div>
      <div style="flex:1;max-width:190px">${dist.map(([n, c]) => `<div style="display:grid;grid-template-columns:14px 1fr 22px;gap:6px;align-items:center;font-size:12px"><span>${n}</span><div class="hbar" style="margin:0;display:block"><div class="track" style="height:6px"><i style="width:${rt.n ? c / rt.n * 100 : 0}%;background:#C98A00"></i></div></div><span class="mute">${c}</span></div>`).join('')}</div></div></div>
    ${self ? '' : `<div class="btns"><button class="btn gold" data-a="rateForm" data-id="${esc(id)}">${mine ? 'Edit your review' : 'Rate this shop'}</button><button class="btn red" data-a="reportForm" data-id="${esc(id)}">Report shop</button></div>`}
    ${self ? '' : `<div class="kv"><div>Phone</div><div>${esc(m.phone || '—')}</div><div>Member since</div><div>${m.createdAt ? fmtDate(new Date(m.createdAt).toISOString().slice(0, 10)) : '—'}</div>${sc.fin ? `<div>Returned or paid you on time</div><div>${sc.onTime} of ${sc.fin}</div>` : ''}</div>
    <div class="btns">${m.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(m.phone, `Hello ${m.shopName}, `)}">WhatsApp</a><a class="btn" href="${telLink(m.phone)}">Call</a>` : ''}${tiktokUrl(m.tiktok) ? `<a class="btn tk" target="_blank" rel="noopener" href="${esc(tiktokUrl(m.tiktok))}">TikTok</a>` : ''}</div>
    ${MIDDLEMAN_ON ? `<div class="btns"><button class="btn gold" data-a="escrowForm" data-id="${esc(id)}">Buy from them with middleman</button></div>` : ''}
    <div class="btns"><button class="btn pri" data-a="collectFrom" data-id="${esc(id)}">I collected a phone from them</button>${M.some(x => iOwn(x) && (owed(x) > 0 || OPEN.includes(x.status))) ? `<button class="btn" data-a="statement" data-id="${esc(id)}">Send statement</button>` : ''}</div>`}
    <h2>Reviews <small>${rt.n}</small></h2>
    ${R.length ? R.slice(0, 20).map(r => `<div class="review"><div class="ch"><b>${esc(r.raterName)}</b><span class="stars">${starRow(r.stars)}</span></div>${r.text ? `<p>${esc(r.text)}</p>` : ''}<div class="mute" style="font-size:12px;margin-top:3px">${ago(r.updatedAt || r.createdAt)}${isOwner() && r.raterId !== uid() ? ` <button class="small-btn" style="margin-left:8px" data-a="delReview" data-id="${esc(r.id)}" data-v="${esc(id)}">Remove</button>` : ''}</div></div>`).join('') : `<p class="mute">${self ? 'When members rate your shop, their reviews show here.' : 'Be the first to review this shop.'}</p>`}
    ${!self && M.length ? `<h2>Your deals with ${esc(m.shopName)} <small>${M.length}</small></h2>` + moveList(M) : ''}
    <div class="btns"><button class="btn" data-a="close">Close</button></div>`);
}
function rateForm(vid) {
  const mine = S.ratings[vid + '_' + uid()];
  S.draftStars = mine?.stars || 0;
  openSheet(`<h3>Rate ${esc(nameOf(vid))}</h3><div class="hint">Be fair and honest. Your shop name shows with your review.</div>
    <div class="starpick" role="radiogroup" aria-label="Stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n <= S.draftStars}" aria-label="${n} star${n > 1 ? 's' : ''}" class="${n <= S.draftStars ? 'on' : ''}" data-a="pickStar" data-v="${n}">★</button>`).join('')}</div>
    <div class="mute" id="starword" style="font-size:13.5px;text-align:center;min-height:20px">${['', 'Very bad', 'Bad', 'Okay', 'Good', 'Excellent'][S.draftStars]}</div>
    <label for="rv-text">Review</label><textarea id="rv-text" maxlength="300" placeholder="How was dealing with them? Did they pay on time, were phones as described?">${esc(mine?.text || '')}</textarea>
    <div class="btns">${mine ? `<button class="btn red" data-a="delRating" data-id="${esc(vid)}">Delete my review</button>` : ''}<button class="btn" data-member="${esc(vid)}">Back</button><button class="btn pri" data-a="saveRating" data-id="${esc(vid)}">Save review</button></div>`);
}
function reportForm(vid, postId) {
  const p = postId ? S.posts.find(x => x.id === postId) : null;
  openSheet(`<h3>Report ${esc(nameOf(vid))}</h3><div class="hint">Only ${esc(APP)} sees this report. Your name is shared with ${esc(APP)} so they can follow up, never with the shop.</div>
    ${p ? `<div class="card" style="font-size:13.5px"><b>Post:</b> ${esc(p.model || '')} ${esc((p.text || '').slice(0, 120))}</div>` : ''}
    <div class="reasons" role="radiogroup">${Object.entries(REASONS).map(([k, l]) => `<label><input type="radio" name="rreason" value="${k}">${esc(l)}</label>`).join('')}</div>
    <label for="rp-text">What happened?</label><textarea id="rp-text" maxlength="1000" placeholder="Dates, amounts, phone model and IMEI help us check quickly."></textarea>
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn red" style="border-color:var(--red)" data-a="sendReport" data-id="${esc(vid)}" data-post="${esc(postId || '')}">Send report</button></div>`);
}
function escrowView() {
  const all = Object.values(S.escrows).filter(e => matchQ([e.item, nameOf(e.buyerId), nameOf(e.sellerId)].join(' ')));
  const F = {todo: ['To do', escNeedsMe], open: ['Open', escOpen], done: ['Finished', e => !escOpen(e)], all: ['All', () => true]};
  if (!F[S.escFilter]) S.escFilter = 'open';
  const list = all.filter(F[S.escFilter][1]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const held = Object.values(S.escrows).filter(e => ['paid', 'delivered', 'received', 'disputed'].includes(e.status)).reduce((t, e) => t + num(e.amount) + num(e.fee), 0);
  const earned = Object.values(S.escrows).filter(e => e.status === 'released').reduce((t, e) => t + num(e.fee), 0);
  return `<div class="notice">${isOwner() ? `You are the middleman. Buyers pay you, you release to sellers after the buyer confirms. Fee: ${FEE_PCT}% (minimum ${naira(FEE_MIN)}), paid by the buyer.` : `${esc(APP)} holds the buyer's money until the buyer confirms the phone is fine, then pays the seller. Fee: ${FEE_PCT}% (minimum ${naira(FEE_MIN)}), paid by the buyer.`}</div>
    ${isOwner() ? `<div class="tiles" style="grid-template-columns:1fr 1fr"><div class="tile"><b style="font-size:19px">${short(held)}</b><span>Holding now</span></div><div class="tile"><b style="font-size:19px">${short(earned)}</b><span>Fees earned</span></div></div>` : ''}
    <div class="chips" style="margin-top:12px">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.escFilter === k ? 'on' : ''}" data-ef="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <div class="list" style="margin-top:12px">${!all.length ? examplesBlock('escrows') : ''}${list.map(escItem).join('') || (!all.length ? '' : `<div class="empty"><b>No middleman deals here</b>${isOwner() ? 'When members use the middleman, deals show here.' : 'Open a Selling post and tap <b>Buy with middleman</b> to buy safely.'}</div>`)}</div>`;
}
function escrowForm(sellerId, postId) {
  const p = postId ? S.posts.find(x => x.id === postId) : null;
  const item = p ? [p.model, p.storage, p.condition].filter(Boolean).join(' ') || (p.text || '').slice(0, 60) : '';
  openSheet(`<h3>Buy with middleman</h3><div class="hint">From <b>${esc(nameOf(sellerId))}</b>. ${esc(APP)} holds your money until you confirm the phone is fine.</div>
    <div class="steps">${ESC_STEPS.map(([, l]) => `<div><i></i>${l}</div>`).join('')}</div>
    <label for="e-item">Phone</label><input id="e-item" value="${esc(item)}" placeholder="iPhone 15 Pro Max 256GB UK used">
    <label for="e-amt">Agreed price (₦)</label><input id="e-amt" inputmode="numeric" value="${esc(p?.price || '')}">
    <div class="kv" id="e-sum"></div>
    <label for="e-note">Note for the seller</label><input id="e-note" placeholder="Pickup or delivery, colour, etc.">
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn gold" data-a="escrowCreate" data-id="${esc(sellerId)}" data-post="${esc(postId || '')}">Send request</button></div>`);
  const upd = () => { const a = num(val('e-amt')), f = a ? feeFor(a) : 0; $('#e-sum').innerHTML = `<div>Phone price</div><div>${naira(a)}</div><div>Middleman fee</div><div>${naira(f)}</div><div>You pay</div><div>${naira(a + f)}</div><div>Seller receives</div><div>${naira(a)}</div>`; };
  sheet.querySelector('#e-amt').addEventListener('input', upd); upd();
}
function escHist(e, t) { return [...(e.history || []), {t: String(t).slice(0, 400), by: S.me.shopName, uid: uid(), ts: Date.now()}]; }
function escrowDetail(id) {
  const e = S.escrows[id]; if (!e) return closeSheet();
  const me = uid(), buyer = e.buyerId === me, seller = e.sellerId === me, owner = isOwner();
  const idx = ESC_STEPS.findIndex(([k]) => k === e.status);
  const reached = e.status === 'requested' ? -1 : idx;
  const total = num(e.amount) + num(e.fee);
  let explain = '', acts = '';
  const b = (a, cls, label) => `<button class="btn ${cls}" data-a="${a}" data-id="${esc(id)}">${label}</button>`;
  const ownerPhoneBtn = (txt) => OWNER_PHONE ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(OWNER_PHONE, txt)}">Send proof to ${esc(APP)}</a>` : '';
  switch (e.status) {
    case 'requested':
      if (seller) { explain = `${esc(nameOf(e.buyerId))} wants to buy this through the middleman for ${naira(e.amount)}. You receive the full amount after they confirm the phone is fine.`; acts = b('escAccept', 'pri', 'Accept') + b('escDecline', 'red', 'Decline'); }
      else if (buyer) { explain = `Waiting for ${esc(nameOf(e.sellerId))} to accept.`; acts = b('escCancel', '', 'Cancel request'); }
      else explain = 'Waiting for the seller to accept.';
      break;
    case 'accepted':
      if (buyer) { explain = `<b>Pay ${naira(total)} to ${esc(APP)}</b> (phone ${naira(e.amount)} + fee ${naira(e.fee)}):<div style="white-space:pre-line;margin-top:6px">${esc(PAYMENT_DETAILS)}</div><div style="margin-top:6px">Then send the payment proof. Don't pay the seller directly.</div>`; acts = ownerPhoneBtn(`Middleman payment for ${e.item}: I paid ${naira(total)}. Deal ref ${id.slice(-6)}. Proof attached.`) + b('escCancel', '', 'Cancel'); }
      else if (owner) { explain = `Waiting for ${esc(nameOf(e.buyerId))} to pay <b>${naira(total)}</b>. When the money is in your account, confirm it here.`; acts = b('escPaid', 'pri', 'Buyer\'s money received') + b('escCancel', '', 'Cancel deal'); }
      else { explain = `Waiting for ${esc(nameOf(e.buyerId))} to pay the middleman. Don't hand over the phone yet.`; acts = b('escCancel', '', 'Cancel'); }
      break;
    case 'paid':
      if (seller) { explain = `${esc(APP)} has the buyer's money. <b>Hand the phone to ${esc(nameOf(e.buyerId))} now</b>, then tap below.`; acts = b('escDelivered', 'pri', 'I handed over the phone'); }
      else if (buyer) explain = `Your money is safe with ${esc(APP)}. ${esc(nameOf(e.sellerId))} will now hand over the phone.`;
      else explain = 'Money received. Waiting for the seller to hand over the phone.';
      if (buyer || seller) acts += b('escDisputeForm', 'red', 'Report a problem');
      break;
    case 'delivered':
      if (buyer) { explain = `${esc(nameOf(e.sellerId))} says they handed over the phone. <b>Check it well</b>: IMEI, Face ID, iCloud, battery. If all is fine, confirm so the seller gets paid.`; acts = b('escReceived', 'pri', 'Phone is fine, release payment'); }
      else if (seller) explain = `Waiting for ${esc(nameOf(e.buyerId))} to confirm the phone is fine.`;
      else explain = 'Waiting for the buyer to check the phone.';
      if (buyer || seller) acts += b('escDisputeForm', 'red', 'Report a problem');
      break;
    case 'received':
      if (owner) { explain = `Buyer confirmed. <b>Send ${naira(e.amount)} to ${esc(nameOf(e.sellerId))}</b>, keep your fee of ${naira(e.fee)}, then tap below.`; acts = b('escReleased', 'pri', 'I paid the seller'); }
      else explain = `Buyer confirmed. ${esc(APP)} is sending ${naira(e.amount)} to ${esc(nameOf(e.sellerId))}.`;
      break;
    case 'disputed':
      explain = `<b>In dispute.</b> ${esc(e.disputeReason || '')}<div style="margin-top:6px">${esc(APP)} will contact both sides and decide.</div>`;
      if (owner) acts = b('escRefund', 'red', 'Refund the buyer') + b('escReleased', 'pri', 'Release to seller');
      break;
    case 'released': explain = 'Completed. The seller has been paid.'; break;
    case 'refunded': explain = 'The buyer was refunded.'; break;
    default: explain = ESC_LABEL[e.status] || '';
  }
  const other = buyer ? e.sellerId : seller ? e.buyerId : null;
  openSheet(`<h3>${esc(e.item)}</h3>
    <div class="hslip escrow-slip"><div class="parties"><div><small>Buyer</small><b>${esc(nameOf(e.buyerId))}</b></div><span class="arrow">→</span><div><small>Middleman</small><b>${esc(APP)}</b></div><span class="arrow">→</span><div><small>Seller</small><b>${esc(nameOf(e.sellerId))}</b></div></div>${'<div class="perf"><i></i><i></i></div>'}<small>Phone price</small><div class="amt">${naira(e.amount)}</div><small>Fee ${naira(e.fee)}, buyer pays ${naira(total)}</small></div>
    <div class="steps">${ESC_STEPS.map(([k, l], i) => `<div class="${i <= reached && !['declined', 'cancelled'].includes(e.status) ? 'done' : i === reached + 1 && escOpen(e) && e.status !== 'disputed' ? 'now' : ''}"><i></i>${l}</div>`).join('')}</div>
    <div class="${e.status === 'disputed' ? 'alert' : 'notice'}">${explain}</div><div class="btns">${acts}</div>
    ${e.note ? `<div class="kv"><div>Note</div><div>${esc(e.note)}</div></div>` : ''}
    <div class="btns">${other && member(other).phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(member(other).phone, `Hello ${nameOf(other)}, about our middleman deal for ${e.item}: `)}">WhatsApp ${esc(nameOf(other))}</a>` : ''}${owner ? [e.buyerId, e.sellerId].map(x => member(x).phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(member(x).phone, `Hello ${nameOf(x)}, about the middleman deal for ${e.item} (ref ${id.slice(-6)}): `)}">WhatsApp ${esc(nameOf(x))}</a>` : '').join('') : ''}<button class="btn" data-a="close">Close</button></div>
    <h2>History</h2><div class="hist">${(e.history || []).slice().reverse().map(h => `<div>${esc(h.t)}<small>${esc(h.by || '')}, ${fmtTs(h.ts)}</small></div>`).join('')}</div>`);
}
async function escSet(id, status, text, msg, extra = {}) {
  return guard(async () => { const e = S.escrows[id]; await updateDoc(doc(db, 'escrows', id), {status, ...extra, history: escHist(e, text), updatedAt: Date.now()}); toast(msg); setTimeout(() => escrowDetail(id), 50); });
}
function securityView() {
  if (!isOwner()) return '';
  const M = Object.values(S.members), dayAgo = Date.now() - 864e5;
  const newJoins = M.filter(m => (m.createdAt || 0) > dayAgo).length;
  const flagged = M.filter(m => Object.values(S.reports).filter(r => r.vendorId === m.id && r.status === 'open').length >= 2);
  const lowRated = M.filter(m => { const r = ratingOf(m.id); return r.n >= 3 && r.avg < 2.5; });
  const ok = (good, label, fix) => `<div class="ch" style="padding:9px 0;border-top:1px solid var(--line);font-size:14px"><span>${label}${good ? '' : `<div class="mute" style="font-size:12.5px">${fix}</div>`}</span><span class="tag ${good ? 'g' : 'rd'}">${good ? 'OK' : 'Fix'}</span></div>`;
  const sw = (key, title, desc) => `<div class="card"><div class="ch"><div><b>${title}</b><div class="mute" style="font-size:13px">${desc}</div></div>
    <button class="btn sm ${S.settings[key] === false ? 'pri' : 'red'}" data-a="toggleSetting" data-v="${key}">${S.settings[key] === false ? 'Turn back on' : 'Pause'}</button></div>
    <div style="margin-top:8px"><span class="tag ${S.settings[key] === false ? 'rd' : 'g'}">${S.settings[key] === false ? 'Paused' : 'On'}</span></div></div>`;
  return `<div class="notice">Use these switches during an attack or a wave of spam. They work instantly for everyone, because the server enforces them, not just the app.</div>
    <h2>Emergency switches</h2>
    ${sw('joinsOpen', 'New sign-ups', 'Pause when lots of fake accounts are applying.')}
    ${sw('postingOpen', 'Broadcast posting', 'Pause when the board is being spammed. You can still post.')}
    ${sw('storeOpen', 'Customer store orders', 'Pause new customer orders (e.g. fake orders flooding in). Browsing still works.')}
    <h2>Last 24 hours</h2>
    <div class="tiles"><div class="tile ${newJoins > 20 ? 'bad' : ''}"><b>${newJoins}</b><span>New sign-ups</span></div><div class="tile ${flagged.length ? 'bad' : ''}"><b>${flagged.length}</b><span>Shops with 2+ open reports</span></div><div class="tile ${lowRated.length ? 'bad' : ''}"><b>${lowRated.length}</b><span>Rated below 2.5</span></div></div>
    ${flagged.length || lowRated.length ? `<div class="list" style="margin-top:10px">${[...new Set([...flagged, ...lowRated])].map(m => `<button class="item" data-admin="${esc(m.id)}"><span class="glyph"></span><span><div class="t">${esc(m.shopName)}</div><div class="m">${Object.values(S.reports).filter(r => r.vendorId === m.id && r.status === 'open').length} open reports, rating ${ratingOf(m.id).n ? ratingOf(m.id).avg.toFixed(1) : '–'}</div></span><span class="r">${m.status === 'suspended' ? '<span class="tag gr">Suspended</span>' : '<span class="tag rd">Check</span>'}</span></button>`).join('')}</div>` : ''}
    <h2>Safety checklist</h2>
    <div class="card">
      ${ok(location.protocol === 'https:', 'Site runs on HTTPS', 'Turn on SSL for your domain (SECURITY.md, step 1).')}
      ${ok(APP_CHECK_ON, 'Bot protection (App Check) set up', 'Add your reCAPTCHA key to config.js and enforce App Check (SECURITY.md, step 2).')}
      ${ok(!!S.user?.emailVerified, 'Your owner email is verified', 'Verify your email.')}
      ${ok(IDLE_MIN > 0 && IDLE_MIN <= 240, `Idle logout after ${IDLE_MIN} minutes`, 'Set IDLE_LOGOUT_MINUTES in config.js.')}
      ${ok(!/^(localhost|127\\.)/.test(location.hostname), 'Running on your real domain', 'Upload to your domain.')}
    </div>
    <p class="mute" style="font-size:13px">Some protections live outside the app: Cloudflare in front of your domain, App Check enforcement, and Firebase sign-in settings. SECURITY.md walks you through each one.</p>`;
}
function listingForm(devId) {
  const d = S.devices[devId], l = listingFor(devId) || {};
  const price = l.price || Math.round(num(d.price) * 1.1 / 1000) * 1000 || '';
  openSheet(`<h3>${l.vendorId ? 'Edit store listing' : 'Sell to customers'}</h3>
    <div class="hint">${esc(devName(d))}. Customers in <b>${esc(STORE_NAME)}</b> see this price and your shop name. Dealers in the hub never see it.</div>
    <label for="l-price">Customer price (₦)</label><input id="l-price" inputmode="numeric" value="${esc(price)}">
    <div class="kv" id="l-sum"></div>
    <label for="l-desc">Description for customers</label><textarea id="l-desc" maxlength="1500" placeholder="Face ID works, battery ${esc(d.battery || '90')}%, comes with charger. Delivery within Kano.">${esc(l.description || [d.color, d.battery ? 'Battery ' + d.battery + '%' : '', d.notes].filter(Boolean).join('. '))}</textarea>
    <label for="c-video">TikTok video link (optional)</label><input id="c-video" inputmode="url" value="${esc(l.video || '')}" placeholder="https://www.tiktok.com/@yourshop/video/…">
    <label for="c-photo">Photo${l.photo ? ' (choose a new one to replace)' : ''}</label><input id="c-photo" type="file" accept="image/*"><div class="photo-prev" id="c-prev" ${l.photo ? '' : 'hidden'}><img alt="Photo preview" src="${esc(l.photo || '')}"></div>
    <label class="toggle"><input type="checkbox" id="l-live" ${l.status !== 'hidden' && l.status !== 'sold' ? 'checked' : ''}>Show in the store now</label>
    <div class="btns">${l.vendorId ? `<button class="btn red" data-a="delListing" data-id="${esc(devId)}">Remove from store</button>` : ''}<button class="btn" data-a="devBack" data-id="${esc(devId)}">Back</button><button class="btn pri" data-a="saveListing" data-id="${esc(devId)}">${l.vendorId ? 'Save listing' : 'List in store'}</button></div>`);
  S.draftPhoto = null;
  const upd = () => { const p = num(val('l-price')); $('#l-sum').innerHTML = `<div>Your dealer price</div><div>${naira(d.price)}</div><div>Customer pays</div><div>${naira(p)}</div><div>${esc(APP)} commission (${COMM_PCT}%)</div><div>−${naira(commissionFor(p))}</div><div>You receive</div><div>${naira(p - commissionFor(p))}</div>`; };
  sheet.querySelector('#l-price').addEventListener('input', upd); upd();
}
function saveListing(devId) {
  const d = S.devices[devId], old = listingFor(devId) || {}, price = num(val('l-price'));
  if (!price) return toast('Enter the customer price');
  const vraw = val('c-video'), video = vraw ? tiktokUrl(vraw) : '';
  if (vraw && !video) return toast("That isn't a TikTok link");
  if (!isOwner() && S.settings.storeOpen === false) toast('Note: the store is paused right now');
  return guard(async () => {
    const l = {vendorId: uid(), deviceId: devId, shopName: S.me.shopName, shopLogo: S.me.logo && LOGO_RE.test(S.me.logo) ? S.me.logo : '', city: S.me.city || '', state: S.me.state || '', model: d.model || 'iPhone', storage: d.storage || '', color: (d.color || '').slice(0, 40), condition: d.condition || '', parts: partsOnly(d), face: faceOf(d), battery: String(d.battery || '').slice(0, 4),
      price, description: val('l-desc').slice(0, 1500), video, status: checked('l-live') ? 'live' : 'hidden', createdAt: old.createdAt || Date.now(), updatedAt: Date.now()};
    const photo = S.draftPhoto || old.photo; if (photo) l.photo = photo;
    await setDoc(doc(db, 'listings', uid() + '_' + devId), l); S.draftPhoto = null;
    toast(l.status === 'live' ? `Live in ${STORE_NAME}` : 'Saved (hidden)'); devDetail(devId);
  });
}
function listingsView() {
  const L = Object.values(S.listings).filter(l => matchQ([l.model, l.storage, l.condition, l.description].join(' '))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return `<div class="notice">Phones from your stock that customers can buy in <b>${esc(STORE_NAME)}</b>. To add one, open a phone in <b>Stock</b> and tap <b>Sell to customers</b>.${STORE_URL ? ` <a href="${esc(STORE_URL)}" target="_blank" rel="noopener">Open the store</a>` : ''}</div>
    <div class="list">${L.map(l => `<button class="item" data-dev="${esc(l.deviceId)}"><span class="glyph ${l.status === 'live' ? 'in' : 'done'}"></span><span style="min-width:0"><div class="t">${esc([l.model, l.storage].join(' '))}</div><div class="m">${esc(l.condition)}${S.devices[l.deviceId] ? ', dealer price ' + short(S.devices[l.deviceId].price) : ''}</div></span><span class="r"><div class="p">${short(l.price)}</div><span class="tag ${l.status === 'live' ? 'g' : 'gr'}">${l.status === 'live' ? 'Live' : l.status === 'sold' ? 'Sold' : 'Hidden'}</span></span></button>`).join('') || (Object.keys(S.listings).length || S.q ? '<div class="empty"><b>Nothing listed yet</b>Open a phone in Stock and tap <b>Sell to customers</b>.</div>' : '')}</div>${!Object.keys(S.listings).length && !S.q ? examplesBlock('listings') : ''}`;
}
function ordersView() {
  const all = Object.values(S.orders).filter(o => matchQ([o.item, o.city, o.state, nameOf(o.vendorId), S.contacts[o.id]?.customerName].join(' ')));
  const F = {todo: ['To do', ordNeedsMe], open: ['Open', o => ORD_OPEN.includes(o.status)], done: ['Finished', o => !ORD_OPEN.includes(o.status)], all: ['All', () => true]};
  if (!F[S.ordFilter]) S.ordFilter = 'todo';
  const list = all.filter(F[S.ordFilter][1]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const held = isOwner() ? Object.values(S.orders).filter(o => ['paid', 'delivered', 'received', 'disputed'].includes(o.status)).reduce((t, o) => t + num(o.amount), 0) : 0;
  const earned = isOwner() ? Object.values(S.orders).filter(o => o.status === 'completed').reduce((t, o) => t + num(o.commission), 0) : 0;
  return `<div class="notice">${isOwner() ? `Customers pay you. You pay the vendor (minus ${COMM_PCT}% commission) after the customer confirms delivery.` : `Customers order your listed phones. Confirm availability fast; ${esc(APP)} collects the payment and pays you after the customer confirms delivery, minus ${COMM_PCT}% commission.`}</div>
    ${isOwner() ? `<div class="tiles" style="grid-template-columns:1fr 1fr"><div class="tile"><b style="font-size:19px">${short(held)}</b><span>Customer money held</span></div><div class="tile"><b style="font-size:19px">${short(earned)}</b><span>Commission earned</span></div></div>` : ''}
    <div class="chips" style="margin-top:12px">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.ordFilter === k ? 'on' : ''}" data-of="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <div class="list" style="margin-top:12px">${list.map(ordItem).join('') || (!all.length ? '' : '<div class="empty"><b>No orders here</b>Store orders show up here.</div>')}</div>${!all.length ? examplesBlock('orders') : ''}`;
}
function orderDetail(id) {
  const o = S.orders[id]; if (!o) return closeSheet();
  if (canSeeContact(o) && !S.contacts[id]) { loadContact(id).then(() => { if (bg.classList.contains('open') && S.orders[id]) orderDetail(id); }); }
  const c = S.contacts[id] || {};
  const vendor = o.vendorId === uid(), owner = isOwner();
  const showCustomer = owner || ['paid', 'delivered', 'received', 'disputed', 'completed'].includes(o.status);
  const payout = num(o.amount) - num(o.commission);
  let explain = '', acts = '';
  const b = (a, cls, label) => `<button class="btn ${cls}" data-a="${a}" data-id="${esc(id)}">${label}</button>`;
  switch (o.status) {
    case 'new': if (vendor) { explain = 'A customer wants this phone. <b>Is it still available?</b> Answer quickly; customers buy from shops that reply fast.'; acts = b('ordAccept', 'pri', 'Yes, available') + b('ordReject', 'red', 'Not available'); } else explain = 'Waiting for the seller to confirm availability.'; break;
    case 'accepted': if (owner) { explain = `Available. Ask the customer to pay <b>${naira(o.amount)}</b> to you, then confirm here when it arrives.`; acts = b('ordPaid', 'pri', 'Customer paid'); } else explain = `Waiting for the customer to pay ${esc(APP)}. <b>Don't deliver yet.</b>`; break;
    case 'paid': if (vendor) { explain = `<b>Paid.</b> Deliver the phone to the customer now, then tap below.`; acts = b('ordDelivered', 'pri', 'I delivered it'); } else explain = 'Paid. Waiting for the seller to deliver.'; break;
    case 'delivered': explain = owner ? 'Delivered. Waiting for the customer to confirm. If they don\'t respond, you can complete it after checking with them.' : 'Delivered. Waiting for the customer to confirm.'; if (owner) acts = b('ordComplete', 'pri', `I paid the vendor ${naira(payout)}`); break;
    case 'received': if (owner) { explain = `Customer confirmed. <b>Pay ${esc(nameOf(o.vendorId))} ${naira(payout)}</b> (price ${naira(o.amount)} − commission ${naira(o.commission)}), then tap below.`; acts = b('ordComplete', 'pri', 'I paid the vendor'); } else explain = `Customer confirmed. ${esc(APP)} is sending you ${naira(payout)}.`; break;
    case 'disputed': explain = `<b>Problem reported:</b> ${esc(o.problem || '')}`; if (owner) acts = b('ordRefund', 'red', 'Refund customer') + b('ordComplete', 'pri', 'Pay vendor'); break;
    default: explain = ORD_LABEL[o.status] || o.status;
  }
  if (owner && ORD_OPEN.includes(o.status) && !['received'].includes(o.status)) acts += b('ordCancel', '', 'Cancel order');
  const payText = `Hello ${c.customerName || ''}, your order for ${o.item} on ${STORE_NAME} is available. Please pay ${naira(o.amount)} to:\n${PAYMENT_DETAILS}\nThen send the payment proof here. Your money is held safely until you receive the phone.`;
  openSheet(`<h3>${esc(o.item)}</h3>
    <div class="hslip"><div class="parties"><div><small>Customer</small><b>${esc(showCustomer && c.customerName ? c.customerName : 'Customer')}</b></div><span class="arrow">←</span><div><small>Seller</small><b>${esc(nameOf(o.vendorId))}</b></div></div><div class="perf"><i></i><i></i></div><small>Customer pays</small><div class="amt">${naira(o.amount)}</div><small>Seller receives ${naira(payout)} after delivery</small></div>
    <div class="${o.status === 'disputed' ? 'alert' : 'notice'}">${explain}</div><div class="btns">${acts}</div>
    <div class="kv"><div>Status</div><div>${ordTag(o)}</div><div>Ordered</div><div>${fmtTs(o.createdAt)}</div><div>Location</div><div>${esc(place(o.city, o.state))}</div>
    ${showCustomer ? (c.customerName ? `<div>Customer</div><div>${esc(c.customerName)}</div><div>Phone</div><div>${esc(c.customerPhone)}</div><div>Address</div><div>${esc(c.address)}</div>${c.note ? `<div>Note</div><div>${esc(c.note)}</div>` : ''}` : '<div>Customer details</div><div class="mute">Loading…</div>') : '<div>Customer details</div><div class="mute">Shown after payment</div>'}<div>Order code</div><div>${esc(id.slice(-8).toUpperCase())}</div></div>
    <div class="btns">${owner && o.status === 'accepted' && c.customerPhone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(c.customerPhone, payText)}">Send payment details</a>` : ''}${showCustomer && c.customerPhone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(c.customerPhone, `Hello ${c.customerName}, about your order for ${o.item} (${id.slice(-8).toUpperCase()}): `)}">WhatsApp customer</a>` : ''}${owner && member(o.vendorId).phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(member(o.vendorId).phone, `Hello ${nameOf(o.vendorId)}, about store order ${id.slice(-8).toUpperCase()} (${o.item}): `)}">WhatsApp seller</a>` : ''}<button class="btn" data-a="close">Close</button></div>
    <h2>History</h2><div class="hist">${(o.history || []).slice().reverse().map(h => `<div>${esc(h.t)}<small>${esc(h.by || '')}, ${fmtTs(h.ts)}</small></div>`).join('')}</div>`);
}
async function ordSet(id, status, text, msg, after) {
  return guard(async () => { const o = S.orders[id]; await updateDoc(doc(db, 'orders', id), {status, history: [...(o.history || []), {t: String(text).slice(0, 400), by: S.me.shopName, uid: uid(), ts: Date.now()}], updatedAt: Date.now()}); if (after) await after(o); toast(msg); setTimeout(() => orderDetail(id), 50); });
}
function notifSheet() {
  const all = notifs(), act = all.filter(n => n.act), fresh = all.filter(n => n.unread && !n.act), old = all.filter(n => !n.unread).slice(0, 15);
  const row = n => `<button class="item ${n.act ? 'hl' : ''}" data-a="openNotif" data-v="${esc(n.kind)}" data-id="${esc(n.id)}" style="${n.unread ? '' : 'opacity:.7'}"><span class="ni" aria-hidden="true">${NOTE_ICON[n.kind] || NOTE_ICON.bell}</span><span style="min-width:0;flex:1"><div class="t" style="font-size:14px">${esc(n.title)}</div>${n.body ? `<div class="m">${esc(n.body)}</div>` : ''}</span>${n.ts ? `<span class="mute" style="font-size:11.5px;white-space:nowrap">${ago(n.ts)}</span>` : ''}</button>`;
  openSheet(`<div class="ch"><h3>Notifications</h3><button class="small-btn" data-a="prefsForm">Settings</button></div>
    ${!all.length ? '<p class="mute">Nothing yet. New posts that match your alerts, orders, deals and reviews show up here.</p>' : ''}
    ${act.length ? `<h2>Needs your action <small>${act.length}</small></h2><div class="list">${act.map(row).join('')}</div>` : ''}
    ${fresh.length ? `<h2>New <small>${fresh.length}</small></h2><div class="list">${fresh.map(row).join('')}</div>` : ''}
    ${old.length ? `<h2>Earlier</h2><div class="list">${old.map(row).join('')}</div>` : ''}
    <div class="btns">${fresh.length ? '<button class="btn pri" data-a="markRead">Mark all as read</button>' : ''}<button class="btn" data-a="close">Close</button></div>`);
}
async function markRead() {
  const seenComments = {}; S.posts.filter(p => p.authorId === uid()).forEach(p => seenComments[p.id] = p.commentCount || 0);
  return guard(async () => { await setDoc(prefRef(), {...prefs(), lastSeen: Date.now(), seenComments, updatedAt: Date.now()}); notifSheet(); });
}
function openNotif(kind, id) {
  closeSheet();
  if (kind === 'move') return moveDetail(id);
  if (kind === 'order') return orderDetail(id);
  if (kind === 'escrow') return escrowDetail(id);
  if (kind === 'post') return openPost(id);
  if (kind === 'review') return memberSheet(uid());
  if (kind === 'listing') { const l = S.storeLive.find(x => x.id === id); if (!l) return; const href = (STORE_URL || 'store.html') + '#p-' + l.id.replace('_', '-');
    return openSheet(`<h3>${esc([l.model, l.storage, l.color].filter(Boolean).join(' '))}</h3><div class="hint">New in ${esc(STORE_NAME)} from <b>${esc(l.shopName)}</b>, ${esc(l.city || '')}</div><div class="kv"><div>Customer price</div><div>${naira(l.price)}</div><div>Condition</div><div>${esc(l.condition || '—')}</div></div>${l.description ? `<p style="white-space:pre-wrap">${esc(l.description)}</p>` : ''}<div class="btns"><a class="btn" href="${esc(href)}" target="_blank" rel="noopener">View in store</a><button class="btn" data-member="${esc(l.vendorId)}">See the shop</button><button class="btn" data-a="close">Close</button></div>`); }
}
function prefsForm() {
  const pr = prefs(), perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const chk = (id, on, label, sub) => `<label class="toggle" style="align-items:flex-start"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}${sub ? `<div class="mute" style="font-size:12.5px;font-weight:500">${sub}</div>` : ''}</span></label>`;
  openSheet(`<h3>Notifications</h3><div class="hint">You choose what you hear about. Nothing is sent to your phone or WhatsApp unless you switch it on.</div>
    <h2>New broadcast posts</h2>
    <div class="reasons">${[['all', 'Every new post'], ['alerts', 'Only posts that match my alerts'], ['off', 'Off']].map(([v, l]) => `<label><input type="radio" name="np" value="${v}" ${pr.newPosts === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <div class="sub-box" id="alertBox" ${pr.newPosts === 'alerts' ? '' : 'hidden'}>
      <label>Post types</label><div class="chips" style="flex-wrap:wrap">${Object.entries(TYPES).map(([k, [l]]) => `<label class="chip" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" class="ptype" value="${k}" ${(pr.types || []).includes(k) ? 'checked' : ''} style="width:16px;height:16px">${l}</label>`).join('')}</div>
      <label for="n-kw">Models or words (separate with commas)</label><input id="n-kw" maxlength="200" value="${esc(pr.keywords)}" placeholder="13 pro, 14 pro max, 256gb">
      <div class="row"><div><label for="n-max">Max price (₦)</label><input id="n-max" inputmode="numeric" value="${pr.maxPrice || ''}" placeholder="Any"></div><div><label for="n-city">City</label><input id="n-city" maxlength="60" value="${esc(pr.city)}" placeholder="Any"></div></div>
      <label for="n-state">State</label><select id="n-state">${stateOpts(pr.state || '', 'Any state')}</select>
    </div>
    <h2>Other alerts</h2>
    ${chk('n-orders', pr.orders, 'Store orders', 'A customer orders your phone, pays, or has a problem')}
    ${chk('n-deals', pr.deals, 'Deals with other dealers', 'Confirmations, returns and payments')}
    ${MIDDLEMAN_ON ? chk('n-esc', pr.escrows, 'Middleman deals') : ''}
    ${chk('n-rev', pr.reviews, 'New reviews of my shop')}
    ${chk('n-com', pr.comments, 'Comments on my posts')}
    ${chk('n-store', pr.storeNew, 'New phones in the customer store', 'See what other shops list for customers, and at what price')}
    <h2>How to alert me</h2>
    ${chk('n-push', pr.push, 'Phone notifications', PUSH_ON ? 'Pop-ups on this phone, even when the app is closed.' : 'Pop-ups on this phone while the app is open or in the background.')}
    <div class="mute" style="font-size:12.5px;margin:4px 0 0 30px">${perm === 'denied' ? '⚠️ Notifications are blocked for this site. Allow them in your browser settings (tap the lock icon by the address).' : perm === 'unsupported' ? 'This browser doesn\'t support notifications. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).' : perm === 'granted' ? 'Allowed on this phone ✓' : 'Your phone will ask for permission when you save.'}</div>
    ${WA_ALERTS ? chk('n-wa', pr.wa, `WhatsApp messages to ${esc(S.me.phone || 'my number')}`, 'Important alerts only: store orders, deals and posts matching your alerts. Max 10 a day.') : ''}
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="savePrefs">Save</button></div>`);
}
async function enablePush() {
  if (!('Notification' in window)) { toast('This browser can\'t show notifications. On iPhone, add the app to your Home Screen first.'); return false; }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; } }
  if (perm !== 'granted') { toast('Notifications are blocked. Allow them in your browser settings.'); return false; }
  if (PUSH_ON) {
    try {
      const {getMessaging, getToken} = await import('https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging.js');
      const reg = await navigator.serviceWorker.register('sw.js?c=' + encodeURIComponent(JSON.stringify(firebaseConfig)));
      const token = await getToken(getMessaging(fbApp), {vapidKey: CFG.FCM_VAPID_KEY, serviceWorkerRegistration: reg});
      if (token) return token;
    } catch (e) { console.error('push', e); toast('Pop-ups on. Alerts when the app is closed could not be set up on this phone.'); }
  }
  return true;
}
async function savePrefs() {
  const np = sheet.querySelector('input[name=np]:checked')?.value || 'all';
  const next = {...prefs(), newPosts: np, types: [...sheet.querySelectorAll('.ptype:checked')].map(x => x.value), keywords: val('n-kw').slice(0, 200), maxPrice: num(val('n-max')), city: val('n-city').slice(0, 60), state: val('n-state'),
    orders: checked('n-orders'), deals: checked('n-deals'), escrows: MIDDLEMAN_ON ? checked('n-esc') : true, reviews: checked('n-rev'), comments: checked('n-com'), storeNew: checked('n-store'), push: checked('n-push'), wa: WA_ALERTS ? checked('n-wa') : false, updatedAt: Date.now()};
  if (np === 'alerts' && !next.types.length) return toast('Pick at least one post type');
  if (!S.prefs) next.lastSeen = Date.now();
  return guard(async () => {
    if (next.push && !prefs().push || next.push && PUSH_ON && !(next.tokens || []).length) {
      const r = await enablePush();
      if (r === false) next.push = false;
      else if (typeof r === 'string') next.tokens = [...new Set([r, ...(next.tokens || [])])].slice(0, 10);
    }
    await setDoc(prefRef(), next); closeSheet(); toast('Notification settings saved');
    if (next.push && 'Notification' in window && Notification.permission === 'granted') showPopup(`${APP} notifications are on`, 'You\'ll get alerts on this phone.', 'welcome');
  });
}
function digestText() {
  const start = isoToDay(todayISO()) * 86400000 - 3600000;
  const posts = S.posts.filter(p => p.createdAt >= start && p.status !== 'sold');
  const lines = posts.map(p => `• ${(TYPES[p.type] || TYPES.news)[0].toUpperCase()}: ${[p.model, p.storage, p.condition].filter(Boolean).join(' ') || (p.text || '').slice(0, 60)}${p.price ? ' — ' + naira(p.price) : ''} (${p.shopName}${member(p.authorId).phone ? ', ' + member(p.authorId).phone : ''})`);
  return `📱 ${APP}: today's listings (${fmtDate(todayISO())})\n\n${lines.join('\n') || 'No new listings yet today.'}\n\n${STORE_URL && /^https?:/.test(STORE_URL) ? 'Customers: shop safely at ' + STORE_URL + '\n' : ''}Dealers: see full details and post yours in the app.`;
}
function vendorReportsView() {
  if (!isOwner()) return '';
  const srcChips = `<div class="chips" style="margin-bottom:8px"><button class="chip ${S.reportSource === 'members' ? 'on' : ''}" data-rs="members">From members ${openReports().length ? '· ' + openReports().length : ''}</button><button class="chip ${S.reportSource === 'site' ? 'on' : ''}" data-rs="site">Report a problem ${openSite().length ? '· ' + openSite().length : ''}</button></div>`;
  if (S.reportSource === 'site') return srcChips + siteReportsView();
  return srcChips + memberReportsView();
}
function siteReportsView() {
  const all = Object.values(S.feedback).filter(r => matchQ([r.category, r.subject, r.details, r.contact].join(' ')));
  const F = {open: ['Open', r => r.status === 'open'], resolved: ['Resolved', r => r.status === 'resolved'], all: ['All', () => true]};
  const list = all.filter(F[S.reportFilter]?.[1] || F.open[1]).sort((a, b) => b.createdAt - a.createdAt);
  return `<div class="chips">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.reportFilter === k ? 'on' : ''}" data-rf="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <div style="margin-top:12px">${list.map(r => `<button class="card click" data-feedback="${esc(r.id)}"><div class="ch"><div style="min-width:0"><b>${esc(SITE_CATS[r.category] || r.category)}</b><div class="mute" style="font-size:13px">${r.from === 'vendor' ? 'From a vendor' : 'From a customer'}${r.subject ? ', about ' + esc(r.subject) : ''}, ${ago(r.createdAt)}</div></div>${r.status === 'open' ? '<span class="tag rd">Open</span>' : '<span class="tag g">Resolved</span>'}</div><div style="font-size:13.5px;margin-top:8px">${esc(r.details.length > 140 ? r.details.slice(0, 130) + '…' : r.details)}</div></button>`).join('') || '<div class="empty"><b>No reports here</b>Reports sent with "Report a problem" at the bottom of every screen land here.</div>'}</div>`;
}
function feedbackDetail(id) {
  const r = S.feedback[id]; if (!r) return closeSheet();
  openSheet(`<h3>${esc(SITE_CATS[r.category] || r.category)}</h3><div class="hint">${r.from === 'vendor' ? 'From a vendor' : 'From a customer'}, ${fmtTs(r.createdAt)}</div>
    <div class="kv"><div>Status</div><div>${r.status === 'open' ? '<span class="tag rd">Open</span>' : '<span class="tag g">Resolved</span>'}</div>${r.subject ? `<div>About</div><div>${esc(r.subject)}</div>` : ''}<div>Contact</div><div>${esc(r.contact || 'Not given')}</div>${r.from === 'vendor' && S.members[r.reporterUid] ? `<div>Vendor</div><div>${esc(nameOf(r.reporterUid))}</div>` : ''}<div>Page</div><div>${esc(r.page || '—')}</div></div>
    <div class="card" style="white-space:pre-wrap">${esc(r.details)}</div>
    <div class="btns">${r.contact ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(r.contact, `Hello, this is ${APP} about the problem you reported: `)}">WhatsApp them</a><a class="btn" href="${telLink(r.contact)}">Call</a>` : ''}</div>
    <div class="btns">${r.status === 'open' ? `<button class="btn pri" data-a="fbResolve" data-id="${esc(id)}">Mark resolved</button>` : `<button class="btn" data-a="fbReopen" data-id="${esc(id)}">Reopen</button>`}<button class="btn red" data-a="fbDelete" data-id="${esc(id)}">Delete</button><button class="btn" data-a="close">Close</button></div>`);
}
function siteReportForm() {
  openSheet(`<h3>Report a problem</h3><div class="hint">Goes straight to ${esc(APP)}. To report a specific shop, you can also open its profile and tap <b>Report shop</b>.</div>
    <div class="reasons">${Object.entries(SITE_CATS).map(([k, l]) => `<label><input type="radio" name="sc" value="${k}">${esc(l)}</label>`).join('')}</div>
    <label for="sr-sub">Which shop, post or order? (optional)</label><input id="sr-sub" maxlength="120">
    <label for="sr-det">What happened?</label><textarea id="sr-det" maxlength="1000" placeholder="Dates, amounts, screenshots you can send on WhatsApp…"></textarea>
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn red" style="border-color:var(--red)" data-a="sendSiteReport">Send report</button></div>`);
}
function memberReportsView() {
  const all = Object.values(S.reports).filter(r => matchQ([nameOf(r.vendorId), nameOf(r.reporterId), REASONS[r.reason], r.details].join(' ')));
  const F = {open: ['Open', r => r.status === 'open'], resolved: ['Resolved', r => r.status === 'resolved'], all: ['All', () => true]};
  const list = all.filter(F[S.reportFilter][1]).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt - a.createdAt);
  const byVendor = {}; Object.values(S.reports).forEach(r => byVendor[r.vendorId] = (byVendor[r.vendorId] || 0) + 1);
  return `<div class="chips">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.reportFilter === k ? 'on' : ''}" data-rf="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <div style="margin-top:12px">${list.map(r => `<button class="card click" data-report="${esc(r.id)}"><div class="ch"><div style="min-width:0"><b>${esc(nameOf(r.vendorId))}</b>${byVendor[r.vendorId] > 1 ? ` <span class="tag rd" style="margin:0">${byVendor[r.vendorId]} reports</span>` : ''}<div class="mute" style="font-size:13px">${esc(REASONS[r.reason] || r.reason)}, from ${esc(nameOf(r.reporterId))}, ${ago(r.createdAt)}</div></div>${r.status === 'open' ? '<span class="tag rd">Open</span>' : '<span class="tag g">Resolved</span>'}</div>
      ${r.details ? `<div style="font-size:13.5px;margin-top:8px">${esc(r.details.length > 140 ? r.details.slice(0, 130) + '…' : r.details)}</div>` : ''}</button>`).join('') || '<div class="empty"><b>No reports here</b>When members report a shop or a post, it lands here for you to check.</div>'}</div>`;
}
function reportDetail(id) {
  const r = S.reports[id]; if (!r) return closeSheet();
  const v = member(r.vendorId), rp = member(r.reporterId), p = r.postId ? S.posts.find(x => x.id === r.postId) : null;
  const others = Object.values(S.reports).filter(x => x.vendorId === r.vendorId && x.id !== id);
  openSheet(`<h3>Report about ${esc(v.shopName || 'a shop')}</h3><div class="hint">${esc(REASONS[r.reason] || r.reason)}, ${fmtTs(r.createdAt)}</div>
    <div class="kv"><div>Status</div><div>${r.status === 'open' ? '<span class="tag rd">Open</span>' : '<span class="tag g">Resolved</span>'}</div><div>Reported by</div><div>${esc(rp.shopName || '—')}${rp.phone ? ', ' + esc(rp.phone) : ''}</div><div>Shop reported</div><div>${esc(v.shopName || '—')}${v.phone ? ', ' + esc(v.phone) : ''}</div><div>Shop status</div><div>${({pending: 'Waiting for approval', active: 'Active', suspended: 'Suspended'})[v.status] || '—'}</div><div>Shop rating</div><div>${ratingOf(r.vendorId).n ? ratingOf(r.vendorId).avg.toFixed(1) + ' from ' + ratingOf(r.vendorId).n : 'No reviews'}</div><div>Other reports</div><div>${others.length}</div></div>
    ${r.details ? `<div class="card" style="white-space:pre-wrap">${esc(r.details)}</div>` : ''}
    ${r.postId ? (p ? postCard(p, true) : '<p class="mute">The reported post has been deleted.</p>') : ''}
    <div class="btns">${rp.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(rp.phone, `Hello ${rp.shopName}, about your report on ${v.shopName}: `)}">WhatsApp reporter</a>` : ''}${v.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(v.phone, `Hello ${v.shopName}, ${APP} received a complaint about your shop. `)}">WhatsApp shop</a>` : ''}</div>
    <div class="btns">${r.status === 'open' ? `<button class="btn pri" data-a="resolveReport" data-id="${esc(id)}">Mark resolved</button>` : `<button class="btn" data-a="reopenReport" data-id="${esc(id)}">Reopen</button>`}${v.status === 'active' ? `<button class="btn red" data-a="suspendVendor" data-id="${esc(id)}">Suspend shop</button>` : ''}</div>
    <div class="btns"><button class="btn" data-admin="${esc(r.vendorId)}">Open shop in Members</button><button class="btn red" data-a="delReport" data-id="${esc(id)}">Delete report</button></div>
    <div class="btns"><button class="btn" data-a="close">Close</button></div>`);
}
function statementText(id) {
  const m = member(id), M = Object.values(S.moves).filter(x => otherId(x) === id && iOwn(x));
  const holding = M.filter(x => OPEN.includes(x.status)), owing = M.filter(x => owed(x) > 0);
  let t = `Hello ${m.shopName}, here's your statement from ${S.me.shopName} (${fmtDate(todayISO())}):\n`;
  if (holding.length) { t += `\nPhones with you:\n`; holding.forEach((x, i) => t += `${i + 1}. ${devName(x.dev)}${x.dev?.imei ? ' (…' + x.dev.imei.slice(-6) + ')' : ''}, ${naira(x.price)}, due ${fmtDate(x.due)}${overdue(x) ? ' — OVERDUE' : ''}\n`); }
  if (owing.length) { t += `\nUnpaid balances:\n`; owing.forEach(x => t += `• ${devName(x.dev)}: ${naira(owed(x))}\n`); }
  t += `\nTotal: ${naira(holding.reduce((a, x) => a + num(x.price), 0) + owing.reduce((a, x) => a + owed(x), 0))}. Full details are in ${APP}.`;
  return t;
}
function reportsView() {
  const sales = salesList();
  const months = []; const cur0 = todayISO().slice(0, 7); let [yy, mm] = cur0.split('-').map(Number);
  for (let i = 5; i >= 0; i--) { let y = yy, mo = mm - i; while (mo < 1) { mo += 12; y--; } months.push(`${y}-${String(mo).padStart(2, '0')}`); }
  const data = months.map(k => { const s = sales.filter(x => (x.date || '').startsWith(k)); return {k, profit: s.reduce((a, x) => a + x.revenue, 0), revenue: s.reduce((a, x) => a + x.revenue, 0), n: s.length}; });
  const sel = S.chartSel ?? 5, cur = data[sel];
  const label = k => new Date(k + '-15T12:00:00').toLocaleDateString('en-GB', {month: 'short'});
  const W = 320, H = 150, top = 22, bot = 22, ch = H - top - bot;
  const max = Math.max(1, ...data.map(d => d.profit)), min = Math.min(0, ...data.map(d => d.profit));
  const y = v => top + (max - v) / (max - min) * ch, y0 = y(0), bw = 30, gap = (W - bw * 6) / 6;
  const bars = data.map((d, i) => {
    const x = gap / 2 + i * (bw + gap), yy2 = Math.min(y(d.profit), y0), hh = d.profit ? Math.max(3, Math.abs(y(d.profit) - y0)) : 0;
    const hit = `<rect x="${x - gap / 2}" y="0" width="${bw + gap}" height="${H}" fill="transparent"/>`, lab = `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${label(d.k)}</text>`;
    if (!hh) return `<g data-bar="${i}" role="button" tabindex="0" aria-label="${label(d.k)}: no sales">${hit}${i === sel ? `<text class="val" x="${x + bw / 2}" y="${y0 - 6}" text-anchor="middle">₦0</text>` : ''}${lab}</g>`;
    const r = Math.min(4, hh / 2), up = d.profit >= 0;
    const path = up ? `M${x},${yy2 + hh}V${yy2 + r}Q${x},${yy2} ${x + r},${yy2}H${x + bw - r}Q${x + bw},${yy2} ${x + bw},${yy2 + r}V${yy2 + hh}Z` : `M${x},${yy2}V${yy2 + hh - r}Q${x},${yy2 + hh} ${x + r},${yy2 + hh}H${x + bw - r}Q${x + bw},${yy2 + hh} ${x + bw},${yy2 + hh - r}V${yy2}Z`;
    return `<g data-bar="${i}" role="button" tabindex="0" aria-label="${label(d.k)}: ${naira(d.profit)} sales, ${d.n} sold">${hit}<path class="bar ${d.profit < 0 ? 'neg' : ''} ${i === sel ? 'sel' : ''}" d="${path}"/>${i === sel ? `<text class="val" x="${x + bw / 2}" y="${up ? yy2 - 6 : yy2 + hh + 13}" text-anchor="middle">${short(d.profit)}</text>` : ''}${lab}</g>`;
  }).join('');
  const thisMonth = sales.filter(x => (x.date || '').startsWith(months[5]));
  const repairs = Object.values(S.devices).flatMap(d => d.expenses || []).filter(e => (e.date || '').startsWith(months[5])).reduce((a, e) => a + num(e.amount), 0);
  const byModel = {}; sales.filter(x => (x.date || '') >= addDays(todayISO(), -90)).forEach(x => { const k = x.model || 'Other'; (byModel[k] ||= {n: 0, p: 0}); byModel[k].n++; byModel[k].p += x.revenue; });
  const best = Object.entries(byModel).sort((a, b) => b[1].n - a[1].n || b[1].p - a[1].p).slice(0, 6), bestMax = Math.max(1, ...best.map(t => t[1].n));
  return `<h2>Sales by month <small>last 6 months</small></h2>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales for the last six months"><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="var(--line)" stroke-width="1"/>${bars}</svg>
      <div class="readout"><b>${new Date(cur.k + '-15T12:00:00').toLocaleDateString('en-GB', {month: 'long', year: 'numeric'})}</b>: ${naira(cur.revenue)} sales, ${cur.n} phone${cur.n === 1 ? '' : 's'}. <span class="mute">Tap a bar to see another month.</span></div></div>
    <div class="tiles"><div class="tile"><b>${thisMonth.length}</b><span>Sold this month</span></div><div class="tile"><b style="font-size:19px">${short(thisMonth.reduce((a, x) => a + x.revenue, 0))}</b><span>Sales value</span></div><div class="tile"><b style="font-size:19px">${short(repairs)}</b><span>Spent on repairs</span></div></div>
    <h2>Best sellers <small>last 90 days</small></h2>
    <div class="card">${best.length ? best.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><b>${v.n} sold, ${short(v.p)}</b><div class="track"><i style="width:${v.n / bestMax * 100}%"></i></div></div>`).join('') : '<span class="mute">No sales in the last 90 days yet.</span>'}</div>
    <h2>Export</h2><div class="btns" style="margin-top:0"><button class="btn" data-a="csvStock">Stock and sales (CSV)</button><button class="btn" data-a="csvMoves">Deals (CSV)</button></div><p class="mute" style="font-size:13px">Opens in Excel or Google Sheets.</p>`;
}
function adminView() {
  if (!isOwner()) return '';
  const all = Object.values(S.members).filter(m => m.id !== uid());
  const F = {pending: ['Waiting', m => m.status === 'pending'], active: ['Active', m => m.status === 'active'], premium: ['Premium', m => isPremium(m) || m.unlimited], suspended: ['Suspended', m => m.status === 'suspended'], all: ['All', () => true]};
  const postsToday = S.posts.filter(p => Math.floor((p.createdAt + 3600000) / 86400000) === dayNum()).length;
  const list = all.filter(F[S.adminFilter][1]).filter(m => matchQ([m.shopName, m.name, m.city, m.address, m.phone].join(' '))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `<div class="tiles"><div class="tile"><b>${all.filter(m => m.status === 'active').length}</b><span>Active shops</span></div><div class="tile"><b>${all.filter(m => isPremium(m)).length}</b><span>Premium</span></div><div class="tile"><b>${postsToday}</b><span>Posts today</span></div></div>
    <div class="chips" style="margin-top:12px">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip ${S.adminFilter === k ? 'on' : ''}" data-af="${k}">${l} ${all.filter(f).length}</button>`).join('')}</div>
    <div style="margin-top:12px">${list.map(m => `<button class="card click" data-admin="${esc(m.id)}"><div class="mrow"><div class="av ${isPremium(m) || m.unlimited ? 'gold' : ''}">${avInner(m, m.shopName)}</div><div style="flex:1;min-width:0"><b>${esc(m.shopName)}</b><div class="mute" style="font-size:13px">${esc(m.name)}, ${esc(place(m.address, m.city, m.state))}</div></div>
      ${m.status === 'pending' ? '<span class="tag rd">Waiting</span>' : m.status === 'suspended' ? '<span class="tag gr">Suspended</span>' : isPremium(m) ? `<span class="tag prem">Premium to ${fmtShort(dayToIso(m.premiumUntil))}</span>` : m.unlimited ? '<span class="tag prem">Unlimited</span>' : '<span class="tag g">Free</span>'}</div></button>`).join('') || '<div class="empty">No members here.</div>'}</div>`;
}
function adminSheet(id) {
  const m = member(id); if (!m.id) return;
  const pu = m.premiumUntil >= dayNum() ? dayToIso(m.premiumUntil) : addDays(todayISO(), 30);
  openSheet(`<div class="mrow"><div class="av ${isPremium(m) ? 'gold' : ''}" style="width:52px;height:52px;font-size:19px">${avInner(m, m.shopName)}</div><div><h3 style="margin:0">${esc(m.shopName)}</h3><div class="mute" style="font-size:13.5px">${esc(m.name)}</div></div></div>
    <div class="kv"><div>Status</div><div>${({pending: 'Waiting for approval', active: 'Active', suspended: 'Suspended'})[m.status] || esc(m.status)}</div><div>Address</div><div>${esc(place(m.address, m.city, m.state))}</div><div>Phone</div><div>${esc(m.phone)}</div><div>Applied</div><div>${m.createdAt ? fmtTs(m.createdAt) : '—'}</div>
    <div>Premium</div><div>${isPremium(m) ? 'until ' + fmtDate(dayToIso(m.premiumUntil)) : 'No'}</div><div>Unlimited posting</div><div>${m.unlimited ? 'Approved' : 'No'}</div>
    <div>Rating</div><div>${ratingOf(id).n ? ratingOf(id).avg.toFixed(1) + ' from ' + ratingOf(id).n : 'No reviews'}</div><div>Reports</div><div style="${Object.values(S.reports).some(r => r.vendorId === id && r.status === 'open') ? 'color:var(--red)' : ''}">${Object.values(S.reports).filter(r => r.vendorId === id && r.status === 'open').length} open, ${Object.values(S.reports).filter(r => r.vendorId === id).length} total</div></div>
    <div class="btns">${m.status !== 'active' ? `<button class="btn pri" data-a="setStatus" data-id="${esc(id)}" data-v="active">${m.status === 'pending' ? 'Approve shop' : 'Reactivate'}</button>` : `<button class="btn red" data-a="setStatus" data-id="${esc(id)}" data-v="suspended">Suspend</button>`}
      ${m.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(m.phone, `Hello ${m.shopName}, `)}">WhatsApp</a>` : ''}</div>
    <h2>Shop name</h2>
    <div class="row"><div><input id="a-shop" maxlength="60" value="${esc(m.shopName)}" aria-label="Shop name"></div><div><button class="btn" style="width:100%" data-a="renameShop" data-id="${esc(id)}">Rename</button></div></div>
    <h2>Premium</h2>
    <div class="row"><div><label for="a-until">Premium until</label><input id="a-until" type="date" value="${pu}"></div><div style="display:flex;align-items:flex-end"><button class="btn gold" style="width:100%" data-a="setPremium" data-id="${esc(id)}">${isPremium(m) ? 'Update date' : 'Give Premium'}</button></div></div>
    <div class="btns">${[30, 90, 365].map(n => `<button class="btn sm" data-a="premDays" data-id="${esc(id)}" data-v="${n}">+${n} days</button>`).join('')}${isPremium(m) ? `<button class="btn sm red" data-a="endPremium" data-id="${esc(id)}">End Premium</button>` : ''}</div>
    <label class="toggle"><input type="checkbox" id="a-unl" ${m.unlimited ? 'checked' : ''}>Approve unlimited posting for free (no Premium needed)</label>
    <div class="btns"><button class="btn" data-a="saveUnl" data-id="${esc(id)}">Save posting approval</button></div>
    <div class="btns"><button class="btn" data-a="close">Close</button></div>`);
}

// ================= sheets & forms =================
const bg = $('#sheetBg'), sheet = $('#sheet');
const openSheet = html => { sheet.innerHTML = html; bg.classList.add('open'); sheet.scrollTop = 0; };
const closeSheet = () => { bg.classList.remove('open'); openPostId = null; if (postCommentsUnsub) { postCommentsUnsub(); postCommentsUnsub = null; } };
bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const val = id => (sheet.querySelector('#' + id)?.value || '').trim();
const checked = id => !!sheet.querySelector('#' + id)?.checked;
const hist = (m, t) => [...(m.history || []), {t: String(t).slice(0, 400), by: S.me?.shopName || 'Me', uid: uid(), ts: Date.now()}];
let busy = false;
async function guard(fn) {
  if (busy) return; busy = true;
  sheet.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); }
  catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Not allowed. You may have hit a daily limit, or this changed; reopen it and try again.' : e?.code === 'resource-exhausted' ? 'Too much at once. Try again in a moment.' : "Couldn't save: " + (e?.message || e)); }
  finally { busy = false; sheet.querySelectorAll('button').forEach(b => b.disabled = false); }
}
const partnerOptions = sel => activeMembers().filter(m => m.id !== uid()).sort((a, b) => a.shopName.localeCompare(b.shopName)).map(m => `<option value="${esc(m.id)}" ${sel === m.id ? 'selected' : ''}>${esc(m.shopName)}${m.city ? ', ' + esc(m.city) : ''}</option>`).join('');
const phoneFields = (e = {}, p = 'f') => `
  ${modelField(p + '-model', e.model || '')}
  <div class="row"><div><label for="${p}-storage">Storage</label><select id="${p}-storage">${STORAGES.map(s => `<option ${e.storage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div><label for="${p}-color">Colour</label><input id="${p}-color" value="${esc(e.color)}" placeholder="Blue"></div></div>
  <label for="${p}-imei">IMEI or serial</label><input id="${p}-imei" value="${esc(e.imei)}" inputmode="numeric" placeholder="Dial *#06# on the phone">
  <div class="row"><div><label for="${p}-cond">Condition</label><select id="${p}-cond">${CONDITIONS.map(s => `<option ${e.condition === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div><label for="${p}-batt">Battery health %</label><input id="${p}-batt" value="${esc(e.battery)}" inputmode="numeric" placeholder="89"></div></div>
  ${partsFields(e, p)}`;
// one Parts choice and one Face ID choice, each from the owner's dropdown list
function partsFields(e, p) { const info = partsOnly(e), opts = PARTS_OPTS(), sel = opts.find(o => info === o || info.startsWith(o + ', ')) || '', rest = sel ? info.slice(sel.length).replace(/^, /, '') : info;
    const face = faceOf(e), fopts = FACE_OPTS().includes(face) || !face ? FACE_OPTS() : [...FACE_OPTS(), face];
    return `<div class="row"><div><label for="${p}-psel">Parts</label><select id="${p}-psel"><option value="">Not checked</option>${opts.map(o => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
    <div><label for="${p}-fid">Face ID</label><select id="${p}-fid"><option value="">Not checked</option>${fopts.map(o => `<option ${o === face ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div></div>
    <label for="${p}-ptxt">Parts details (optional)</label><input id="${p}-ptxt" maxlength="100" value="${esc(rest)}" placeholder="Screen and battery changed">`; }
const readPhone = (p = 'f') => ({model: readModel(p + '-model'), storage: val(p + '-storage'), color: val(p + '-color'), imei: val(p + '-imei'), condition: val(p + '-cond'), battery: val(p + '-batt'), ...readParts(p)});
function readParts(p) {
  return {partsInfo: [val(p + '-psel'), val(p + '-ptxt')].filter(Boolean).join(', ').slice(0, 120), partsStatus: '', parts: [], partsNote: '', face: val(p + '-fid').slice(0, 40), faceId: ''};
}

// ----- devices -----
function deviceForm(d) {
  const e = d || {};
  openSheet(`<h3>${d ? 'Edit iPhone' : 'Add iPhone to stock'}</h3><div class="hint">Only you can see your stock.</div>${phoneFields(e)}
    <label for="f-price">Selling price (₦)</label><input id="f-price" value="${esc(e.price || '')}" inputmode="numeric">
    <div class="row"><div><label for="f-added">Date bought</label><input id="f-added" type="date" value="${esc(e.added || todayISO())}"></div><div><label for="f-from">Bought from</label><input id="f-from" value="${esc(e.from)}" placeholder="Optional"></div></div>
    <label for="f-notes">Notes</label><textarea id="f-notes" placeholder="Face ID works, screen changed, iCloud clean">${esc(e.notes)}</textarea>
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="saveDev" data-id="${esc(e.id || '')}">${d ? 'Save changes' : 'Add to stock'}</button></div>`);
}
function saveDev(id) {
  const p = readPhone(); if (!p.model) return toast('Enter the model');
  if (p.imei && Object.values(S.devices).some(x => x.imei === p.imei && x.id !== id)) return toast('That IMEI is already in your stock');
  return guard(async () => {
    const d = {...(id ? S.devices[id] : {}), ...p, price: num(val('f-price')), added: val('f-added'), from: val('f-from'), notes: val('f-notes')};
    delete d.id; d.createdAt = d.createdAt || Date.now();
    const pBefore = id ? partsText(S.devices[id]) : '', pAfter = partsText(d), now = Date.now();
    d.history = [...(d.history || []), {t: id ? 'Details edited' : 'Added to stock', ts: now}];
    if (pAfter !== pBefore) d.history.push({t: 'Parts history: ' + (pAfter || 'not checked'), ts: now});
    await setDoc(devRef(id || rid()), d); closeSheet(); toast(id ? 'Changes saved' : 'Added to stock');
  });
}
function devDetail(id) {
  const d = S.devices[id]; if (!d) return closeSheet();
  const st = devState(d), m = openMoveFor(id);
  let kv = '';
  if (d.imei) kv += `<div>IMEI or serial</div><div>${esc(d.imei)}</div>`;
  if (d.condition) kv += `<div>Condition</div><div>${esc(d.condition)}${d.battery ? ', battery ' + esc(d.battery) + '%' : ''}</div>`;
  kv += `<div>Parts</div><div>${esc(partsOnly(d) || 'Not checked')}</div><div>Face ID</div><div>${esc(faceOf(d) || 'Not checked')}</div>`;
  if (expTotal(d)) kv += `<div>Repairs and extras</div><div>${naira(expTotal(d))}</div>`;
  if (d.price) kv += `<div>Selling price</div><div>${naira(d.price)}</div>`;
  if (d.added) kv += `<div>Bought</div><div>${fmtDate(d.added)}${d.from ? ', ' + esc(d.from) : ''}</div>`;
  const lst = listingFor(id);
  if (lst) kv += `<div>Customer store</div><div>${naira(lst.price)} <span class="tag ${lst.status === 'live' ? 'g' : 'gr'}" style="margin:0">${lst.status === 'live' ? 'Live' : lst.status === 'sold' ? 'Sold' : 'Hidden'}</span></div>`;
  if (st === 'stock') kv += `<div>Days in stock</div><div style="${daysSince(d.added) >= SLOW_DAYS ? 'color:var(--amber)' : ''}">${daysSince(d.added)}</div>`;
  if (d.sale) {
    kv += `<div>Sold to</div><div>${esc(d.sale.to || '—')}${d.sale.phone ? ', ' + esc(d.sale.phone) : ''}</div><div>Sale price</div><div>${naira(d.sale.amount)}</div>`;
    if (num(d.sale.swapValue)) kv += `<div>Swap phone taken</div><div>${esc(d.sale.swapModel)}, ${naira(d.sale.swapValue)}</div>`;
    kv += `<div>Paid</div><div>${naira(d.sale.paid)}</div>`;
    if (devOwed(d)) kv += `<div>Balance</div><div style="color:var(--amber)">${naira(devOwed(d))}</div>`;
  }
  let acts = '';
  if (st === 'stock') acts = `<button class="btn pri" data-a="giveForm" data-id="${esc(id)}">Give to a partner</button><button class="btn vio" data-a="sellForm" data-id="${esc(id)}">I sold it</button><button class="btn gold" data-a="broadcastDev" data-id="${esc(id)}">Broadcast it</button><button class="btn" data-a="listingForm" data-id="${esc(id)}">${listingFor(id) ? 'Edit store listing' : 'Sell to customers'}</button>`;
  if (st === 'out' || st === 'soldPartner') acts = `<button class="btn pri" data-a="openMove" data-id="${esc(m.id)}">Open deal with ${esc(otherName(m))}</button>`;
  if (st === 'sold') acts = `<button class="btn wa" data-a="receipt" data-id="${esc(id)}">Send receipt</button>` + (devOwed(d) ? `<button class="btn pri" data-a="devPayForm" data-id="${esc(id)}">Record payment</button>` : '') + `<button class="btn" data-a="devUnsell" data-id="${esc(id)}">Undo sale</button>`;
  const past = sortMoves(Object.values(S.moves).filter(x => x.deviceId === id && iOwn(x)));
  openSheet(`<h3>${esc(devName(d))}</h3>${d.notes ? `<div class="hint">${esc(d.notes)}</div>` : ''}<div class="kv">${kv}</div>
    <div class="btns">${acts}</div>
    <div class="btns"><button class="btn" data-a="expForm" data-id="${esc(id)}">Add repair cost</button><button class="btn" data-a="partDevForm" data-id="${esc(id)}">Part change</button><button class="btn" data-a="editDev" data-id="${esc(id)}">Edit</button></div>
    <div class="btns"><button class="btn red" data-a="delDevAsk" data-id="${esc(id)}">Delete</button><button class="btn" data-a="close">Close</button></div>
    ${(d.expenses || []).length ? '<h2>Repairs and extras</h2><div class="card">' + d.expenses.map(e => `<div class="ch" style="font-size:14px;padding:4px 0"><span>${esc(e.label)} <span class="mute">${fmtShort(e.date)}</span></span><b>${naira(e.amount)}</b></div>`).join('') + '</div>' : ''}
    ${(() => { const pc = Object.values(S.moves).filter(x => x.deviceId === id).flatMap(x => (x.history || []).filter(h => /^Part change/.test(h.t)).map(h => ({...h, with: otherName(x)}))).sort((a, b) => b.ts - a.ts); return pc.length ? '<h2>Part changes reported in deals</h2><div class="hist">' + pc.map(h => `<div>${esc(h.t)}<small>Deal with ${esc(h.with)}, ${fmtTs(h.ts)}</small></div>`).join('') + '</div>' : ''; })()}
    ${past.length ? '<h2>Deals</h2>' + moveList(past) : ''}
    <h2>History</h2><div class="hist">${(d.history || []).slice().reverse().map(h => `<div>${esc(h.t)}<small>${fmtTs(h.ts)}</small></div>`).join('')}</div>`);
}
function expForm(id) {
  openSheet(`<h3>Add repair or extra cost</h3><div class="hint">${esc(devName(S.devices[id]))}. Saved in the phone's history.</div>
    <label for="x-label">What for</label><input id="x-label" list="exps" placeholder="Screen replacement"><datalist id="exps"><option value="Screen replacement"><option value="Battery replacement"><option value="Back glass"><option value="Face ID repair"><option value="Charging port"><option value="Transport"><option value="Unlocking"></datalist>
    <div class="row"><div><label for="x-amt">Amount (₦)</label><input id="x-amt" inputmode="numeric"></div><div><label for="x-date">Date</label><input id="x-date" type="date" value="${todayISO()}"></div></div>
    <div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="expSave" data-id="${esc(id)}">Add cost</button></div>`);
}
function expSave(id) {
  const label = val('x-label') || 'Repair', amount = num(val('x-amt')); if (!amount) return toast('Enter the amount');
  return guard(async () => { const d = S.devices[id]; await updateDoc(devRef(id), {expenses: [...(d.expenses || []), {label, amount, date: val('x-date') || todayISO()}], history: [...(d.history || []), {t: `${label}: ${naira(amount)}`, ts: Date.now()}]}); devDetail(id); toast('Cost added'); });
}
function giveForm(id) {
  const d = S.devices[id];
  if (activeMembers().filter(m => m.id !== uid()).length === 0) return toast('No other members yet');
  openSheet(`<h3>Give to a partner</h3><div class="hint">${esc(devName(d))}. Your partner confirms on their phone that they received it.</div>
    <label for="g-shop">Partner shop</label><select id="g-shop">${partnerOptions()}</select>
    <label for="g-price">Agreed price (₦), what they pay you if they sell it</label><input id="g-price" inputmode="numeric" value="${esc(d.price || '')}">
    <div class="row"><div><label for="g-date">Date given</label><input id="g-date" type="date" value="${todayISO()}"></div><div><label for="g-due">Return or pay by</label><input id="g-due" type="date" value="${addDays(todayISO(), 3)}"></div></div>
    <label for="g-note">Note</label><input id="g-note" placeholder="With box and charger">
    <div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="give" data-id="${esc(id)}">Give to partner</button></div>`);
}
function newDeal({ownerId, holderId, deviceId, dev, price, dateOut, due, note}) {
  const m = {ownerId, holderId, parties: [ownerId, holderId], ownerName: nameOf(ownerId), holderName: nameOf(holderId), deviceId: deviceId || '', dev, price, dateOut, due, note,
    status: 'pending', paid: 0, claimedPaid: 0, createdBy: uid(), createdAt: Date.now(), updatedAt: Date.now(), history: []};
  m.history = hist(m, `${m.holderName} took it from ${m.ownerName} at ${naira(price)}, due ${fmtDate(due)}${note ? '. ' + note : ''} (recorded by ${S.me.shopName})`);
  return m;
}
function give(id) {
  const d = S.devices[id], price = num(val('g-price')), pid = val('g-shop');
  if (!pid) return toast('Pick a partner'); if (!price) return toast('Enter the agreed price');
  if (!capGuard('deals')) return;
  return guard(async () => {
    const m = newDeal({ownerId: uid(), holderId: pid, deviceId: id, dev: devCopy(d), price, dateOut: val('g-date') || todayISO(), due: val('g-due'), note: val('g-note')});
    const b = writeBatch(db); b.set(doc(db, 'moves', rid()), m); bumpLimit(b, 'deals');
    if (listingFor(id) && listingFor(id).status === 'live') b.update(doc(db, 'listings', uid() + '_' + id), {status: 'hidden', updatedAt: Date.now()});
    await b.commit();
    const ph = member(pid).phone;
    openSheet(`<h3>Given to ${esc(nameOf(pid))}</h3><div class="notice">${esc(nameOf(pid))} sees it in their app and confirms they received it.</div>
      <div class="btns">${ph ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(ph, `Hello ${nameOf(pid)}, I've given you ${devName(d)}${d.imei ? ' (IMEI ' + d.imei + ')' : ''} at ${naira(price)}. Please return or pay by ${fmtDate(m.due)}. Confirm it in ${APP}. Thanks, ${S.me.shopName}`)}">Tell them on WhatsApp</a>` : ''}<button class="btn" data-a="close">Done</button></div>`);
  });
}
function collectForm(fromId) {
  openSheet(`<h3>I collected a phone from a partner</h3><div class="hint">The partner confirms it on their side. Until you return it or pay, it shows as theirs.</div>
    <label for="c-shop">Partner shop</label><select id="c-shop">${partnerOptions(fromId)}</select>
    ${phoneFields()}
    <label for="k-price">Agreed price (₦), what you pay them if you sell it</label><input id="k-price" inputmode="numeric">
    <div class="row"><div><label for="k-date">Date</label><input id="k-date" type="date" value="${todayISO()}"></div><div><label for="k-due">Return or pay by</label><input id="k-due" type="date" value="${addDays(todayISO(), 3)}"></div></div>
    <label for="k-note">Note</label><input id="k-note" placeholder="Optional">
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="collectSave">Record deal</button></div>`);
}
function collectSave() {
  const p = readPhone(), price = num(val('k-price')), pid = val('c-shop');
  if (!pid) return toast('Pick a partner'); if (!p.model) return toast('Enter the model'); if (!price) return toast('Enter the agreed price');
  if (!capGuard('deals')) return;
  return guard(async () => { const b = writeBatch(db); b.set(doc(db, 'moves', rid()), newDeal({ownerId: pid, holderId: uid(), deviceId: '', dev: devCopy(p), price, dateOut: val('k-date') || todayISO(), due: val('k-due'), note: val('k-note').slice(0, 300)})); bumpLimit(b, 'deals'); await b.commit(); closeSheet(); toast('Recorded. Waiting for them to confirm.'); });
}
function sellForm(id) {
  const d = S.devices[id];
  openSheet(`<h3>I sold it</h3><div class="hint">${esc(devName(d))}</div>
    <div class="row"><div><label for="s-to">Buyer name</label><input id="s-to" placeholder="Optional"></div><div><label for="s-ph">Buyer phone</label><input id="s-ph" inputmode="tel" placeholder="For the receipt"></div></div>
    <div class="row"><div><label for="s-amt">Sale price (₦)</label><input id="s-amt" inputmode="numeric" value="${esc(d.price || '')}"></div><div><label for="s-paid">Cash paid now (₦)</label><input id="s-paid" inputmode="numeric" value="${esc(d.price || '')}"></div></div>
    <label for="s-date">Date</label><input id="s-date" type="date" value="${todayISO()}">
    <label class="toggle"><input type="checkbox" id="s-show" checked>Show in "Recently sold" (the buyer is never named)</label>
    <label class="toggle"><input type="checkbox" id="s-swap">Buyer swapped in their old phone</label>
    <div class="sub-box" id="swapBox" hidden>${phoneFields({}, 'w')}<label for="w-val">Swap value (₦), counts as part payment</label><input id="w-val" inputmode="numeric"></div>
    <div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Back</button><button class="btn vio" data-a="sell" data-id="${esc(id)}">Record sale</button></div>`);
}
function sell(id) {
  const amt = num(val('s-amt')); if (!amt) return toast('Enter the sale price');
  const swap = checked('s-swap'), w = readPhone('w'), wv = swap ? num(val('w-val')) : 0;
  if (swap && (!w.model || !wv)) return toast('Enter the swap phone model and value');
  return guard(async () => {
    const d = S.devices[id], cash = num(val('s-paid')), paid = Math.min(cash + wv, amt); let swapId = '';
    if (swap) { swapId = rid(); await setDoc(devRef(swapId), {...w, price: 0, added: val('s-date') || todayISO(), from: 'Swap from ' + (val('s-to') || 'buyer'), notes: 'Taken in swap for ' + devName(d), createdAt: Date.now(), history: [{t: `Taken in swap at ${naira(wv)} (for ${devName(d)})`, ts: Date.now()}]}); }
    const sale = {to: val('s-to'), phone: val('s-ph'), amount: amt, paid, date: val('s-date') || todayISO()};
    if (swap) Object.assign(sale, {swapValue: wv, swapModel: devName(w), swapId});
    await updateDoc(devRef(id), {sale, history: [...(d.history || []), {t: `Sold for ${naira(amt)}${swap ? ` (swap ${naira(wv)} + cash ${naira(cash)})` : `, paid ${naira(paid)}`}`, ts: Date.now()}]});
    if (checked('s-show') && capLeft('sales') > 0) { try { const b = writeBatch(db); addSale(b, {sellerId: uid(), shopName: S.me.shopName, item: [d.model, d.storage].filter(Boolean).join(' '), buyerType: 'customer', buyerLabel: 'a customer' + (S.me.city ? ' in ' + S.me.city : ''), via: 'shop'}); await b.commit(); } catch (e) { console.error(e); } }
    if (listingFor(id) && listingFor(id).status === 'live') { try { await updateDoc(doc(db, 'listings', uid() + '_' + id), {status: 'sold', updatedAt: Date.now()}); } catch (e) { console.error(e); } }
    toast(swap ? 'Sale recorded. Swap phone added to stock.' : 'Sale recorded'); receipt(id);
  });
}
function receiptText(d) {
  const s = d.sale;
  return `🧾 RECEIPT from ${S.me.shopName}\n${fmtDate(s.date)}\n\n${devName(d)}\n${d.condition || ''}${partsOnly(d) ? '\nParts: ' + partsOnly(d) : ''}${faceOf(d) ? '\nFace ID: ' + faceOf(d) : ''}${d.imei ? '\nIMEI: ' + d.imei : ''}\n\nPrice: ${naira(s.amount)}${num(s.swapValue) ? `\nSwap (${s.swapModel}): −${naira(s.swapValue)}` : ''}\nPaid: ${naira(s.paid)}${devOwed(d) ? '\nBalance: ' + naira(devOwed(d)) : '\nFully paid ✓'}\n\n${s.to ? 'Customer: ' + s.to + '\n' : ''}Thank you for buying from ${S.me.shopName}!${S.me.phone ? '\n' + S.me.phone : ''}${S.me.address ? '\n' + S.me.address + (S.me.city ? ', ' + S.me.city : '') : ''}`;
}
function receipt(id) {
  const d = S.devices[id]; if (!d?.sale) return; const t = receiptText(d);
  openSheet(`<h3>Receipt</h3><textarea readonly style="min-height:260px;font-size:13.5px">${esc(t)}</textarea>
    <div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(d.sale.phone, t)}">Send on WhatsApp</a><button class="btn" data-a="copyReceipt" data-id="${esc(id)}">Copy</button></div><div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Back to phone</button></div>`);
}
function devPayForm(id) {
  const d = S.devices[id];
  openSheet(`<h3>Record payment</h3><div class="hint">${esc(d.sale.to || 'Buyer')} still owes ${naira(devOwed(d))}</div><label for="p-amt">Amount received (₦)</label><input id="p-amt" inputmode="numeric" value="${devOwed(d)}">
    <div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="devPay" data-id="${esc(id)}">Record payment</button></div>`);
}
function devPay(id) {
  const a = num(val('p-amt')); if (!a) return toast('Enter the amount');
  return guard(async () => { const d = S.devices[id], paid = Math.min(num(d.sale.paid) + a, num(d.sale.amount)); await updateDoc(devRef(id), {'sale.paid': paid, history: [...(d.history || []), {t: 'Payment received ' + naira(a), ts: Date.now()}]}); devDetail(id); toast('Payment recorded'); });
}
function devUnsell(id) {
  return guard(async () => {
    const d = S.devices[id];
    if (d.sale?.swapId && S.devices[d.sale.swapId] && devState(S.devices[d.sale.swapId]) === 'stock') await deleteDoc(devRef(d.sale.swapId));
    await setDoc(devRef(id), {...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'id' && k !== 'sale')), history: [...(d.history || []), {t: 'Sale undone, back in stock', ts: Date.now()}]});
    devDetail(id); toast('Back in stock');
  });
}

// ----- deal detail -----
function moveDetail(id) {
  const m = S.moves[id]; if (!m) return closeSheet();
  const holder = iHold(m), mine = iCreated(m), other = otherName(m);
  let kv = `<div>Status</div><div>${moveTag(m)}</div>`;
  if (m.dev?.imei) kv += `<div>IMEI or serial</div><div>${esc(m.dev.imei)}</div>`;
  if (m.dev?.condition) kv += `<div>Condition</div><div>${esc(m.dev.condition)}${m.dev.battery ? ', battery ' + esc(m.dev.battery) + '%' : ''}</div>`;
  if (m.dev?.parts) kv += `<div>Parts at hand-over</div><div>${esc(m.dev.parts)}</div>`;
  if (m.dev?.face) kv += `<div>Face ID at hand-over</div><div>${esc(m.dev.face)}</div>`;
  kv += `<div>Date</div><div>${fmtDate(m.dateOut)}</div>`;
  if (m.due) kv += `<div>Return or pay by</div><div style="${overdue(m) ? 'color:var(--red)' : ''}">${fmtDate(m.due)}${overdue(m) ? `, ${daysSince(m.due)} days late` : ''}</div>`;
  if (m.status === 'sold') {
    kv += `<div>Paid (confirmed)</div><div>${naira(m.paid)}</div>`;
    if (num(m.claimedPaid) > num(m.paid)) kv += `<div>Payer says paid</div><div style="color:var(--amber)">${naira(m.claimedPaid)}</div>`;
    kv += `<div>Balance</div><div style="color:${owed(m) ? 'var(--amber)' : 'var(--green-ink)'}">${naira(owed(m))}</div>`;
  }
  if (m.note) kv += `<div>Note</div><div>${esc(m.note)}</div>`;
  let explain = '', acts = '';
  const b = (a, cls, label) => `<button class="btn ${cls}" data-a="${a}" data-id="${esc(id)}">${label}</button>`;
  if (m.status === 'pending') {
    if (!mine) {
      explain = holder ? `Did you receive this phone from ${esc(other)}?` : `${esc(other)} recorded that they collected this phone from you. Is that right?`;
      const myStock = Object.values(S.devices).filter(d => devState(d) === 'stock');
      if (!holder && !m.deviceId && myStock.length) explain += `<label for="link-dev" style="color:inherit">Which of your phones is it? (optional)</label><select id="link-dev"><option value="">Not in my stock list</option>${myStock.map(d => `<option value="${esc(d.id)}">${esc(devName(d))}${d.imei ? ' …' + esc(d.imei.slice(-4)) : ''}</option>`).join('')}</select>`;
      acts = b('confirm', 'pri', 'Yes, confirm') + b('reject', 'red', "No, that's wrong");
    } else { explain = `Waiting for ${esc(other)} to confirm.`; acts = b('cancelDeal', '', 'Cancel this deal'); }
  }
  if (m.status === 'active') {
    if (holder) { explain = 'You have this phone. When it leaves your hands, record what happened.'; acts = b('soldForm', 'vio', 'I sold it') + b('returning', 'pri', 'I returned it'); }
    else { explain = `${esc(other)} has this phone.`; acts = b('forceReturned', 'pri', 'It came back to me') + b('dueForm', '', 'Give more time'); }
  }
  if (m.status === 'returning') {
    if (!holder) { explain = `${esc(other)} says they returned this phone. Did you get it back?`; acts = b('returned', 'pri', 'Yes, I have it') + b('notReturned', 'red', "No, I don't"); }
    else explain = `Waiting for ${esc(other)} to confirm they got it back.`;
  }
  if (m.status === 'sold' && owed(m) > 0) {
    if (holder) { explain = `You owe ${esc(other)} ${naira(owed(m))}.`; acts = b('claimForm', 'pri', 'I paid'); }
    else { explain = `${esc(other)} owes you ${naira(owed(m))}.`; acts = b('payForm', 'pri', num(m.claimedPaid) > num(m.paid) ? 'Confirm the payment' : 'Record a payment'); }
  }
  const ph = member(otherId(m)).phone;
  const waText = overdue(m) || owed(m) > 0
    ? `Hello ${other}, a reminder about ${devName(m.dev)}${m.dev?.imei ? ' (IMEI ' + m.dev.imei + ')' : ''}: ${owed(m) > 0 ? 'balance of ' + naira(owed(m)) + ' is still unpaid' : 'it was due back on ' + fmtDate(m.due)}. Please sort it today. Thanks, ${S.me.shopName}`
    : `Hello ${other}, about ${devName(m.dev)}${m.dev?.imei ? ' (IMEI ' + m.dev.imei + ')' : ''}, ${naira(m.price)}: `;
  openSheet(`<h3>${esc(devName(m.dev))}</h3>
    <div class="hslip"><div class="parties"><div><small>Owner</small><b>${esc(nameOf(m.ownerId))}</b></div><span class="arrow">→</span><div><small>Holding it</small><b>${esc(nameOf(m.holderId))}</b></div></div>${perf}<small>Agreed price</small><div class="amt">${naira(m.price)}</div></div>
    ${explain ? `<div class="notice">${explain}</div>` : ''}<div class="btns">${acts}</div><div class="kv">${kv}</div>
    <div class="btns">${ph ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(ph, waText)}">${overdue(m) || owed(m) > 0 ? 'Send reminder' : 'WhatsApp ' + esc(other)}</a>` : ''}<button class="btn" data-a="copyMove" data-id="${esc(id)}">Copy details</button><button class="btn" data-a="close">Close</button></div>
    ${['active', 'returning', 'sold', 'returned'].includes(m.status) ? `<div class="btns"><button class="btn" data-a="partMoveForm" data-id="${esc(id)}">Record a part change</button></div>` : ''}
    <h2>History</h2><div class="hist">${(m.history || []).slice().reverse().map(h => `<div>${esc(h.t)}<small>${esc(h.by || '')}, ${fmtTs(h.ts)}</small></div>`).join('')}</div>`);
}
async function patchMove(id, patch, text, msg) {
  return guard(async () => { const m = S.moves[id]; await updateDoc(doc(db, 'moves', id), {...patch, history: hist(m, text), updatedAt: Date.now()}); toast(msg || 'Saved'); setTimeout(() => moveDetail(id), 50); });
}
const me = () => S.me.shopName;
// ----- examples: 4 sample items shown in an empty section so new shops see how it works.
// They live only in the app (nothing is saved or shown to anyone else) and vanish once the shop adds its own.
const EXAMPLES = {
  stock: [['iPhone 15 Pro Max 256GB Natural Titanium', 'UK used, Non display, ID', '₦980k', 'In stock', 'g'], ['iPhone 14 Pro 128GB Deep Purple', 'US used, Display screen (DM), ID', '₦640k', 'With partner', 'y'], ['iPhone 13 128GB Midnight', 'UK used, Non display, ID', '₦390k', 'In stock', 'g'], ['iPhone 12 64GB White', 'Nigerian used, DDM, Off ID', '₦250k', 'Sold', 'gr']],
  moves: [['iPhone 14 Pro 128GB', 'Example Phones has it, due Friday', '₦640k', 'With them', 'y'], ['iPhone 15 128GB', 'You collected it from Example Gadgets', '₦690k', 'You have it', 'g'], ['iPhone 13 Pro 256GB', 'Sold by Example Phones, ₦100k unpaid', '₦520k', 'Unpaid', 'rd'], ['iPhone 11 64GB', 'Returned to you yesterday', '₦210k', 'Closed', 'gr']],
  listings: [['iPhone 15 Pro Max 256GB', 'UK used, Non display, ID', '₦1.08m', 'Live', 'g'], ['iPhone 14 128GB', 'UK used, Non display, ID', '₦560k', 'Live', 'g'], ['iPhone 13 Pro 128GB', 'US used, Display screen (DM), ID', '₦520k', 'Hidden', 'gr'], ['iPhone 12 Pro 256GB', 'UK used, Non display, ID', '₦430k', 'Sold', 'gr']],
  orders: [['iPhone 15 Pro Max 256GB', 'Customer in Kano, 10 min ago', '₦1.08m', 'Confirm it', 'y'], ['iPhone 14 128GB', 'Customer in Abuja, paid', '₦560k', 'Deliver now', 'y'], ['iPhone 13 Pro 128GB', 'Customer in Kaduna, delivered', '₦520k', 'Waiting', 'gr'], ['iPhone 12 Pro 256GB', 'Customer in Lagos, completed', '₦430k', 'Done', 'g']],
  escrows: [['iPhone 15 Pro 256GB', 'You buying from Example Phones', '₦850k', 'Waiting for seller', 'y'], ['iPhone 14 Pro Max 256GB', 'Example Gadgets buying from you', '₦790k', 'Money with middleman', 'g'], ['iPhone 13 128GB', 'You buying from Example Mobile', '₦380k', 'Phone handed over', 'y'], ['iPhone 12 64GB', 'Example Phones buying from you', '₦240k', 'Completed', 'gr']],
  feed: [['sell', 'iPhone 15 Pro Max 256GB', 'UK used · Non display · Face ID: ID', 980000, 'Clean, battery 89%, box and cable. Dealer price.'], ['buy', 'iPhone 14 Pro 128GB', 'UK used · Non display', 0, 'Looking for 2 units, battery 85% and above. Paying today.'], ['swap', 'iPhone 13 Pro 256GB', 'UK used · Face ID: ID', 0, 'Want to swap for iPhone 15 Pro. I will add balance.'], ['news', '', '', 0, 'New stock of iPhone 16 series landing this weekend. Message me to reserve.']],
};
const EX_HELP = {
  stock: ['Your stock', 'Every phone you buy goes here. Only you can see it. Open a phone to give it to a partner, sell it, list it in the store or broadcast it.', 'addDev', 'Add your first iPhone'],
  moves: ['Deals with other shops', 'When you give a phone to another shop, or collect one from them, it shows here. The other shop confirms it on their phone, so you both see the same record.', 'collect', 'Record a deal'],
  listings: ['Your store listings', 'Phones you put in the customer store, with the price customers pay. To list one, open a phone in Stock and tap Sell to customers.', '', ''],
  orders: ['Customer orders', 'When a customer orders one of your listed phones, it shows here. You confirm it is available, the customer pays, you deliver, and you are paid after they confirm.', '', ''],
  escrows: ['Middleman deals', 'Buy from another shop safely: the money is held until the buyer confirms the phone is fine. Open a Selling post and tap Buy with middleman.', '', ''],
  feed: ['Broadcast board', 'Post what you are selling, what you are looking for, swaps or news. Every approved shop sees it.', 'compose', 'Post your first broadcast'],
};
function examplesBlock(kind) {
  const rows = EXAMPLES[kind];
  if (kind === 'feed') return `<div class="ex-note">Examples. This is how posts look. They disappear when real posts come in.</div>` + rows.map(([t, m, spec, price, text]) => `<button class="card click ex-card" data-a="exInfo" data-v="feed"><div class="post-h"><div class="av" aria-hidden="true">EX</div><div style="flex:1;min-width:0;text-align:left"><b>Example Shop</b> <span class="tag gr">Example</span><div class="mute" style="font-size:13px">Kano, 1h ago</div></div><span class="tag ${t === 'sell' ? 'g' : t === 'buy' ? 'y' : 'gr'}">${(TYPES[t] || TYPES.news)[0]}</span></div><p style="text-align:left;margin:8px 0">${text}</p>${m ? `<div class="post-spec"><span class="spec">${m}</span>${spec ? `<span class="spec">${spec}</span>` : ''}${price ? `<span class="post-price">${naira(price)}</span>` : ''}</div>` : ''}</button>`).join('');
  return `<div class="ex-note">Examples. They show how this page works and disappear once you add your own.</div><div class="list">` + rows.map(([t, m, p, tag, c]) => `<button class="item ex" data-a="exInfo" data-v="${kind}"><span class="glyph ${c === 'g' ? 'in' : 'done'}"></span><span style="min-width:0"><div class="t">${t} <span class="tag gr" style="margin:0">Example</span></div><div class="m">${m}</div></span><span class="r"><div class="p">${p}</div><span class="tag ${c}">${tag}</span></span></button>`).join('') + '</div>';
}
const _i = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const NOTE_ICON = {move: _i('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'), order: _i('<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'), escrow: _i('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/>'), post: _i('<path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M17 9a4 4 0 0 1 0 6"/>'), listing: _i('<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="7.5" r="1.2"/>'), review: _i('<path d="M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z"/>'), bell: _i('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>')};
function exInfo(kind) {
  const [title, text, act, label] = EX_HELP[kind] || EX_HELP.stock;
  openSheet(`<h3>${title}</h3><div class="notice">This is an example, not a real record. It is only shown to you and disappears once you add your own.</div><p style="font-size:14.5px">${text}</p><div class="btns">${act ? `<button class="btn pri" data-a="${act}">${label}</button>` : ''}<button class="btn" data-a="close">Got it</button></div>`);
}
// ----- owner: edit the Parts and Face ID dropdowns for everyone -----
function optionsForm() {
  if (!isOwner()) return;
  openSheet(`<h3>Dropdown options</h3><div class="hint">One option per line, in the order you want. Every shop sees the new list straight away. Phones already saved keep what they have.</div>
    <label for="o-parts">Parts dropdown</label><textarea id="o-parts" style="min-height:150px">${esc(PARTS_OPTS().join('\n'))}</textarea>
    <label for="o-face">Face ID dropdown</label><textarea id="o-face" style="min-height:90px">${esc(FACE_OPTS().join('\n'))}</textarea>
    <div class="btns"><button class="btn" data-a="optionsReset">Use the original list</button></div>
    <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="optionsSave">Save options</button></div>`);
}
function optionsSave(reset) {
  const lines = id => [...new Set(val(id).split('\n').map(x => x.trim().replace(/,/g, ' ')).filter(Boolean))];
  const partsOptions = reset ? DEF_PARTS : lines('o-parts'), faceOptions = reset ? DEF_FACE : lines('o-face');
  if (!partsOptions.length || !faceOptions.length) return toast('Each dropdown needs at least one option');
  if (partsOptions.length > 30 || faceOptions.length > 10) return toast('Up to 30 parts options and 10 Face ID options');
  if ([...partsOptions, ...faceOptions].some(x => x.length > 60)) return toast('Keep each option under 60 characters');
  return guard(async () => { await setDoc(doc(db, 'settings', 'options'), {partsOptions, faceOptions, updatedAt: Date.now()}); closeSheet(); toast('Options saved'); });
}
// ----- part changes: recorded on a phone, or inside a deal so both shops see it -----
function partForm(kind, id) {
  const what = kind === 'move' ? devName(S.moves[id].dev) : devName(S.devices[id]);
  openSheet(`<h3>Record a part change</h3><div class="hint">${esc(what)}. ${kind === 'move' ? 'Saved in this deal\'s history, so both shops see it.' : 'Saved in this phone\'s history.'}</div>
    <label for="pc-part">Which part?</label><select id="pc-part">${PARTS.map(x => `<option>${x}</option>`).join('')}<option>Other</option></select>
    <label for="pc-what">What happened</label><select id="pc-what"><option>Replaced</option><option>Repaired</option><option>Found changed</option></select>
    <label for="pc-note">Details (optional)</label><input id="pc-note" maxlength="120" placeholder="Changed to original pull at Farm Centre">
    <div class="btns"><button class="btn" data-a="${kind === 'move' ? 'openMove' : 'devBack'}" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="${kind === 'move' ? 'partMoveSave' : 'partDevSave'}" data-id="${esc(id)}">Save</button></div>`);
}
function readPartChange() { const part = val('pc-part'), what = val('pc-what'), note = val('pc-note').slice(0, 120); if (!part) { toast('Pick the part'); return ''; } return `Part change: ${part} ${what.toLowerCase()}${note ? ', ' + note : ''}`; }
async function applyPartToDev(devId, text) {
  const d = S.devices[devId], add = text.replace(/^Part change: /, '');
  const info = [partsOnly(d), add].filter(Boolean).join(', ').slice(0, 120);
  await updateDoc(devRef(devId), {partsInfo: info, partsStatus: '', parts: [], partsNote: '', history: [...(d.history || []), {t: text, ts: Date.now()}]});
}
const actions = {
  confirm: id => { const link = val('link-dev'); patchMove(id, link ? {status: 'active', deviceId: link} : {status: 'active'}, `${me()} confirmed the deal`, 'Confirmed'); },
  reject: id => patchMove(id, {status: 'rejected'}, `${me()} rejected it. Says it didn't happen.`, 'Rejected'),
  cancelDeal: id => patchMove(id, {status: 'cancelled'}, `${me()} cancelled this deal`, 'Cancelled'),
  returning: id => patchMove(id, {status: 'returning'}, `${me()} says the phone was returned`, 'Waiting for them to confirm'),
  returned: id => patchMove(id, {status: 'returned', closedAt: todayISO()}, `${me()} confirmed the phone is back`, 'Phone is back'),
  forceReturned: id => patchMove(id, {status: 'returned', closedAt: todayISO()}, `${me()} marked the phone as back`, 'Back in stock'),
  notReturned: id => patchMove(id, {status: 'active'}, `${me()} says the phone did NOT come back`, 'Marked as not returned'),
  soldForm: id => {
    const m = S.moves[id];
    openSheet(`<h3>I sold it</h3><div class="hint">${esc(devName(m.dev))}. You owe ${esc(otherName(m))} the agreed price, <b>${naira(m.price)}</b>.</div>
      <label for="s-paid">Paying ${esc(otherName(m))} now (₦)</label><input id="s-paid" inputmode="numeric" value="${num(m.price)}">
      <div class="row"><div><label for="s-amt">You sold it for (₦)</label><input id="s-amt" inputmode="numeric" placeholder="Optional"></div><div><label for="s-date">Date</label><input id="s-date" type="date" value="${todayISO()}"></div></div>
      <div class="btns"><button class="btn" data-a="openMove" data-id="${esc(id)}">Back</button><button class="btn vio" data-a="sold" data-id="${esc(id)}">Record sale</button></div>`);
  },
  sold: id => { const m = S.moves[id], paidNow = Math.min(num(val('s-paid')), num(m.price)), amt = num(val('s-amt')); patchMove(id, {status: 'sold', soldAt: val('s-date') || todayISO(), soldInfo: {amount: amt}, claimedPaid: paidNow}, `${me()} sold it` + (paidNow ? `, says they paid ${naira(paidNow)}` : ', nothing paid yet'), 'Sale recorded'); },
  claimForm: id => { const m = S.moves[id]; openSheet(`<h3>I paid</h3><div class="hint">Balance ${naira(owed(m))}. ${esc(otherName(m))} confirms when the money arrives.</div><label for="c-amt">Amount paid (₦)</label><input id="c-amt" inputmode="numeric" value="${owed(m)}"><div class="btns"><button class="btn" data-a="openMove" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="claim" data-id="${esc(id)}">Record payment</button></div>`); },
  claim: id => { const m = S.moves[id], a = num(val('c-amt')); if (!a) return toast('Enter the amount'); patchMove(id, {claimedPaid: Math.min(Math.max(num(m.claimedPaid), num(m.paid)) + a, num(m.price))}, `${me()} says they paid ${naira(a)}`, 'Sent for confirmation'); },
  payForm: id => { const m = S.moves[id], cl = Math.max(0, num(m.claimedPaid) - num(m.paid)); openSheet(`<h3>Payment received</h3><div class="hint">Balance ${naira(owed(m))}${cl ? `. ${esc(otherName(m))} says they paid <b>${naira(cl)}</b>.` : ''}</div><label for="p-amt">Amount you received (₦)</label><input id="p-amt" inputmode="numeric" value="${cl || owed(m)}">${iOwn(m) ? '<label class="toggle"><input type="checkbox" id="p-show" checked>When fully paid, show in "Recently sold" (the buyer is never named)</label>' : ''}<div class="btns"><button class="btn" data-a="openMove" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="pay" data-id="${esc(id)}">Confirm the payment</button></div>`); },
  pay: id => { const m = S.moves[id], a = num(val('p-amt')); if (!a) return toast('Enter the amount'); const paid = Math.min(num(m.paid) + a, num(m.price)), full = paid >= num(m.price), show = checked('p-show');
    patchMove(id, full ? {paid, closedAt: todayISO()} : {paid}, `${me()} confirmed receiving ${naira(a)}` + (full ? '. Fully paid.' : `. Balance ${naira(num(m.price) - paid)}.`), full ? 'Fully paid' : 'Payment confirmed')
      .then(async () => { if (full && show && iOwn(m) && capLeft('sales') > 0) { try { const b = writeBatch(db); addSale(b, {sellerId: uid(), shopName: S.me.shopName, item: [m.dev?.model, m.dev?.storage].filter(Boolean).join(' '), buyerType: 'dealer', buyerLabel: 'a dealer' + (member(m.holderId).city ? ' in ' + member(m.holderId).city : ''), via: 'deal'}); await b.commit(); } catch (e) { console.error(e); } } }); },
  dueForm: id => { const m = S.moves[id]; openSheet(`<h3>Give more time</h3><label for="d-due">New return or pay date</label><input id="d-due" type="date" value="${addDays(m.due && m.due > todayISO() ? m.due : todayISO(), 2)}"><label for="d-note">Reason</label><input id="d-note" placeholder="Customer coming Friday"><div class="btns"><button class="btn" data-a="openMove" data-id="${esc(id)}">Back</button><button class="btn pri" data-a="setDue" data-id="${esc(id)}">Save date</button></div>`); },
  setDue: id => { const due = val('d-due'); if (!due) return toast('Pick a date'); patchMove(id, {due}, `More time given, now due ${fmtDate(due)}${val('d-note') ? '. ' + val('d-note') : ''}`, 'Date saved'); },
  partMoveForm: id => partForm('move', id),
  partMoveSave: id => { const m = S.moves[id], pc = readPartChange(); if (!pc) return;
    const devId = iOwn(m) && m.deviceId && S.devices[m.deviceId] ? m.deviceId : '';
    const go = () => patchMove(id, {}, `${pc} (reported by ${me()})`, 'Part change recorded');
    return devId ? guard(async () => { await applyPartToDev(devId, pc); }).then(go) : go(); },
  copyMove: id => { const m = S.moves[id]; copy(`${devName(m.dev)}${m.dev?.imei ? '\nIMEI: ' + m.dev.imei : ''}${m.dev?.parts ? '\nParts: ' + m.dev.parts : ''}${m.dev?.face ? '\nFace ID: ' + m.dev.face : ''}\nOwner: ${nameOf(m.ownerId)}\nHolding it: ${nameOf(m.holderId)}\nAgreed price: ${naira(m.price)}\nDate: ${fmtDate(m.dateOut)}${m.due ? '\nReturn or pay by: ' + fmtDate(m.due) : ''}${m.status === 'sold' ? '\nBalance: ' + naira(owed(m)) : ''}`); },
};
function csv(rows) { return rows.map(r => r.map(v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }
function download(name, text) {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv'})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('Downloaded ' + name); }
  catch { copy(text, 'Copied. Paste into Excel or Sheets.'); }
}
async function updateMember(id, patch, msg) { return guard(async () => { await updateDoc(doc(db, 'members', id), patch); toast(msg); setTimeout(() => adminSheet(id), 50); }); }

// ================= events =================
document.addEventListener('click', e => {
  const t = e.target;
  const pw = t.closest('[data-pw]'); if (pw) { const i = $('#' + pw.dataset.pw); if (i) { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; pw.textContent = show ? 'Hide' : 'Show'; pw.setAttribute('aria-pressed', String(show)); pw.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); i.focus(); } return; }
  const au = t.closest('[data-auth]'); if (au) return authView(au.dataset.auth);
  const tab = t.closest('[data-tab]'); if (tab) { closeSheet(); S.view = tab.dataset.tab; S.q = ''; S.filter = S.view === 'stock' ? 'stock' : 'open'; render(); scrollTo(0, 0); return; }
  const go = t.closest('[data-goto]'); if (go) { const [v, f] = go.dataset.goto.split(':'); S.view = v; S.filter = f; render(); scrollTo(0, 0); return; }
  const f = t.closest('[data-f]'); if (f) { S.filter = f.dataset.f; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const ft = t.closest('[data-ft]'); if (ft) { S.feedType = ft.dataset.ft; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const af = t.closest('[data-af]'); if (af) { S.adminFilter = af.dataset.af; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const of = t.closest('[data-of]'); if (of) { S.ordFilter = of.dataset.of; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const ef = t.closest('[data-ef]'); if (ef) { S.escFilter = ef.dataset.ef; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const sr = t.closest('[data-site-report]'); if (sr) { e.preventDefault(); if (S.started) return siteReportForm(); if (window.__openStoreReport) return window.__openStoreReport(); location.href = (STORE_URL || 'store.html').split('#')[0] + '#report'; return; }
  const rs = t.closest('[data-rs]'); if (rs) { S.reportSource = rs.dataset.rs; S.reportFilter = 'open'; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const fb = t.closest('[data-feedback]'); if (fb) return feedbackDetail(fb.dataset.feedback);
  const rf = t.closest('[data-rf]'); if (rf) { S.reportFilter = rf.dataset.rf; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const bar = t.closest('[data-bar]'); if (bar) { S.chartSel = +bar.dataset.bar; $('#main').innerHTML = views[S.view]() + CREDIT; return; }
  const a = t.closest('[data-a]');
  if (a) {
    const id = a.dataset.id, act = a.dataset.a, v = a.dataset.v;
    const map = {
      logout: () => { closeSheet(); stopAll(); signOut(auth); }, close: closeSheet,
      saveProfile: () => {
        const box = id === 'new' ? $('#app') : sheet, q = s => (box.querySelector(s)?.value || '').trim();
        const tk = q('#p-tiktok'); if (tk && !tiktokUrl(tk)) return toast('TikTok link should start with https://www.tiktok.com/');
        const prof = {shopName: q('#p-shop'), name: q('#p-name'), address: q('#p-addr'), city: q('#p-city'), state: q('#p-state'), phone: q('#p-phone'), bio: q('#p-bio'), tiktok: tk ? tiktokUrl(tk) : ''};
        if (!prof.shopName || !prof.phone) return toast('Shop name and WhatsApp number are needed');
        if (!prof.state) return toast('Choose your state');
        if (S.draftLogo !== undefined) prof.logo = S.draftLogo;
        if (id === 'new') return createMember(prof).catch(dbErr);
        if (!isOwner()) delete prof.shopName;
        return guard(async () => {
          await updateDoc(doc(db, 'members', uid()), {...prof, updatedAt: Date.now()});
          // keep the logo on your store listings in step
          if (prof.logo !== undefined && Object.keys(S.listings).length) { const b = writeBatch(db); Object.values(S.listings).filter(l => l.vendorId === uid()).forEach(l => b.update(doc(db, 'listings', uid() + '_' + l.deviceId), {shopLogo: prof.logo})); try { await b.commit(); } catch (e) { console.error(e); } }
          S.draftLogo = undefined; closeSheet(); toast('Profile saved');
        });
      },
      dropLogo: () => { S.draftLogo = ''; const pv = $('#p-logo-prev'); if (pv) pv.textContent = initials(S.me?.shopName); toast('Logo will be removed when you save'); },
      editProfile: () => profileForm(false), premium: () => premiumSheet(false),
      rateForm: () => rateForm(id),
      pickStar: () => { S.draftStars = Number(v); sheet.querySelectorAll('.starpick button').forEach((b, i) => { b.classList.toggle('on', i < S.draftStars); b.setAttribute('aria-checked', i < S.draftStars); }); $('#starword').textContent = ['', 'Very bad', 'Bad', 'Okay', 'Good', 'Excellent'][S.draftStars]; },
      saveRating: () => {
        if (!S.draftStars) return toast('Tap the stars to choose a rating');
        const old = S.ratings[id + '_' + uid()];
        if (!old && !capGuard('ratings')) return;
        return guard(async () => { const b = writeBatch(db); b.set(doc(db, 'ratings', id + '_' + uid()), {vendorId: id, raterId: uid(), raterName: S.me.shopName, stars: S.draftStars, text: val('rv-text').slice(0, 300), createdAt: old?.createdAt || Date.now(), updatedAt: Date.now()}); if (!old) bumpLimit(b, 'ratings'); await b.commit(); S.ratings[id + '_' + uid()] = {id: id + '_' + uid(), vendorId: id, raterId: uid(), raterName: S.me.shopName, stars: S.draftStars, text: val('rv-text').slice(0, 300), createdAt: old?.createdAt || Date.now(), updatedAt: Date.now()}; toast('Review saved'); memberSheet(id); });
      },
      delRating: () => guard(async () => { await deleteDoc(doc(db, 'ratings', id + '_' + uid())); delete S.ratings[id + '_' + uid()]; toast('Review deleted'); memberSheet(id); }),
      delReview: () => guard(async () => { await deleteDoc(doc(db, 'ratings', id)); delete S.ratings[id]; toast('Review removed'); memberSheet(v); }),
      reportForm: () => reportForm(id, a.dataset.post),
      sendReport: () => {
        const reason = sheet.querySelector('input[name=rreason]:checked')?.value, details = val('rp-text');
        if (!reason) return toast('Choose what went wrong'); if (!details) return toast('Tell us what happened');
        if (!capGuard('reports')) return;
        return guard(async () => { const b = writeBatch(db); b.set(doc(db, 'reports', rid()), {vendorId: id, reporterId: uid(), reporterName: S.me.shopName, reason, details: details.slice(0, 1000), postId: a.dataset.post || '', status: 'open', createdAt: Date.now()}); bumpLimit(b, 'reports'); await b.commit(); closeSheet(); toast(`Report sent. ${APP} will check it.`); });
      },
      openReport: () => reportDetail(id),
      siteReport: siteReportForm,
      sendSiteReport: () => {
        const category = sheet.querySelector('input[name=sc]:checked')?.value, details = val('sr-det');
        if (!category) return toast('Choose what the problem is about'); if (details.length < 5) return toast('Tell us what happened');
        const d = dayNum(), l = S.custLimits && S.custLimits.day === d ? S.custLimits : {};
        if (!isOwner() && (l.reports || 0) >= 5) return toast('Daily limit reached for reports. WhatsApp us if urgent.');
        return guard(async () => { const b = writeBatch(db); b.set(doc(db, 'feedback', rid()), {reporterUid: uid(), from: 'vendor', category, subject: val('sr-sub').slice(0, 120), details: details.slice(0, 1000), contact: (S.me.phone || '').slice(0, 40), page: S.view, status: 'open', createdAt: Date.now()});
          if (!isOwner()) b.set(doc(db, 'custlimits', uid()), {day: d, orders: l.orders || 0, reports: (l.reports || 0) + 1}); await b.commit(); closeSheet(); toast(`Report sent to ${APP}. Thank you.`); });
      },
      fbResolve: () => guard(async () => { await updateDoc(doc(db, 'feedback', id), {status: 'resolved'}); feedbackDetail(id); }),
      fbReopen: () => guard(async () => { await updateDoc(doc(db, 'feedback', id), {status: 'open'}); feedbackDetail(id); }),
      fbDelete: () => guard(async () => { await deleteDoc(doc(db, 'feedback', id)); closeSheet(); toast('Report deleted'); }),
      allSales: () => openSheet(`<h3>Recently sold</h3><div class="hint">Closed deals across ${esc(APP)}. Buyers are never named.</div><div class="list">${S.sales.map(x => `<div class="item" style="cursor:default"><span style="font-size:20px">✓</span><span style="min-width:0;flex:1"><div class="t">${esc(x.item)}</div><div class="m">sold by <span class="who-link" data-member="${esc(x.sellerId)}" style="color:var(--ink);font-weight:600">${esc(x.shopName)}</span> ${esc(soldLine(x))}, ${ago(x.createdAt)}${x.via === 'store' ? ', via the store' : ''}</div></span>${isOwner() || x.sellerId === uid() ? `<button class="small-btn" data-a="delSale" data-id="${esc(x.id)}">Remove</button>` : ''}</div>`).join('') || '<p class="mute">No sales yet.</p>'}</div><div class="btns"><button class="btn" data-a="close">Close</button></div>`),
      delSale: () => guard(async () => { await deleteDoc(doc(db, 'sales', id)); toast('Removed'); closeSheet(); }),
      notifs: notifSheet, markRead, openNotif: () => openNotif(v, id), prefsForm, savePrefs,
      digest: () => { const t = digestText(); openSheet(`<h3>WhatsApp daily digest</h3><div class="hint">Post this in your dealers' or customers' WhatsApp group so everyone sees today's listings.</div><textarea readonly style="min-height:260px;font-size:13.5px">${esc(t)}</textarea><div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t)}">Share on WhatsApp</a><button class="btn" data-a="copyDigest">Copy</button></div>${COMMUNITY_URL ? `<div class="btns"><a class="btn" target="_blank" rel="noopener" href="${esc(COMMUNITY_URL)}">Open your WhatsApp group</a></div>` : ''}`); },
      copyDigest: () => copy(digestText(), 'Digest copied'),
      listingForm: () => listingForm(id), saveListing: () => saveListing(id),
      delListing: () => guard(async () => { await deleteDoc(doc(db, 'listings', uid() + '_' + id)); toast('Removed from store'); devDetail(id); }),
      ordAccept: () => ordSet(id, 'accepted', `${S.me.shopName} confirmed it's available`, 'Confirmed. The customer will be asked to pay.'),
      ordReject: () => ordSet(id, 'rejected', `${S.me.shopName} said it's not available`, 'Marked not available', async o => { const lid = o.listingId; if (S.listings[lid]) await updateDoc(doc(db, 'listings', lid), {status: 'hidden', updatedAt: Date.now()}); }),
      ordPaid: () => ordSet(id, 'paid', `${APP} received the customer's payment`, 'Marked as paid. The seller will deliver.'),
      ordDelivered: () => ordSet(id, 'delivered', `${S.me.shopName} delivered the phone`, 'Marked delivered. Phone marked sold in your stock.', async o => {
        const lid = o.listingId; if (S.listings[lid]) await updateDoc(doc(db, 'listings', lid), {status: 'sold', updatedAt: Date.now()});
        const devId = S.listings[lid]?.deviceId, d = S.devices[devId];
        if (d && !d.sale) { const net = num(o.amount) - num(o.commission); const c = (await loadContact(o.id)) || {}; await updateDoc(devRef(devId), {sale: {to: (c.customerName || 'Store customer') + ' (store)', phone: c.customerPhone || '', amount: net, paid: net, date: todayISO()}, history: [...(d.history || []), {t: `Sold in ${STORE_NAME} for ${naira(o.amount)} (you receive ${naira(net)})`, ts: Date.now()}]}); }
      }),
      ordComplete: () => ordSet(id, 'completed', `${APP} paid the seller`, 'Order completed', async o => { const b = writeBatch(db); b.set(doc(db, 'sales', rid()), saleDoc({sellerId: o.vendorId, shopName: nameOf(o.vendorId), item: String(o.item || '').split(',')[0], buyerType: 'customer', buyerLabel: 'a customer in ' + (o.city || 'Nigeria'), via: 'store'})); await b.commit(); }),
      ordRefund: () => ordSet(id, 'refunded', `${APP} refunded the customer`, 'Refund recorded'),
      ordCancel: () => ordSet(id, 'cancelled', `${APP} cancelled the order`, 'Order cancelled'),
      toggleSetting: () => guard(async () => { const next = {joinsOpen: S.settings.joinsOpen !== false, postingOpen: S.settings.postingOpen !== false, storeOpen: S.settings.storeOpen !== false}; next[v] = !next[v]; await setDoc(doc(db, 'settings', 'platform'), {...next, updatedAt: Date.now()}); toast(next[v] ? 'Turned back on' : 'Paused for everyone'); }),
      escrowForm: () => escrowForm(id, a.dataset.post),
      escrowCreate: () => {
        const item = val('e-item').slice(0, 120), amount = num(val('e-amt')); if (!item) return toast('Describe the phone'); if (!amount) return toast('Enter the agreed price');
        if (!capGuard('escrows')) return;
        return guard(async () => {
          const eid = rid(), e = {buyerId: uid(), sellerId: id, parties: [uid(), id], postId: a.dataset.post || '', item, amount, fee: feeFor(amount), note: val('e-note'), status: 'requested', createdAt: Date.now(), updatedAt: Date.now(), history: []};
          e.history = escHist(e, `${S.me.shopName} asked to buy through the middleman for ${naira(amount)}`);
          e.note = (e.note || '').slice(0, 300); const b = writeBatch(db); b.set(doc(db, 'escrows', eid), e); bumpLimit(b, 'escrows'); await b.commit(); toast('Request sent to ' + nameOf(id)); escrowDetail(eid);
        });
      },
      escAccept: () => escSet(id, 'accepted', `${S.me.shopName} accepted. Buyer to pay the middleman.`, 'Accepted'),
      escDecline: () => escSet(id, 'declined', `${S.me.shopName} declined`, 'Declined'),
      escCancel: () => escSet(id, 'cancelled', `${S.me.shopName} cancelled`, 'Cancelled'),
      escPaid: () => escSet(id, 'paid', `${APP} received the buyer's payment`, 'Marked as paid'),
      escDelivered: () => escSet(id, 'delivered', `${S.me.shopName} handed over the phone`, 'Buyer will now confirm'),
      escReceived: () => escSet(id, 'received', `${S.me.shopName} confirmed the phone is fine`, 'Confirmed. Seller will be paid.'),
      escReleased: () => escSet(id, 'released', `${APP} paid the seller`, 'Deal completed'),
      escRefund: () => escSet(id, 'refunded', `${APP} refunded the buyer`, 'Refund recorded'),
      escDisputeForm: () => openSheet(`<h3>Report a problem</h3><div class="hint">${esc(APP)} holds the money and will contact both sides before deciding.</div><label for="d-why">What's wrong?</label><textarea id="d-why" maxlength="500" placeholder="Phone not as described, not delivered, iCloud locked…"></textarea><div class="btns"><button class="btn" data-a="openEscrow" data-id="${esc(id)}">Back</button><button class="btn red" data-a="escDispute" data-id="${esc(id)}">Open dispute</button></div>`),
      escDispute: () => { const why = val('d-why'); if (!why) return toast('Explain the problem'); escSet(id, 'disputed', `${S.me.shopName} opened a dispute: ${why}`, 'Dispute opened', {disputeReason: why}); },
      openEscrow: () => escrowDetail(id),
      resolveReport: () => guard(async () => { await updateDoc(doc(db, 'reports', id), {status: 'resolved', resolvedAt: Date.now()}); toast('Marked resolved'); reportDetail(id); }),
      reopenReport: () => guard(async () => { await updateDoc(doc(db, 'reports', id), {status: 'open'}); toast('Reopened'); reportDetail(id); }),
      suspendVendor: () => guard(async () => { await updateDoc(doc(db, 'members', S.reports[id].vendorId), {status: 'suspended'}); toast('Shop suspended'); reportDetail(id); }),
      delReport: () => guard(async () => { await deleteDoc(doc(db, 'reports', id)); closeSheet(); toast('Report deleted'); }),
      compose: () => composeForm(), publish, dropPhoto: () => { S.draftPhoto = null; $('#c-prev').hidden = true; $('#c-photo').value = ''; },
      morePosts: () => { S.postLimit += 25; subscribePosts(); },
      openPost: () => openPost(id), comment: () => comment(id), delComment: () => delComment(id, a.dataset.cid),
      postSold: () => guard(async () => { await updateDoc(doc(db, 'posts', id), {status: 'sold', updatedAt: Date.now()}); toast('Marked as sold'); }),
      postDelAsk: () => openSheet(`<h3>Delete this post?</h3><div class="hint">It disappears from the broadcast for everyone. Your daily count doesn't go back up.</div><div class="btns"><button class="btn" data-a="close">Keep it</button><button class="btn red" data-a="postDel" data-id="${esc(id)}">Delete</button></div>`),
      postDel: () => guard(async () => { await deleteDoc(doc(db, 'posts', id)); closeSheet(); toast('Post deleted'); }),
      broadcastDev: () => { const d = S.devices[id]; composeForm({type: 'sell', model: d.model, storage: d.storage, condition: d.condition, partsInfo: partsOnly(d), face: faceOf(d), price: d.price, text: [d.color, d.battery ? 'Battery ' + d.battery + '%' : '', d.notes].filter(Boolean).join('. ')}); },
      addDev: () => deviceForm(null), saveDev: () => saveDev(id), editDev: () => deviceForm(S.devices[id]), devBack: () => devDetail(id),
      giveForm: () => giveForm(id), give: () => give(id), sellForm: () => sellForm(id), sell: () => sell(id),
      optionsForm, optionsSave: () => optionsSave(false), optionsReset: () => optionsSave(true),
      expForm: () => expForm(id), expSave: () => expSave(id), partDevForm: () => partForm('dev', id), partDevSave: () => { const pc = readPartChange(); if (pc) return guard(async () => { await applyPartToDev(id, pc); devDetail(id); toast('Part change recorded'); }); }, receipt: () => receipt(id), copyReceipt: () => copy(receiptText(S.devices[id]), 'Receipt copied'),
      devPayForm: () => devPayForm(id), devPay: () => devPay(id), devUnsell: () => devUnsell(id),
      delDevAsk: () => openSheet(`<h3>Delete this iPhone?</h3><div class="hint">${esc(devName(S.devices[id]))} and its history will be removed.</div><div class="btns"><button class="btn" data-a="devBack" data-id="${esc(id)}">Keep it</button><button class="btn red" data-a="delDev" data-id="${esc(id)}">Delete</button></div>`),
      delDev: () => guard(async () => { await deleteDoc(devRef(id)); closeSheet(); toast('Deleted'); }),
      priceList: () => { const tx = priceListText(); openSheet(`<h3>Price list</h3><div class="hint">Send it to customers or post it on your WhatsApp status.</div><textarea readonly style="min-height:240px;font-size:13.5px">${esc(tx)}</textarea><div class="btns"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(tx)}">Share on WhatsApp</a><button class="btn" data-a="copyPrice">Copy</button></div>`); },
      copyPrice: () => copy(priceListText(), 'Price list copied'),
      exInfo: () => exInfo(v), openMove: () => moveDetail(id), collect: () => collectForm(), collectFrom: () => collectForm(id), collectSave,
      statement: () => { const ph = member(id).phone, tx = statementText(id); ph ? window.open(waLink(ph, tx), '_blank') : copy(tx, 'Statement copied'); },
      setStatus: () => updateMember(id, {status: v}, v === 'active' ? 'Shop approved' : 'Shop suspended'),
      renameShop: () => { const n = val('a-shop'); if (n.length < 2 || n.length > 60) return toast('Shop name: 2 to 60 characters'); if (activeMembers().some(x => x.id !== id && x.shopName.toLowerCase() === n.toLowerCase())) return toast('Another shop already uses that name'); updateMember(id, {shopName: n}, 'Shop renamed'); },
      setPremium: () => { const d = val('a-until'); if (!d) return toast('Pick a date'); updateMember(id, {premiumUntil: isoToDay(d)}, 'Premium saved'); },
      premDays: () => { const m = member(id), base = Math.max(m.premiumUntil || 0, dayNum()); updateMember(id, {premiumUntil: base + Number(v)}, `Premium extended by ${v} days`); },
      endPremium: () => updateMember(id, {premiumUntil: 0}, 'Premium ended'),
      saveUnl: () => updateMember(id, {unlimited: checked('a-unl')}, checked('a-unl') ? 'Unlimited posting approved' : 'Back to free limit'),
      csvStock: () => download('stock-and-sales.csv', csv([['Model', 'Storage', 'Colour', 'IMEI', 'Condition', 'Battery', 'Parts', 'Face ID', 'Repairs', 'Selling price', 'Date bought', 'Status', 'Sold to', 'Sale price', 'Paid', 'Sale date'],
        ...Object.values(S.devices).map(d => [d.model, d.storage, d.color, d.imei, d.condition, d.battery, partsOnly(d), faceOf(d), expTotal(d), num(d.price), d.added, {stock: 'In stock', out: 'With partner', soldPartner: 'Sold by partner', sold: 'Sold'}[devState(d)], d.sale?.to, d.sale?.amount, d.sale?.paid, d.sale?.date])])),
      csvMoves: () => download('deals.csv', csv([['Date', 'Owner', 'Holding it', 'Model', 'IMEI', 'Agreed price', 'Due', 'Status', 'Paid', 'Balance', 'Note'],
        ...sortMoves(Object.values(S.moves)).map(m => [m.dateOut, nameOf(m.ownerId), nameOf(m.holderId), devName(m.dev), m.dev?.imei, num(m.price), m.due, m.status, num(m.paid), owed(m), m.note])])),
      ...Object.fromEntries(Object.entries(actions).map(([k, fn]) => [k, () => fn(id)])),
    };
    map[act]?.(); return;
  }
  if (t.closest('a')) return;
  const mb0 = t.closest('[data-member]'); if (mb0) return memberSheet(mb0.dataset.member);
  const rpt = t.closest('[data-report]'); if (rpt) return reportDetail(rpt.dataset.report);
  const es = t.closest('[data-escrow]'); if (es) return escrowDetail(es.dataset.escrow);
  const od = t.closest('[data-order]'); if (od) return orderDetail(od.dataset.order);
  const pc = t.closest('[data-post]'); if (pc && !sheet.contains(pc)) return openPost(pc.dataset.post);
  const mv = t.closest('[data-move]'); if (mv) return moveDetail(mv.dataset.move);
  const dv = t.closest('[data-dev]'); if (dv) return devDetail(dv.dataset.dev);
  const mb = t.closest('[data-member]'); if (mb) return memberSheet(mb.dataset.member);
  const ad = t.closest('[data-admin]'); if (ad) return adminSheet(ad.dataset.admin);
});
document.addEventListener('keydown', e => { const bar = e.target.closest?.('[data-bar]'); if (bar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); bar.dispatchEvent(new MouseEvent('click', {bubbles: true})); } });
