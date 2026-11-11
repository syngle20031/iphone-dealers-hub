// ============================================================
//  EDIT THIS FILE ONLY  (see SETUP-GUIDE.md, step 4)
// ============================================================

// 1) Paste the firebaseConfig from Firebase console
//    (Project settings -> Your apps -> Web app -> "SDK setup and configuration")
export const firebaseConfig = {
  apiKey: "AIzaSyBcHiOTAXgeyPaZqKCGPv0DpqMfKVOLv6A",
  authDomain: "dealers-hub-5c144.firebaseapp.com",
  projectId: "dealers-hub-5c144",
  storageBucket: "dealers-hub-5c144.firebasestorage.app",
  messagingSenderId: "333875020620",
  appId: "1:333875020620:web:ce5aea800bfc8a94a7c5e9"
};

// 2) YOUR email: you are the platform owner (approve members, give premium).
//    Small letters only. Must be the SAME email as in firestore.rules
export const OWNER_EMAIL = "mabdussamad634@gmail.com";

// 3) Platform name (shows at the top and on the join page)
export const PLATFORM_NAME = "iPhone Dealers Hub";

// 4) Your WhatsApp number (members contact you to get approved or buy premium)
export const OWNER_PHONE = "09075433732";

// 5) Free broadcast posts per day. Must match freeLimit() in firestore.rules
export const FREE_POSTS_PER_DAY = 2;

// 6) What premium costs and how to pay (shown to members)
export const PREMIUM_PRICE = "Message us on WhatsApp for the current price";
export const PAYMENT_DETAILS = "Message us on WhatsApp (09075433732) to get the account details for this payment.\nOnly pay into the account we send you from this number.";

// 7) Middleman (escrow): you hold the buyer's money until they confirm the phone.
//    Set MIDDLEMAN_ENABLED to false to switch it off.
//    Fee is paid by the buyer. If you change fee numbers, also change them
//    in firestore.rules (escrows section).
export const MIDDLEMAN_ENABLED = true;
export const MIDDLEMAN_FEE_PERCENT = 2;
export const MIDDLEMAN_FEE_MIN = 2000;

// 8) Show TikTok videos inside posts (true) or only as a "Watch on TikTok" button (false)
export const EMBED_TIKTOK = true;

// 9) SECURITY
// Bot protection (Firebase App Check with reCAPTCHA v3). Paste your reCAPTCHA
// v3 SITE key here (SECURITY.md, step 2). Leave as is to switch it off.
export const RECAPTCHA_SITE_KEY = "6LeQXhsuAAAAAHKU2ikGHGQYajJ06FvV0CA7Kqr4";

// Log members out automatically after this many idle minutes (0 = never)
export const IDLE_LOGOUT_MINUTES = 120;

// 10) CUSTOMER STORE (store.html)
export const STORE_NAME = "iPhone Dealers Hub";
// Your commission on each store sale, deducted when you pay the vendor
export const STORE_COMMISSION_PERCENT = 5;
// Pages. Leave as they are if all files sit in the same folder:
//   index.html = welcome screen (choose customer or vendor)
//   hub.html   = vendor app      store.html = customer store
// If you put the store on its own subdomain, use full links instead,
// e.g. "https://shop.yourdomain.com/"
export const HUB_URL = "hub.html";
export const STORE_URL = "store.html";
export const START_URL = "index.html#choose";

// 11) NOTIFICATIONS
// Vendors choose their alerts in Me -> Notifications. Pop-ups while the app is
// open work with no setup. For alerts when the app is CLOSED and automatic
// WhatsApp messages, follow NOTIFICATIONS.md, then fill these in:
export const PUSH_ENABLED = false;          // true after deploying the functions
export const FCM_VAPID_KEY = "PASTE_VAPID_KEY";
export const WHATSAPP_ALERTS_ENABLED = false; // true after setting up WhatsApp Cloud API
// Your community WhatsApp group/channel link (for the daily digest), optional
export const WHATSAPP_COMMUNITY_URL = "";
