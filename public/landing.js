import * as CFG from './config.js';

// Welcome page: choose customer store or vendor hub.
const KEY = 'dh-choice';
const urls = {customer: CFG.STORE_URL || 'store.html', vendor: CFG.HUB_URL || 'hub.html'};
const name = CFG.PLATFORM_NAME || 'iPhone Dealers Hub';
document.title = name;
document.getElementById('lp-name').textContent = name;
document.getElementById('lp-cust').href = urls.customer;
document.getElementById('lp-vend').href = urls.vendor;
document.getElementById('lp-report').href = urls.customer.split('#')[0] + '#report';

// Coming back with a remembered choice? Go straight there,
// unless the visitor tapped "switch" (index.html#choose).
let saved = null;
try { saved = localStorage.getItem(KEY); } catch {}
if (saved && urls[saved] && location.hash !== '#choose') location.replace(urls[saved]);
if (location.hash === '#choose') { try { localStorage.removeItem(KEY); } catch {} }

document.querySelectorAll('[data-choice]').forEach(a => a.addEventListener('click', () => {
  if (document.getElementById('lp-rem').checked) { try { localStorage.setItem(KEY, a.dataset.choice); } catch {} }
}));
