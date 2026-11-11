# iPhone Dealers Hub: Setup Guide

This puts your platform on your own domain (for example `hub.yourdomain.com`).

- **Shops apply to join.** You approve each one, so only real phone shops get in.
- **Every shop gets its own private tracker.** Its stock and sales are visible only to that shop. Not to other shops, and not to you either.
- **Deals between shops**: when one member gives a phone to another, both see it and both confirm.
- **Broadcast board**: members post what they're selling or looking for, with an optional photo and **TikTok video**. Free members get **2 posts a day**. Premium members (or shops you approve) post without limit.
- **Ratings and reports**: members rate shops 1–5 stars and can report a shop or a post privately to you.
- **Middleman (optional)**: buyers pay you, and you release the money to the seller once the buyer confirms the phone is fine.
- **Customer store** (`store.html`): a public shop like Temu or AliExpress. Vendors list phones from their stock at a **customer price** (dealers never see it). Customers order without an account, pay you, and you pay the vendor after delivery, minus your commission.

It runs on Firebase's free "Spark" plan. Allow 30–45 minutes; a laptop makes it easier.

---

## Files

| File | What it is |
|---|---|
| `public/index.html`, `public/landing.js` | Welcome screen: visitors choose **I'm a customer** or **I'm a vendor** |
| `public/hub.html`, `public/app.js` | The vendor (dealer) app (don't edit) |
| `public/store.html`, `public/store.js` | The public customer store (don't edit) |
| `public/.htaccess` | Security settings for cPanel hosting (upload it too) |
| `public/sw.js`, `public/manifest.json`, icons | Phone notifications and "Add to Home Screen" (upload them too) |
| `functions/` | Optional server code for alerts when the app is closed (see NOTIFICATIONS.md) |
| `SECURITY.md` | **Security guide**: bot protection, DDoS shield, safe settings |
| `SECURITY-AUDIT.md` | The security audit report: what was checked, found and fixed |
| `NOTIFICATIONS.md` | Vendor notifications, push and WhatsApp alerts |
| `public/config.js` | **Your settings: edit this** |
| `firestore.rules` | Security rules: who can see and do what (**edit 1 line**) |
| `firebase.json` | Only needed for Firebase Hosting (Option B) |

---

## Step 1: Create a Firebase project
1. Go to **https://console.firebase.google.com** and sign in with a Gmail account.
2. Click **Create a project**. Name it e.g. `dealers-hub`. Turn Google Analytics off, then click **Create**.

## Step 2: Turn on logins
**Build → Authentication → Get started → Email/Password → Enable → Save**.
Then, in the same list, **Anonymous → Enable → Save**. The customer store needs it so customers can order and track without making an account.

## Step 3: Create the database
**Build → Firestore Database → Create database**. Choose **africa-south1 (Johannesburg)** if it's listed, otherwise **europe-west2 (London)**. Pick **production mode**.

## Step 3b: Add two database indexes (3 minutes)
The customer store loads phones 40 at a time, newest first, to keep costs low, and can search one state at a time. That needs two indexes:
1. **Firestore Database → Indexes → Composite → Create index**
2. Collection ID: `listings`
3. Field 1: `status`, **Ascending**. Field 2: `updatedAt`, **Descending**. Query scope: **Collection**
4. Click **Create**. It takes a few minutes to build.
5. Repeat for the state filter: collection `listings`, fields `status` **Ascending**, `state` **Ascending**, `updatedAt` **Descending**.

(If you use Firebase Hosting with the command line, `firebase deploy` creates both for you from `firestore.indexes.json`.) Until the indexes exist, the store still works; phones just aren't sorted by date.

## Step 4: Fill in config.js
1. ⚙️ **Project settings → Your apps → `</>` (Web)**. Name it, then click **Register app**. Copy the values inside `firebaseConfig`.
2. Open **`public/config.js`** and paste each value over `PASTE_HERE`. Then set:
   - `OWNER_EMAIL`: **your** email, in small letters. You are the platform owner.
   - `PLATFORM_NAME`: the name of your platform
   - `OWNER_PHONE`: your WhatsApp number. Members contact you here to get approved or buy Premium.
   - `PREMIUM_PRICE` and `PAYMENT_DETAILS`: what Premium costs and your bank details
   - `FREE_POSTS_PER_DAY`: leave it at 2, unless you also change it in the rules (step 5)
   - `MIDDLEMAN_ENABLED`: `true` to offer the middleman service, `false` to hide it
   - `MIDDLEMAN_FEE_PERCENT` and `MIDDLEMAN_FEE_MIN`: your fee (default 2%, at least ₦2,000, paid by the buyer). If you change these, change the two numbers in the `escrows` section of `firestore.rules` too.
   - `EMBED_TIKTOK`: `true` plays TikTok videos inside posts; `false` shows only a "Watch on TikTok" button

## Step 5: Publish the security rules (important!)
1. Open **`firestore.rules`** and replace `owner@example.com` with **your** email (same as `OWNER_EMAIL`).
2. To change the free limit, edit `return 2;` in `freeLimit()` (and `FREE_POSTS_PER_DAY` in config.js).
3. In Firebase: **Firestore Database → Rules**. Delete what's there, paste the whole file, and click **Publish**.

> The rules enforce the 2-posts-a-day limit **on the server**, so nobody can get around it by tampering with the app. They also keep each shop's stock private.

## Step 6: Put it on your domain

**Option A: cPanel hosting** (it usually comes with domains from Whogohost, Qservers, DomainKing and similar)
1. In cPanel, create a subdomain, e.g. `hub.yourdomain.com`.
2. In **File Manager**, upload **everything inside `public/`** into that folder: `index.html`, `landing.js`, `hub.html`, `app.js`, `store.html`, `store.js`, `config.js`, `sw.js`, `manifest.json`, the three icon `.png` files and `.htaccess`.
   - `https://yourdomain.com/` opens the **welcome screen**: *I'm a customer* goes to the store, *I'm a vendor* goes to the dealer app.
   - Visitors can tick **Remember my choice**, and next time they go straight in. Each app has a **Back to start** link to switch.
   - Direct links you can share: `…/store.html` for customers, `…/hub.html` for vendors.
3. Turn on SSL: **SSL/TLS Status → Run AutoSSL**. The link must start with `https://`.
4. In Firebase: **Authentication → Settings → Authorized domains → Add domain**, then enter `hub.yourdomain.com`.

**Option B: Firebase Hosting** (when you only have a domain and no hosting)
On a computer with Node.js installed (https://nodejs.org), open a terminal in this folder and run:
```
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```
Then **Hosting → Add custom domain** and add the DNS records it shows at your domain registrar.

## Step 7: Create your own account first
Open your link, tap **Join with your shop**, and sign up with **your owner email**. Confirm the email link you receive, then tap **I've confirmed**. Your account is approved automatically, and **Me → Members** becomes your control room.

## Step 8: Open the customer store
1. In `config.js`, set `STORE_NAME`, `STORE_COMMISSION_PERCENT` (default 5%), `HUB_URL` and `STORE_URL`, then upload it again.
2. Each vendor opens a phone in **Stock** and taps **Sell to customers**. They set a customer price, description, photo and an optional TikTok video, and it goes live in the store.
3. Share your store link on WhatsApp, Instagram and TikTok.

**How a store order works**
1. A customer taps **Buy now** and enters their name, phone and address. They don't pay yet.
2. The vendor gets it in **Me → Store orders** and taps **Yes, available** (or **Not available**).
3. The customer sees your bank details on their tracking page and pays **you**. When the money arrives, tap **Customer paid** (as owner).
4. The vendor delivers and taps **I delivered it**. The phone is marked sold in their stock and removed from the store automatically.
5. The customer checks the phone and taps **Phone is fine**.
6. You pay the vendor the price minus your commission, then tap **I paid the vendor**.

If the customer taps **Report a problem**, you decide: **Refund customer** or **Pay vendor**. Your **Me → Store orders** page shows customer money you're holding and commission earned.

## Step 9: Lock it down
Follow **SECURITY.md**: it covers bot protection (App Check), Cloudflare DDoS protection and Firebase sign-in settings, about 30 minutes in total.

---

## Running the platform

**Approving shops.** New shops show under **Me → Members → Waiting**, and you'll see a red number on the **Me** tab. Check that the shop is real (WhatsApp them from there), then tap **Approve shop**. They're let in straight away.

**Premium.** A member pays you by transfer and sends proof on WhatsApp (the app has a button for this). Open them in **Members**, then tap **+30 days** (or choose a date) and **Give Premium**. Their posts get a gold border and a Premium badge, and they can post without limit. Premium ends by itself on that date.

**Unlimited posting without Premium.** Tick **Approve unlimited posting for free** on a member, for partners, friends or helpers.

**Suspending.** Tap **Suspend** on a member. They're locked out immediately, and you can reactivate them later.

**Removing posts.** As owner you see **Delete** on every post and comment.

**Vendor reports.** Members report a shop (from its profile) or a post (inside the post), choosing a reason: scam, fake or stolen phone, didn't pay, didn't return a phone, abuse, spam. Reports go to **Me → Vendor reports**, and only you and the reporter can see them. Open one to WhatsApp either side, then **Mark resolved** or **Suspend shop**. A shop's report count also shows in **Members**.

**Ratings.** Members rate other shops 1–5 stars, with an optional review, once per shop (they can edit it later). The average shows on posts, profiles and the partner list. As owner you can **Remove** an unfair review.

**Middleman desk** (**Me → Middleman desk**). The flow is:
1. The buyer taps **Buy with middleman** on a Selling post (or on a shop's profile).
2. The seller taps **Accept**.
3. The buyer pays **you** (price + fee) to the bank details in `PAYMENT_DETAILS` and sends proof on WhatsApp. When the money is in your account, tap **Buyer's money received**.
4. The seller hands over the phone and taps **I handed over the phone**.
5. The buyer checks the phone and taps **Phone is fine, release payment**.
6. You send the price to the seller, keep your fee, and tap **I paid the seller**.

If either side taps **Report a problem**, the deal goes into dispute. Talk to both sides, then tap **Refund the buyer** or **Release to seller**. The money moves by your own bank transfers; the app keeps a full record of every step.

> Holding other people's money is a real responsibility. Keep middleman money in a separate account, and pay out quickly.

## What members can do
- **Broadcast**: post Selling, Looking for, Swap or Info, with model, price, a photo and a TikTok video link. Others reply with WhatsApp, Call or comments, or tap the shop's name to see its rating and reviews. Mark a post sold once it's gone.
- **Profile**: add a TikTok page; see the reviews other shops gave you (**Me → My reviews**).
- **Today**: money outside with partners, sales this month, what's waiting on you, overdue phones, slow movers.
- **Stock**: private stock list, repair costs, swaps, WhatsApp receipts, a price list to share, and **Broadcast it** to post a phone straight to the board.
- **Deals**: give a phone to another member, or record one you collected; the other side confirms. Includes reminders, part payments and on-time scores.
- **Reports**: sales by month, best sellers, CSV export.
- **Me → Dropdown options** (owner only): edit the Parts and Face ID choices every shop picks from. Changes show for everyone at once.
- **Location**: every shop, listing and order carries one of the 36 states or the FCT, and the store, Broadcast and member list can filter by state.

## Common problems
- **"Access denied"**: the email in `firestore.rules` and `config.js` must match exactly, in small letters, and the rules must be **Published**.
- **Login fails on your domain**: add the domain under **Authentication → Settings → Authorized domains**.
- **Page shows "Almost ready"**: `config.js` still contains `PASTE_HERE`, or it wasn't uploaded next to `index.html`.
- **Photos**: they're shrunk automatically before upload, so posts stay light on data. There's one photo per post.

## Costs
The free plan covers about 50,000 page loads of data a day, which is plenty for hundreds of active shops. If you ever outgrow it, Firebase emails you before anything stops working.
