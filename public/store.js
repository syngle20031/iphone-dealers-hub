import * as CFG from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit, startAfter, getDocs, getDoc, writeBatch, updateDoc } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app-check.js';

// ================= setup =================
const ROOT = document.getElementById('sroot');
const STORE = CFG.STORE_NAME || 'iPhone Store';
const APP = CFG.PLATFORM_NAME || 'iPhone Dealers Hub';
const HUB_URL = CFG.HUB_URL || '';
const USE_HASH = CFG.STORE_USE_HASH !== false;
const EMBED = CFG.EMBED_TIKTOK !== false;
const COMM_PCT = Number(CFG.STORE_COMMISSION_PERCENT ?? 5);
// the 36 states of Nigeria and the FCT; keep in step with app.js and firestore.rules
const NG_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
// parts summary from the vendor app, e.g. "Non display, ID" or "DM: Screen, Off ID"
const DEF_PARTS = ['Non display', 'Display screen (DM)', 'DDM'], DEF_FACE = ['ID', 'Off ID'];   // the owner can change these in the hub
const partsOpts = () => (S.options?.partsOptions || []).length ? S.options.partsOptions : DEF_PARTS;
const faceOpts = () => (S.options?.faceOptions || []).length ? S.options.faceOptions : DEF_FACE;
const lc = x => String(x || '').toLowerCase();
const partsMatch = (l, v) => { const t = lc(l.parts); v = lc(v); return t === v || t.startsWith(v + ','); };
const faceMatch = (l, v) => { v = lc(v); return l.face ? lc(l.face) === v : lc(l.parts).endsWith(', ' + v); };   // older listings kept Face ID inside the parts text
const FILTER_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
const logoOk = v => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v || '');
const capWords = t => String(t || '').trim().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
const placeOf = l => { const seen = new Set(); return [l.city, l.state].filter(Boolean).map(capWords).filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(', '); };
document.title = STORE;
if (!CFG.firebaseConfig?.apiKey || String(CFG.firebaseConfig.apiKey).includes('PASTE')) {
  ROOT.innerHTML = '<div class="st-main"><div class="st-empty"><b>Store almost ready</b>Fill in config.js first (see SETUP-GUIDE.md).</div></div>';
  throw new Error('config.js not filled');
}
const fbApp = initializeApp(CFG.firebaseConfig, 'store');
if (CFG.RECAPTCHA_SITE_KEY && !String(CFG.RECAPTCHA_SITE_KEY).includes('PASTE')) {
  try { initializeAppCheck(fbApp, {provider: new ReCaptchaV3Provider(CFG.RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true}); } catch (e) { console.error(e); }
}
const auth = getAuth(fbApp), db = getFirestore(fbApp);

// ================= helpers =================
const $ = s => ROOT.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };
const naira = n => '₦' + Math.round(n || 0).toLocaleString('en-NG');
const dayNum = () => Math.floor((Date.now() + 3600000) / 86400000);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 56]).join('');
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
const fmtTs = ts => new Date(ts).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
function waNumber(p) { let d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '234' + d.slice(1); else if (d.length === 10) d = '234' + d; return d; }
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const START_URL = CFG.START_URL || 'index.html#choose';
const REPORT_CATS = {seller: 'A seller or shop', listing: 'A fake or wrong listing', order: 'A problem with my order', scam: 'Scam or fraud', website: 'The website is not working', other: 'Something else'};
const CREDIT = `<footer class="st-foot">Powered by <b>Syngle</b> (M.A Haske)<div style="margin-top:6px">Are you a phone dealer? <a href="${esc(HUB_URL || 'hub.html')}" data-hub-link>Continue as vendor</a></div><div style="margin-top:10px"><a href="#report" data-st-report style="color:var(--mute);font-weight:600">Report a problem</a> · <a href="${esc(START_URL)}" data-start-link style="color:var(--mute);font-weight:500">← Back to start</a></div></footer>`;
function tiktokUrl(u) { try { const x = new URL(String(u).trim()); return /(^|\.)tiktok\.com$/i.test(x.hostname) && x.protocol === 'https:' ? x.href : ''; } catch { return ''; } }
function tiktokId(u) { const m = String(u || '').match(/\/video\/(\d{8,25})/); return m ? m[1] : ''; }
const family = m => { const x = String(m || '').match(/iPhone (\d+)/); if (x) return +x[1] >= 11 ? 'iPhone ' + x[1] : 'Older'; if (/Air/i.test(m)) return 'iPhone 17'; return 'Older'; };   // 7, 8, X, XR, XS, SE go under Older
const COLORS = {'iPhone 17': ['#F4C9A8', '#C47A4A'], 'iPhone 16': ['#D9CBB5', '#8C7558'], 'iPhone 15': ['#C7D6E6', '#5D7A99'], 'iPhone 14': ['#D8CBE6', '#7A5D99'], 'iPhone 13': ['#C9E0D5', '#4E8C72'], 'iPhone 12': ['#E6D3CB', '#99665D'], 'iPhone 11': ['#E6E0C9', '#99905D'], Older: ['#DDDDDD', '#777777']};
function placeholder(l) {
  const [a, b] = COLORS[family(l.model)] || COLORS.Older;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><rect x="138" y="62" width="124" height="246" rx="26" fill="#1b1d1c" stroke="#e9ecea" stroke-width="5"/><rect x="152" y="78" width="48" height="48" rx="12" fill="#2c302e"/><circle cx="166" cy="92" r="9" fill="#0d0f0e"/><circle cx="186" cy="112" r="9" fill="#0d0f0e"/><circle cx="166" cy="112" r="9" fill="#0d0f0e"/><text x="200" y="350" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(l.model)}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const imgOf = l => l.photo || placeholder(l);
const titleOf = l => [l.model, l.storage, l.color].filter(Boolean).join(' ');
const SHIELD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></svg>';
const ORD_STEPS = [['new', 'Ordered'], ['accepted', 'Seller confirmed'], ['paid', 'Paid'], ['delivered', 'Delivered'], ['received', 'Done']];
const ORD_LABEL = {new: 'Waiting for seller', accepted: 'Pay now', paid: 'Seller delivering', delivered: 'Check your phone', received: 'Completed', completed: 'Completed', rejected: 'Not available', cancelled: 'Cancelled', disputed: 'Problem reported', refunded: 'Refunded'};
const encListing = id => 'p-' + id.replace('_', '-');
const decListing = h => { const x = h.slice(2); const i = x.indexOf('-'); return i < 0 ? x : x.slice(0, i) + '_' + x.slice(i + 1); };

// ================= state =================
const S = {sales: [], listings: [], ratings: {}, user: null, myOrders: {}, order: null, route: {v: 'home'}, fam: 'All', cond: '', sort: 'new', state: '', parts: '', face: '', q: '', settings: {storeOpen: true}, loaded: false, limits: null};
let orderUnsub = null, myUnsub = null, limitsUnsub = null;

ROOT.innerHTML = `<header class="st-top"><div class="st-row"><button class="st-logo" data-go="home"><img class="st-mark" src="logo-mark.svg" alt="">${esc(STORE).replace(/(\S+)$/, '<i>$1</i>')}</button><button class="st-pill" data-go="orders" id="st-myo">My orders</button></div>
  <div class="st-search"><input id="st-q" type="search" placeholder="Search iPhone 15 Pro Max, 256GB, Kano…" aria-label="Search phones" autocomplete="off"></div></header>
  <main class="st-main" id="st-main"></main><div id="st-bar"></div>
  <div class="st-sbg" id="st-sbg"><div class="st-sheet" id="st-sheet" role="dialog" aria-modal="true"></div></div><div class="st-toast" id="st-toast" role="status"></div>`;
const main = $('#st-main'), bar = $('#st-bar'), sbg = $('#st-sbg'), sheet = $('#st-sheet');
const toast = m => { const t = $('#st-toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2800); };
const openSheet = h => { sheet.innerHTML = h; sbg.classList.add('open'); sheet.scrollTop = 0; };
const closeSheet = () => sbg.classList.remove('open');
sbg.addEventListener('click', e => { if (e.target === sbg) closeSheet(); });

// ================= data =================
// Phones load 40 at a time (newest first) to keep database reads, and costs, low.
const PAGE = 40;
S.cursor = null; S.more = true; S.busy = false; S.useOrder = true; S.ratedLoaded = new Set();
async function loadPage() {
  if (S.busy || !S.more) return; S.busy = true; render();
  const parts = [collection(db, 'listings'), where('status', '==', 'live')];
  if (S.state) parts.push(where('state', '==', S.state));   // search the whole store for that state, not only phones already loaded
  if (S.useOrder) parts.push(orderBy('updatedAt', 'desc'));
  if (S.cursor) parts.push(startAfter(S.cursor));
  parts.push(limit(PAGE));
  try {
    const snap = await getDocs(query(...parts));
    const have = new Set(S.listings.map(l => l.id));
    snap.forEach(d => { if (!have.has(d.id)) S.listings.push({id: d.id, ...d.data()}); });
    S.cursor = snap.docs[snap.docs.length - 1] || S.cursor;
    S.more = snap.docs.length === PAGE; S.loaded = true;
    loadRatings(S.listings.map(l => l.vendorId));
  } catch (e) {
    // the "newest first" index isn't created yet (SETUP-GUIDE.md): carry on without date order
    if (S.useOrder && e?.code === 'failed-precondition') { console.warn('Create the listings index (see SETUP-GUIDE.md):', e.message); S.useOrder = false; S.busy = false; return loadPage(); }
    console.error(e); if (!S.loaded) { main.innerHTML = '<div class="st-empty"><b>Can\'t load the store right now</b>Check your connection and try again.</div>' + CREDIT; S.busy = false; return; }
    toast("Couldn't load more phones. Try again.");
  }
  S.busy = false; render();
}
// star ratings: only for the shops on screen (30 shops per request)
async function loadRatings(vendorIds) {
  const need = [...new Set(vendorIds)].filter(v => v && !S.ratedLoaded.has(v));
  if (!need.length) return;
  need.forEach(v => S.ratedLoaded.add(v));
  try {
    for (let i = 0; i < need.length; i += 30) {
      const snap = await getDocs(query(collection(db, 'ratings'), where('vendorId', 'in', need.slice(i, i + 30))));
      snap.forEach(d => { const r = d.data(); (S.ratings[r.vendorId] ||= []).push(r.stars); });
    }
    if (S.loaded) render();
  } catch (e) { console.error(e); need.forEach(v => S.ratedLoaded.delete(v)); }
}
// a shared product link for a phone that isn't in the loaded pages
async function loadOne(id) {
  if (S.listings.some(l => l.id === id) || S.missing?.has(id)) return;
  (S.missing ||= new Set()).add(id);
  try { const d = await getDoc(doc(db, 'listings', id)); if (d.exists() && d.data().status === 'live') { S.listings.push({id: d.id, ...d.data()}); S.missing.delete(id); loadRatings([d.data().vendorId]); render(); } else { render(); } }
  catch { render(); }
}
loadPage();
onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(20)), s => { const a = []; s.forEach(d => a.push(d.data())); S.sales = a; if (S.loaded && S.route.v === 'home') homeView(); }, () => {});
onSnapshot(doc(db, 'settings', 'options'), s => { S.options = s.exists() ? s.data() : {}; if (S.loaded && S.route.v === 'home') homeView(); }, () => {});
onSnapshot(doc(db, 'settings', 'platform'), s => { S.settings = {storeOpen: true, ...(s.exists() ? s.data() : {})}; }, () => {});
onAuthStateChanged(auth, u => {
  S.user = u;
  if (myUnsub) myUnsub(); myUnsub = null; if (limitsUnsub) limitsUnsub(); limitsUnsub = null;
  if (u) {
    myUnsub = onSnapshot(query(collection(db, 'orders'), where('customerUid', '==', u.uid)), s => { S.myOrders = {}; s.forEach(d => S.myOrders[d.id] = {id: d.id, ...d.data()}); updateMyOrdersPill(); if (S.route.v === 'orders') render(); }, () => {});
    limitsUnsub = onSnapshot(doc(db, 'custlimits', u.uid), s => { S.limits = s.exists() ? s.data() : null; }, () => {});
  }
});
function updateMyOrdersPill() { const n = Object.values(S.myOrders).filter(o => ['accepted', 'delivered'].includes(o.status)).length; $('#st-myo').innerHTML = 'My orders' + (n ? `<span class="st-dot">${n}</span>` : ''); }
const rating = vid => { const r = S.ratings[vid] || []; return r.length ? {avg: r.reduce((a, b) => a + b, 0) / r.length, n: r.length} : null; };

// ================= routing =================
function go(v, id, push = true) {
  S.route = {v, id}; closeSheet();
  if (orderUnsub && v !== 'track') { orderUnsub(); orderUnsub = null; }
  if (v === 'track') watchOrder(id);
  if (USE_HASH && push) { const h = v === 'product' ? encListing(id) : v === 'track' ? 'o-' + id : v === 'orders' ? 'orders' : ''; try { history.replaceState(null, '', h ? '#' + h : location.pathname); } catch {} }
  render(); scrollTo(0, 0);
}
function fromHash() {
  const h = (location.hash || '').slice(1);
  if (h.startsWith('p-')) go('product', decListing(h), false);
  else if (h.startsWith('o-')) go('track', h.slice(2), false);
  else if (h === 'orders') go('orders', null, false);
  else if (h === 'report') { go('home', null, false); reportForm(); }
  else go('home', null, false);
}
if (USE_HASH) { addEventListener('hashchange', fromHash); fromHash(); } else render();

// ================= views =================
function render() {
  bar.innerHTML = '';
  const v = S.route.v;
  $('.st-search').hidden = v !== 'home';
  if (v === 'product') return productView(S.route.id);
  if (v === 'track') return trackView();
  if (v === 'orders') return ordersView();
  homeView();
}
function cheapestKeys() {
  const best = {};
  S.listings.forEach(l => { const k = l.model + '|' + l.storage + '|' + l.condition; if (!best[k] || l.price < best[k].price) best[k] = l; });
  const counts = {}; S.listings.forEach(l => { const k = l.model + '|' + l.storage + '|' + l.condition; counts[k] = (counts[k] || 0) + 1; });
  return new Set(Object.entries(best).filter(([k]) => counts[k] > 1).map(([, l]) => l.id));
}
function card(l, cheap) {
  const r = rating(l.vendorId), fresh = Date.now() - (l.updatedAt || l.createdAt || 0) < 864e5;
  return `<button class="st-card" data-p="${esc(l.id)}"><div class="st-img"><img src="${esc(imgOf(l))}" alt="${esc(titleOf(l))}" loading="lazy">${cheap ? '<span class="st-badge">Lowest price</span>' : fresh ? '<span class="st-badge new">New in</span>' : ''}${l.video ? '<span class="st-vid">▶ Video</span>' : ''}</div>
    <div class="st-body"><div class="st-price">${naira(l.price)}</div><div class="st-name">${esc(titleOf(l))}</div>${l.condition ? `<span class="st-cond">${esc(l.condition)}${l.battery ? ', ' + esc(l.battery) + '%' : ''}</span>` : ''}
    <div class="st-meta">${r ? `<span class="st-stars">★ ${r.avg.toFixed(1)}</span>` : ''}<span>${logoOk(l.shopLogo) ? `<img class="st-mini" src="${l.shopLogo}" alt="">` : ''}${esc(l.shopName)}</span>${placeOf(l) ? `<span>· ${esc(placeOf(l))}</span>` : ''}</div>${l.parts || l.face ? `<div class="st-orig">${esc([l.parts && (l.parts.length > 30 ? l.parts.slice(0, 28) + '…' : l.parts), l.face && 'Face ID: ' + l.face].filter(Boolean).join(' · '))}</div>` : ''}</div></button>`;
}
function homeView() {
  const fams = ['All', ...['iPhone 18', 'iPhone 17', 'iPhone 16', 'iPhone 15', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11', 'Older'].filter(f => S.listings.some(l => family(l.model) === f))];
  let L = S.listings.filter(l => (S.fam === 'All' || family(l.model) === S.fam) && (!S.cond || l.condition === S.cond) && (!S.state || l.state === S.state) && (!S.parts || partsMatch(l, S.parts)) && (!S.face || faceMatch(l, S.face)));
  if (S.q) { const words = S.q.split(/\s+/); L = L.filter(l => { const t = [titleOf(l), l.condition, l.parts, l.face, l.shopName, l.city, l.state, l.description].join(' ').toLowerCase(); return words.every(w => t.includes(w)); }); }
  L.sort(S.sort === 'low' ? (a, b) => a.price - b.price : S.sort === 'high' ? (a, b) => b.price - a.price : S.sort === 'rated' ? (a, b) => ((rating(b.vendorId)?.avg || 0) - (rating(a.vendorId)?.avg || 0)) : (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const cheap = cheapestKeys();
  const sold = S.sales.length ? `<div class="st-sold"><div class="st-sold-h">Recently sold</div><div class="st-chips" style="gap:8px">${S.sales.slice(0, 12).map(x => `<div class="st-sold-c"><b>✓ ${esc(x.item)}</b><span>sold by ${esc(x.shopName)} to ${esc(x.buyerLabel || (x.buyerType === 'customer' ? 'a customer' : 'a dealer'))}, ${ago(x.createdAt)}</span></div>`).join('')}</div></div>` : '';
  const active = [['state', S.state], ['cond', S.cond], ['parts', S.parts]].filter(x => x[1]);
  main.innerHTML = `<div class="st-shield">${SHIELD}<span>Your money is held safely until you receive your phone</span></div>
    <div class="st-chips">${fams.map(f => `<button class="st-chip ${S.fam === f ? 'on' : ''}" data-fam="${esc(f)}">${esc(f)}</button>`).join('')}</div>
    <div class="st-tools"><button class="st-fbtn ${active.length ? 'on' : ''}" data-filters>${FILTER_ICON}Filters${active.length ? ` <b>${active.length}</b>` : ''}</button>
      <select id="st-face" class="${S.face ? 'on' : ''}" aria-label="Face ID"><option value="">Face ID</option>${faceOpts().map(o => `<option value="${esc(o)}" ${S.face === o ? 'selected' : ''}>Face ID: ${esc(o)}</option>`).join('')}</select>
      <select id="st-sort" aria-label="Sort"><option value="new" ${S.sort === 'new' ? 'selected' : ''}>Newest</option><option value="low" ${S.sort === 'low' ? 'selected' : ''}>Lowest price</option><option value="high" ${S.sort === 'high' ? 'selected' : ''}>Highest price</option><option value="rated" ${S.sort === 'rated' ? 'selected' : ''}>Best rated sellers</option></select></div>
    ${active.length ? `<div class="st-active">${active.map(([k, v]) => `<button class="st-pillx" data-unf="${k}" aria-label="Remove ${esc(v)}">${esc(v)} <span aria-hidden="true">×</span></button>`).join('')}<button class="st-clear" data-clear-filters>Clear all</button></div>` : ''}
    ${S.q || active.length || S.face || S.fam !== 'All' ? '' : sold}
    ${S.loaded ? `<div class="st-count">${L.length} phone${L.length === 1 ? '' : 's'}${S.more ? ' shown' : ' available'}</div>` : ''}
    ${S.loaded ? (L.length ? `<div class="st-grid">${L.map(l => card(l, cheap.has(l.id))).join('')}</div>` : `<div class="st-empty"><b>No phones match${S.more ? ' yet' : ''}</b>${S.more ? 'Tap <b>Show more phones</b> to search further.' : 'Try another model or clear the filters.'}</div>`) : '<div class="st-empty">Loading phones…</div>'}
    ${S.loaded && S.more ? `<div class="st-btns" style="justify-content:center"><button class="st-btn line" data-more ${S.busy ? 'disabled' : ''} style="flex:0 1 260px">${S.busy ? 'Loading…' : 'Show more phones'}</button></div>` : ''}
    ${CREDIT}`;
  $('#st-sort').onchange = e => { S.sort = e.target.value; homeView(); };
  $('#st-face').onchange = e => { S.face = e.target.value; homeView(); };
}
// all filters live in one sheet, so the top of the store stays clean
function filtersSheet() {
  const conds = [...new Set(S.listings.map(l => l.condition).filter(Boolean))].sort();
  const sel = (id, label, any, opts, cur) => `<label for="${id}">${label}</label><select id="${id}"><option value="">${any}</option>${opts.map(o => `<option ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  openSheet(`<h3>Filters</h3>
    ${sel('f-state', 'State', 'All states', NG_STATES, S.state)}
    ${sel('f-cond', 'Condition', 'Any condition', conds.includes(S.cond) || !S.cond ? conds : [...conds, S.cond], S.cond)}
    ${sel('f-parts', 'Parts', 'Any parts', partsOpts(), S.parts)}
    <div class="st-btns"><button class="st-btn line" data-clear-filters>Clear all</button><button class="st-btn hot" data-apply-filters>Show phones</button></div>`);
}
function setFilters(f) {
  const stateChanged = (f.state ?? S.state) !== S.state;
  Object.assign(S, f); closeSheet();
  if (stateChanged) { S.listings = []; S.cursor = null; S.more = true; S.loaded = false; homeView(); loadPage(); } else homeView();
}
function productView(id) {
  const l = S.listings.find(x => x.id === id);
  if (!l && !S.missing?.has(id)) loadOne(id);
  if (!l) { main.innerHTML = `<button class="st-back" data-go="home">← All phones</button><div class="st-empty"><b>${S.loaded && S.missing?.has(id) ? 'This phone is no longer available' : 'Loading…'}</b>${S.loaded ? 'It may have been sold. Have a look at similar phones.' : ''}</div>${CREDIT}`; return; }
  const r = rating(l.vendorId), u = tiktokUrl(l.video), vid = tiktokId(u);
  const similar = S.listings.filter(x => x.id !== l.id && family(x.model) === family(l.model)).sort((a, b) => Math.abs(a.price - l.price) - Math.abs(b.price - l.price)).slice(0, 4);
  main.innerHTML = `<button class="st-back" data-go="home">← All phones</button>
    <div class="st-pimg"><img src="${esc(imgOf(l))}" alt="${esc(titleOf(l))}"></div>
    <h1 class="st-ptitle">${esc(titleOf(l))}</h1><div class="st-pprice">${naira(l.price)}</div>
    <div class="st-specs"><div>Model</div><div>${esc(l.model)}</div>${l.storage ? `<div>Storage</div><div>${esc(l.storage)}</div>` : ''}${l.color ? `<div>Colour</div><div>${esc(l.color)}</div>` : ''}${l.condition ? `<div>Condition</div><div>${esc(l.condition)}</div>` : ''}${l.battery ? `<div>Battery health</div><div>${esc(l.battery)}%</div>` : ''}<div>Parts</div><div>${esc(l.parts || 'Ask the seller')}</div><div>Face ID</div><div>${esc(l.face || 'Ask the seller')}</div><div>Location</div><div>${esc(placeOf(l) || '—')}</div></div>
    ${l.description ? `<div class="st-box"><h3>About this phone</h3><div class="st-desc">${esc(l.description)}</div></div>` : ''}
    ${u ? `<div class="st-box"><h3>Video</h3>${EMBED && vid ? `<div class="st-tt"><iframe src="https://www.tiktok.com/embed/v2/${vid}" title="TikTok video" allow="encrypted-media; fullscreen" loading="lazy"></iframe></div>` : ''}<div class="st-btns"><a class="st-btn ink" target="_blank" rel="noopener" href="${esc(u)}">▶ Watch on TikTok</a></div></div>` : ''}
    <div class="st-box"><h3>Sold by</h3><div class="st-seller"><div class="st-av">${logoOk(l.shopLogo) ? `<img src="${l.shopLogo}" alt="">` : esc(initials(l.shopName))}</div><div><b>${esc(l.shopName)}</b> <span style="color:var(--safe);font-size:12.5px;font-weight:700">✓ Verified dealer</span><div style="font-size:13px;color:var(--mute)">${r ? `<span class="st-stars">★ ${r.avg.toFixed(1)}</span> from ${r.n} dealer review${r.n === 1 ? '' : 's'}` : 'New on ' + esc(APP)}${placeOf(l) ? ', ' + esc(placeOf(l)) : ''}</div></div></div></div>
    <div class="st-box"><h3 style="display:flex;gap:8px;align-items:center;color:var(--safe)">${SHIELD} Buyer protection</h3>
      <ol class="st-steps"><li>Order now. The seller confirms the phone is available.</li><li>Pay ${esc(APP)}, not the seller. We hold your money.</li><li>The seller delivers. Check the phone well.</li><li>Confirm it's fine, and only then is the seller paid. Problem? We refund you.</li></ol></div>
    <p style="text-align:right;margin:10px 2px 0"><a href="#report" data-st-report data-cat="listing" data-subject="${esc(titleOf(l) + ', ' + l.shopName + ', ' + naira(l.price))}" style="color:var(--mute);font-size:13px">Report this listing</a></p>
    ${similar.length ? `<h3 style="font-family:var(--disp);margin:20px 2px 10px">Similar phones</h3><div class="st-grid">${similar.map(x => card(x)).join('')}</div>` : ''}
    ${CREDIT}<div style="height:70px"></div>`;
  bar.innerHTML = `<div class="st-buybar" id="sroot-bar"><div class="st-pprice" style="font-family:var(--disp);font-weight:800;color:var(--price)">${naira(l.price)}</div><button class="st-btn hot" data-buy="${esc(l.id)}" style="min-width:150px">Buy now</button></div>`;
}
function checkout(id) {
  const l = S.listings.find(x => x.id === id); if (!l) return;
  if (S.settings.storeOpen === false) return toast('New orders are paused for a short while. Please try again later.');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('st-cust') || '{}'); } catch {}
  openSheet(`<h3>Buy ${esc(titleOf(l))}</h3><div class="st-hint">From ${esc(l.shopName)}. You don't pay now: we first confirm the phone is available, then send you payment details.</div>
    <label for="o-name">Your name</label><input id="o-name" autocomplete="name" maxlength="60" value="${esc(saved.name || '')}">
    <label for="o-phone">Phone number (WhatsApp)</label><input id="o-phone" inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(saved.phone || '')}">
    <label for="o-addr">Delivery address</label><textarea id="o-addr" maxlength="200" autocomplete="street-address" placeholder="House number, street, area">${esc(saved.address || '')}</textarea>
    <div class="st-row2"><div><label for="o-city">City or town</label><input id="o-city" maxlength="60" value="${esc(saved.city || l.city || '')}"></div>
    <div><label for="o-state">State</label><select id="o-state"><option value="">Choose</option>${NG_STATES.map(c => `<option ${(saved.state || l.state) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
    <label for="o-note">Note (optional)</label><input id="o-note" maxlength="300" placeholder="Best time to deliver, landmark…">
    <div class="st-sum"><div>Phone</div><div>${naira(l.price)}</div><div>Delivery</div><div style="font-weight:600">Agreed with the seller</div><div>Pay later</div><div>${naira(l.price)}</div></div>
    <div class="st-btns"><button class="st-btn line" data-close>Cancel</button><button class="st-btn hot" data-place="${esc(l.id)}">Place order</button></div>`);
}
async function placeOrder(id, btn) {
  const l = S.listings.find(x => x.id === id); if (!l) return toast('Sorry, this phone was just taken');
  const v = k => (sheet.querySelector('#' + k)?.value || '').trim();
  const o = {customerName: v('o-name'), customerPhone: v('o-phone'), address: v('o-addr'), city: v('o-city'), state: v('o-state'), note: v('o-note')};
  if (o.customerName.length < 2) return toast('Enter your name');
  if (o.customerPhone.replace(/\D/g, '').length < 7) return toast('Enter a valid phone number');
  if (o.address.length < 5) return toast('Enter your delivery address');
  if (!o.city) return toast('Enter your city or town');
  if (!o.state) return toast('Choose your state');
  btn.disabled = true;
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    const u = auth.currentUser.uid, d = dayNum();
    const used = S.limits && S.limits.day === d ? S.limits.orders : 0;
    if (used >= 5) { btn.disabled = false; return toast("You've placed the maximum orders for today. Please try tomorrow."); }
    const oid = rid(), now = Date.now(), b = writeBatch(db);
    b.set(doc(db, 'orders', oid), {listingId: l.id, vendorId: l.vendorId, customerUid: u, item: (titleOf(l) + (l.condition ? ', ' + l.condition : '')).slice(0, 120), amount: l.price, commission: Math.round(l.price * COMM_PCT / 100), photo: '',
      city: o.city.slice(0, 60), state: o.state, status: 'new', history: [{t: 'Order placed', by: 'Customer', uid: u, ts: now}], createdAt: now, updatedAt: now});
    b.set(doc(db, 'orders', oid, 'private', 'contact'), {customerName: o.customerName.slice(0, 60), customerPhone: o.customerPhone.slice(0, 20), address: o.address.slice(0, 200), note: o.note.slice(0, 300)});
    b.set(doc(db, 'custlimits', u), {day: d, orders: used + 1, reports: S.limits && S.limits.day === d ? S.limits.reports || 0 : 0});
    await b.commit();
    try { localStorage.setItem('st-cust', JSON.stringify({name: o.customerName, phone: o.customerPhone, address: o.address, city: o.city, state: o.state})); } catch {}
    go('track', oid);
    toast('Order placed. Save your tracking link.');
  } catch (e) { console.error(e); btn.disabled = false; toast(e?.code === 'permission-denied' ? "We couldn't place this order. The phone may have just been sold, or orders are paused." : "Couldn't place the order. Check your connection."); }
}
let contactUnsub = null;
function watchOrder(id) {
  if (orderUnsub) orderUnsub(); if (contactUnsub) { contactUnsub(); contactUnsub = null; }
  S.order = undefined; S.contact = null;
  // only the customer (and the platform) can read the delivery details
  if (S.user) contactUnsub = onSnapshot(doc(db, 'orders', id, 'private', 'contact'), s => { S.contact = s.exists() ? s.data() : null; if (S.route.v === 'track') render(); }, () => { S.contact = null; });
  orderUnsub = onSnapshot(doc(db, 'orders', id), s => { S.order = s.exists() ? {id: s.id, ...s.data()} : null; if (S.route.v === 'track') render(); }, () => { S.order = null; if (S.route.v === 'track') render(); });
}
function trackView() {
  const o = S.order, id = S.route.id;
  if (o === undefined) { main.innerHTML = '<div class="st-empty">Loading your order…</div>'; return; }
  if (!o) { main.innerHTML = `<button class="st-back" data-go="home">← Store</button><div class="st-empty"><b>Order not found</b>Check the link and try again.</div>${CREDIT}`; return; }
  const code = id.slice(-8).toUpperCase(), mine = S.user && o.customerUid === S.user.uid;
  const order = ['new', 'accepted', 'paid', 'delivered', 'received'];
  const at = o.status === 'completed' ? 5 : order.indexOf(o.status);
  let base = location.href.split('#')[0]; try { if (CFG.STORE_URL) base = new URL(CFG.STORE_URL, location.href).href.split('#')[0]; } catch {}
  const link = base + '#o-' + id;
  let body = '';
  switch (o.status) {
    case 'new': body = `<div class="st-note">We've asked <b>${esc(S.listings.find(l => l.id === o.listingId)?.shopName || 'the seller')}</b> to confirm this phone is available. You'll see the payment details here as soon as they confirm, usually within an hour.</div>`; break;
    case 'accepted': body = `<div class="st-note"><b>Good news: it's available.</b> Pay <b>${naira(o.amount)}</b> to ${esc(APP)} (not to the seller):</div><div class="st-pay">${esc(CFG.PAYMENT_DETAILS || '')}\nReference: ${code}</div>
      <div class="st-btns">${CFG.OWNER_PHONE ? `<a class="st-btn wa" target="_blank" rel="noopener" href="${waLink(CFG.OWNER_PHONE, `Hello, I've paid ${naira(o.amount)} for order ${code} (${o.item}). Proof attached.`)}">Send payment proof</a>` : ''}</div>`; break;
    case 'paid': body = `<div class="st-note"><b>Payment received.</b> Your money is held safely. The seller is arranging delivery and will call you${S.contact ? ' on ' + esc(S.contact.customerPhone) : ''}.</div>`; break;
    case 'delivered': body = `<div class="st-note"><b>The seller says your phone was delivered.</b> Check it well: IMEI, Face ID, camera, battery, iCloud signed out. If all is fine, confirm below so the seller gets paid.</div>`; break;
    case 'received': case 'completed': body = `<div class="st-note"><b>All done.</b> Enjoy your phone, and thank you for buying on ${esc(STORE)}!</div>`; break;
    case 'rejected': body = `<div class="st-warn">Sorry, the seller says this phone is no longer available. You haven't paid anything. <a href="#" data-go="home">See other phones</a>.</div>`; break;
    case 'cancelled': body = `<div class="st-warn">This order was cancelled.</div>`; break;
    case 'disputed': body = `<div class="st-warn"><b>Problem reported:</b> ${esc(o.problem || '')}<br>${esc(APP)} is holding the money and will contact you and the seller.</div>`; break;
    case 'refunded': body = `<div class="st-note">You've been refunded.</div>`; break;
  }
  const acts = !mine ? '' : [
    ['new', 'accepted'].includes(o.status) ? '<button class="st-btn danger" data-oact="cancel">Cancel order</button>' : '',
    o.status === 'delivered' ? '<button class="st-btn hot" data-oact="received">Phone is fine, complete order</button>' : '',
    ['paid', 'delivered'].includes(o.status) ? '<button class="st-btn danger" data-oact="problem">Report a problem</button>' : '',
  ].join('');
  main.innerHTML = `<button class="st-back" data-go="${mine ? 'orders' : 'home'}">← ${mine ? 'My orders' : 'Store'}</button>
    <h1 class="st-ptitle">${esc(o.item)}</h1><div style="color:var(--mute);font-size:13.5px">Order ${code}, ${fmtTs(o.createdAt)}</div>
    <div class="st-pprice" style="font-size:28px">${naira(o.amount)}</div>
    ${['rejected', 'cancelled', 'refunded'].includes(o.status) ? '' : `<div class="st-track">${ORD_STEPS.map(([, lab], i) => `<div class="${i < at || o.status === 'completed' || o.status === 'received' && i <= at ? 'done' : i === at ? 'now' : ''}"><i></i>${lab}</div>`).join('')}</div>`}
    ${body}${acts ? `<div class="st-btns">${acts}</div>` : ''}
    ${mine && S.contact ? `<div class="st-box"><h3>Delivery</h3><div style="font-size:14px">${esc(S.contact.customerName)}, ${esc(S.contact.customerPhone)}<br>${esc(S.contact.address)}, ${esc(placeOf(o))}</div></div>` : ''}
    <div class="st-box"><h3>Keep this link</h3><div class="st-hint">Open it any time to check your order.</div><div class="st-btns"><button class="st-btn line" data-copy="${esc(link)}">Copy tracking link</button>${CFG.OWNER_PHONE ? `<a class="st-btn wa" target="_blank" rel="noopener" href="${waLink(CFG.OWNER_PHONE, `Hello ${APP}, about my order ${code}: `)}">Help on WhatsApp</a>` : ''}</div></div>
    ${CREDIT}`;
}
function ordersView() {
  const O = Object.values(S.myOrders).sort((a, b) => b.createdAt - a.createdAt);
  main.innerHTML = `<button class="st-back" data-go="home">← Store</button><h1 class="st-ptitle">My orders</h1><div class="st-hint" style="margin-bottom:12px">Orders placed on this phone.</div>
    <div class="st-olist">${O.map(o => `<button class="st-orow" data-track="${esc(o.id)}"><div><b>${esc(o.item)}</b><div style="font-size:12.5px;color:var(--mute)">${naira(o.amount)}, ${ago(o.createdAt)}</div></div><span class="st-tag ${['accepted', 'delivered'].includes(o.status) ? 'go' : ['received', 'completed'].includes(o.status) ? 'ok' : ''}">${['accepted', 'delivered'].includes(o.status) ? 'Action needed' : ORD_LABEL[o.status] || o.status}</span></button>`).join('') || '<div class="st-empty"><b>No orders yet</b>When you buy a phone, you can follow it here.</div>'}</div>${CREDIT}`;
}
async function orderAction(kind) {
  const o = S.order; if (!o) return;
  if (kind === 'problem') {
    openSheet(`<h3>Report a problem</h3><div class="st-hint">${esc(APP)} holds your money and will contact you and the seller.</div><label for="pr">What's wrong?</label><textarea id="pr" maxlength="500" placeholder="Not delivered, wrong phone, Face ID not working, iCloud locked…"></textarea><div class="st-btns"><button class="st-btn line" data-close>Back</button><button class="st-btn hot" data-oact="problem-send">Send</button></div>`);
    return;
  }
  const map = {cancel: ['cancelled', 'Customer cancelled'], received: ['received', 'Customer confirmed the phone is fine'], 'problem-send': ['disputed', 'Customer reported a problem']};
  const [status, t] = map[kind];
  const patch = {status, history: [...(o.history || []), {t, by: 'Customer', uid: auth.currentUser?.uid || '', ts: Date.now()}], updatedAt: Date.now()};
  if (kind === 'problem-send') { const p = (sheet.querySelector('#pr')?.value || '').trim().slice(0, 500); if (!p) return toast('Tell us what went wrong'); patch.problem = p; }
  try { await updateDoc(doc(db, 'orders', o.id), patch); closeSheet(); toast(kind === 'received' ? 'Thank you! Order completed.' : kind === 'cancel' ? 'Order cancelled' : 'Problem reported. We\'ll contact you.'); }
  catch (e) { console.error(e); toast("Couldn't update the order. Try again."); }
}

// ================= report a problem =================
function reportForm(cat = '', subject = '') {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('st-cust') || '{}'); } catch {}
  openSheet(`<h3>Report a problem</h3><div class="st-hint">Tell ${esc(APP)} what happened. Reports go straight to the team, never to the seller.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px" role="radiogroup">${Object.entries(REPORT_CATS).map(([k, l]) => `<label style="margin:0;display:flex;gap:10px;align-items:center;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--soft);color:var(--ink);font-weight:600;cursor:pointer"><input type="radio" name="rc" value="${k}" ${cat === k ? 'checked' : ''} style="width:18px;height:18px;flex:none">${esc(l)}</label>`).join('')}</div>
    <label for="r-sub">Which shop, phone or order? (optional)</label><input id="r-sub" maxlength="120" value="${esc(subject)}" placeholder="Shop name, phone model or order code">
    <label for="r-det">What happened?</label><textarea id="r-det" maxlength="1000" placeholder="Dates, amounts, what the seller said… The more detail, the faster we can help."></textarea>
    <label for="r-con">Your phone number, so we can reply (optional)</label><input id="r-con" inputmode="tel" maxlength="40" value="${esc(saved.phone || '')}">
    <div class="st-btns"><button class="st-btn line" data-close>Cancel</button><button class="st-btn hot" data-send-report>Send report</button></div>`);
}
async function sendReport(btn) {
  const v = k => (sheet.querySelector('#' + k)?.value || '').trim();
  const category = sheet.querySelector('input[name=rc]:checked')?.value;
  const details = v('r-det');
  if (!category) return toast('Choose what the problem is about');
  if (details.length < 5) return toast('Tell us what happened');
  btn.disabled = true;
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    const u = auth.currentUser.uid, d = dayNum(), l = S.limits && S.limits.day === d ? S.limits : {};
    if ((l.reports || 0) >= 5) { btn.disabled = false; return toast("You've sent the maximum reports for today. WhatsApp us if it's urgent."); }
    const b = writeBatch(db);
    b.set(doc(db, 'feedback', rid()), {reporterUid: u, from: 'customer', category, subject: v('r-sub').slice(0, 120), details: details.slice(0, 1000), contact: v('r-con').slice(0, 40), page: (S.route.v + (S.route.id ? ':' + S.route.id : '')).slice(0, 60), status: 'open', createdAt: Date.now()});
    b.set(doc(db, 'custlimits', u), {day: d, orders: l.orders || 0, reports: (l.reports || 0) + 1});
    await b.commit();
    sheet.innerHTML = `<h3>Thank you</h3><div class="st-note">Your report was sent to ${esc(APP)}. ${v('r-con') ? "We'll contact you on " + esc(v('r-con')) + ' if we need more details.' : ''}</div>
      ${CFG.OWNER_PHONE ? `<div class="st-btns"><a class="st-btn wa" target="_blank" rel="noopener" href="${waLink(CFG.OWNER_PHONE, 'Hello ' + APP + ', I just sent a report: ' + details.slice(0, 200))}">Urgent? WhatsApp us</a></div>` : ''}<div class="st-btns"><button class="st-btn line" data-close>Close</button></div>`;
  } catch (e) { console.error(e); btn.disabled = false; toast("Couldn't send the report. Check your connection and try again."); }
}
addEventListener('st-report', ev => reportForm(ev.detail?.cat || '', ev.detail?.subject || ''));

// ================= events =================
$('#st-q').addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); if (S.route.v === 'home') homeView(); });
ROOT.addEventListener('click', async e => {
  const t = e.target;
  const g = t.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
  const p = t.closest('[data-p]'); if (p) return go('product', p.dataset.p);
  const f = t.closest('[data-fam]'); if (f) { S.fam = f.dataset.fam; return homeView(); }
  if (t.closest('[data-filters]')) return filtersSheet();
  if (t.closest('[data-apply-filters]')) { const v = k => (sheet.querySelector('#' + k)?.value || ''); return setFilters({state: v('f-state'), cond: v('f-cond'), parts: v('f-parts')}); }
  if (t.closest('[data-clear-filters]')) return setFilters({state: '', cond: '', parts: ''});
  const uf = t.closest('[data-unf]'); if (uf) return setFilters({[uf.dataset.unf]: ''});
  if (t.closest('[data-more]')) return loadPage();
  const b = t.closest('[data-buy]'); if (b) return checkout(b.dataset.buy);
  const pl = t.closest('[data-place]'); if (pl) return placeOrder(pl.dataset.place, pl);
  if (t.closest('[data-close]')) return closeSheet();
  const tr = t.closest('[data-track]'); if (tr) return go('track', tr.dataset.track);
  const oa = t.closest('[data-oact]'); if (oa) return orderAction(oa.dataset.oact);
  const rpL = t.closest('[data-st-report]'); if (rpL) { e.preventDefault(); return reportForm(rpL.dataset.cat || '', rpL.dataset.subject || ''); }
  const sr = t.closest('[data-send-report]'); if (sr) return sendReport(sr);
  const cp = t.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Link copied. Keep it safe.'); } catch { toast(cp.dataset.copy); } }
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
