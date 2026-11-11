# Security audit: iPhone Dealers Hub

**Scope:** the whole codebase in this package.

| Part | Files |
|---|---|
| Vendor app | `public/hub.html`, `public/app.js` |
| Customer store | `public/store.html`, `public/store.js` |
| Welcome page | `public/index.html`, `public/landing.js` |
| Service worker | `public/sw.js` |
| Access control (the real security boundary) | `firestore.rules` |
| Optional server code | `functions/index.js` |
| Hosting | `firebase.json`, `public/.htaccess` |
| Settings | `public/config.js` |

**Standard:** OWASP Top 10 (2021) and the OWASP ASVS principles behind them.
**Date:** 11 Nov 2026.

## How this app is built, and why that matters for security

There is **no custom backend or SQL database**. The browser apps talk directly to Google Firebase:
- **Firebase Authentication** handles accounts and passwords.
- **Cloud Firestore**, a document database, stores the data.

So **`firestore.rules` is the security boundary**: anything the rules allow, an attacker can do with their own script, regardless of what the app's screens show. The audit therefore reviewed every rule against every way the data can be read or written. Client-side checks were treated as convenience, never as protection.

## Method and evidence
- Read every rule and every place data is read, written or put into a page.
- Automated scan for unescaped values in HTML attributes. It found 46 instances, now 0.
- `npm audit` on all dependencies.
- **Live exploit tests** in a scripted browser against the demo build of the real code. The demo swaps Firebase for a local stand-in, so it tests the app code, not the rules. Each fix was tested, and the main XSS was also reproduced against the pre-fix code to prove it was real.
- Structural check of `firestore.rules`: brackets balanced, every called function defined.

## Limits of this audit (read this)
- **The rules could not be run in Google's official rules emulator here** (this environment can't reach Google's servers). They were reviewed by hand and structurally checked. Firebase validates the syntax when you click **Publish**, and the *post-deployment tests* at the end must be run once the app is live.
- Your live Firebase project, hosting account and domain could not be inspected. Section C lists the settings to check there.
- This was a code review with targeted exploit tests, **not a full penetration test of the deployed system**. Re-test after deployment and after major changes.

**This report does not claim the application is "secure".** It lists what was found, what was fixed with evidence, and what risk remains.

---

## A. Vulnerabilities found and fixed

Severity uses OWASP risk rating (impact × likelihood).

### SEC-01: Stored XSS / HTML injection through database IDs (HIGH, fixed)
- **OWASP:** A03 Injection (XSS)
- **Where:** `public/app.js`, 46 places such as the deal, order, middleman and stock detail screens: `` data-id="${id}" `` inserted a document ID into HTML without escaping.
- **Risk:** document IDs are chosen by whoever creates the record. A malicious member could create a deal with another member whose ID contains HTML (e.g. `x"><img …>`). When the victim opened it, the attacker's HTML was injected into the page. That allows fake buttons or links for phishing, inside a trusted app. The Content Security Policy blocks injected *scripts* on the live site, but not injected HTML.
- **Fix (implemented):**
  1. Every ID is now escaped: `` data-id="${esc(id)}" ``.
  2. The rules now refuse IDs that aren't plain letters, numbers, `-` or `_` (`idOk()` in `firestore.rules`, applied to deals, posts, comments, reports, middleman deals, orders, reports from the site, stock and sales).
- **Evidence:** a deal with ID `abc"><img src=x id=pwned …>` was planted in the test data. **Before the fix**, opening it injected the `<img>` into the page. **After the fix**, nothing was injected and buttons keep the exact ID.
- **Verify:** after deploying, open the browser console on your site and try `setDoc(doc(db,'moves','a"b'),{…})`. Firebase must answer *permission denied*.

### SEC-02: Customers' name, phone and address exposed (HIGH, fixed)
- **OWASP:** A01 Broken Access Control / sensitive data exposure
- **Where:** `public/store.js` (`placeOrder`) stored contact details inside `orders/{id}`, and `firestore.rules` allowed `get` on any order to anyone holding the link. The seller could also read the full order, including details, *before* the customer paid. The screen hid them, but the data was downloadable.
- **Risk:** anyone who saw a tracking link (screenshots, forwarded chats) got the customer's home address and phone number. Sellers could also contact customers directly and bypass buyer protection.
- **Fix (implemented):**
  - Contact details moved to `orders/{id}/private/contact`.
  - Rules: only the **customer**, **you**, and the **seller after payment** (status `paid` and later) can read it.
  - The order itself now holds only the item, amount and city. Orders can't be created without the private contact document.
  - The vendor app loads contact details only when allowed. The server code no longer puts the customer's name into notifications.
- **Evidence:**
  - Test: the stored order record contains no name, phone or address.
  - The seller viewing an unpaid order sees "Shown after payment".
  - The customer still sees their delivery box.
- **Verify:** open a tracking link in a private window. It shows status and city but no address. Log in as the seller of an unpaid order: no contact details.

### SEC-03: Client-chosen timestamps let a member pin posts on top (MEDIUM, fixed)
- **OWASP:** A04 Insecure Design
- **Where:** `firestore.rules` accepted any `createdAt` / `updatedAt` from the phone. The feed and store sort by these.
- **Risk:** a member could set a date years in the future and stay at the top of the broadcast board or the store "Newest" list forever.
- **Fix (implemented):** `notFuture()` rejects timestamps more than 10 minutes ahead of Google's server time. It applies to posts, comments, listings, deals, middleman deals, orders, ratings, reports and sales.
- **Verify:** write a post with `createdAt: Date.now() + 86400000` from the console → *permission denied*.

### SEC-04: Deal / order / middleman history could be rewritten (MEDIUM, fixed)
- **OWASP:** A08 Software & Data Integrity Failures
- **Where:** `firestore.rules` allowed either party to replace the whole `history` list.
- **Risk:** in a dispute, a party could delete or edit earlier entries (e.g. remove "returned the phone"), destroying the evidence you rely on.
- **Fix (implemented):** `histOk()`:
  - History is **append-only**. Earlier entries must be unchanged, and exactly one is added per update.
  - The new entry must carry the writer's own user ID (`uid`), so entries can't be forged in someone else's name.
  - The apps now sign each entry.
- **Verify:** from the console, update a deal with a shortened `history` → *permission denied*.

### SEC-05: Customer could set your store commission to ₦0 (MEDIUM, fixed)
- **OWASP:** A04 Insecure Design (business logic)
- **Where:** `firestore.rules` `orderOk()` accepted any `commission` between 0 and the price.
- **Risk:** a tampered order would show ₦0 commission, and you'd pay the vendor the full amount.
- **Fix (implemented):** commission must equal 5% of the price (±₦1). Keep this in step with `STORE_COMMISSION_PERCENT` in `config.js`.
- **Verify:** create an order with `commission: 0` from the console → *permission denied*.

### SEC-06: Shop impersonation by renaming (MEDIUM, fixed)
- **OWASP:** A07 Identification & Authentication Failures / A04
- **Where:** `firestore.rules` let members change their own `shopName`. Posts, comments and reviews only check that the name matches the member's current name.
- **Risk:** a member renames to "Ade Gadgets" and posts or comments as a well-rated shop.
- **Fix (implemented):** only you (owner) can change shop names. Use the **Rename** box in Members, which also refuses duplicate names. The member's profile form shows the name locked.
- **Evidence:** test confirmed the field is locked for members.
- **Verify:** as a member, update `shopName` from the console → *permission denied*.

### SEC-07: Applicants' personal details visible to all members (MEDIUM, fixed)
- **OWASP:** A01 Broken Access Control
- **Where:** `firestore.rules` `members` read rule.
- **Risk:** names, phone numbers and addresses of people who applied, or were suspended, were readable by every approved member.
- **Fix (implemented):** members can read only **approved** shops (and themselves). You still see everyone. The vendor app now only asks for approved shops.

### SEC-08: Spreadsheet formula injection in CSV exports (MEDIUM, fixed)
- **OWASP:** A03 Injection (CSV/formula injection)
- **Where:** `public/app.js` `csv()`. Exports include text typed by other people (partner shop names, notes, customer names).
- **Risk:** a value like `=HYPERLINK("http://evil…")` becomes a live formula when the CSV is opened in Excel or Google Sheets. It can lead to phishing or data leaks.
- **Fix (implemented):** cells starting with `= + - @`, tab or carriage return get a leading `'` (numbers are left alone).
- **Evidence:** test exported a phone named `=HYPERLINK(...)`. The cell came out as `'=HYPERLINK(...)`, which shows as plain text.

### SEC-09: Unlimited extra fields and oversized records (MEDIUM, fixed)
- **OWASP:** A04 / A05
- **Where:** `firestore.rules` for posts, comments, deals, middleman deals, ratings and reports didn't restrict which fields could be written.
- **Risk:** a member could attach megabytes of junk to a post. Every viewer downloads it, which wastes data, slows phones and raises your bill. Unexpected fields could also confuse the app.
- **Fix (implemented):**
  - Each record now has an exact allowed field list (`keys().hasOnly([...])`).
  - Text fields have length limits.
  - Phone details in deals are validated (`devOk()`).
  - Deal `soldInfo`, `deviceId` and price are validated or locked.

### SEC-10: Notification click could open an outside website (LOW, fixed)
- **Where:** `public/sw.js` `notificationclick`.
- **Risk:** a notification carrying an outside link would open it. Only your own server can send notifications, so the likelihood is low.
- **Fix (implemented):** only links on your own site are opened. Anything else opens the vendor app.

### SEC-11: Vulnerable dependency versions (MEDIUM, fixed)
- **OWASP:** A06 Vulnerable & Outdated Components
- **Where:** `app.js`, `store.js` and `sw.js` loaded Firebase JS SDK **10.14.1**. `npm audit` reports 11 advisories (6 moderate, 5 high) for that version.
- **Fix (implemented):** upgraded to **13.2.0**, after confirming every function the app uses still exists in it.
  - `npm audit` on 13.2.0 shows 4 high advisories left, all in `@grpc/grpc-js`, a Node-only networking package. It isn't part of the browser bundle these pages load.
  - Server code (`functions/`, firebase-admin 14.5 and firebase-functions 7.4): **0 vulnerabilities**.
- **Verify:** after deploying, open the site, then open the browser console: there should be no errors loading `firebasejs/13.2.0`. If the page is blank, change `13.2.0` back to `10.14.1` in `app.js`, `store.js` and `sw.js` and tell me.

### SEC-12: WhatsApp message parameters not cleaned (LOW, fixed)
- **Where:** `functions/index.js`.
- **Risk:** line breaks typed by users would make Meta reject alerts, and an attacker could stop someone's alerts.
- **Fix (implemented):** `waSafe()` flattens line breaks and tabs.

---

## B. Checked and found sound (no change needed)

| Area | Finding |
|---|---|
| **SQL / NoSQL injection** | No SQL anywhere. Firestore is accessed through the official SDK with typed values. No query strings are built from user input, and document paths can't contain `/`. **Not applicable / no issue.** |
| **Password storage** | The app never sees or stores passwords. Firebase Authentication stores them hashed (scrypt). |
| **Sessions** | Firebase ID tokens expire hourly and refresh automatically. Logout clears listeners. Idle logout after 120 minutes (`IDLE_LOGOUT_MINUTES`). |
| **CSRF** | Not applicable. Requests carry a bearer token from the browser's storage, not cookies, so another site can't make requests as the user. |
| **Clickjacking** | `X-Frame-Options: DENY` and `frame-ancestors 'none'` in `.htaccess` and `firebase.json`. |
| **XSS (other sinks)** | All user text goes through `esc()`. Links use safe builders (`waLink`, `telLink`, `tiktokUrl` checks `https` + tiktok.com only). Toasts use `textContent`. Photos must be `data:image/jpeg|png|webp;base64`. CSP has **no `unsafe-inline` for scripts**, so injected scripts can't run on the live site. |
| **File uploads** | Photos are re-drawn on a canvas before upload, which strips location and camera metadata. They're limited to ~250 KB, checked by the rules for image type and base64 format, and shown only with `<img>`. SVG and other types are refused. |
| **Exposed secrets** | None in the code. The Firebase web config in `config.js` is **public by design** (it identifies the project; it doesn't grant access, which the rules control). The FCM VAPID key is public by design. The WhatsApp token is held in Google **Secret Manager** (`defineSecret`), never in the browser or the code. |
| **Admin / owner powers** | Need the owner email **and** a verified email address, so someone can't register your email to take over. |
| **Approval gate** | Unapproved, suspended, unverified and anonymous (customer) accounts can't read or write member data. Checked rule by rule. |
| **Rate limits** | Server-enforced daily caps per member (posts, comments, reports, reviews, deals, middleman requests, sales) and per visitor (orders, reports). Counters can only go up during a day. |
| **Money fields** | Deal price can't change after creation. "Paid" can't exceed the price and only the receiving side can confirm it. The order amount must equal the live listing price. The middleman fee has a minimum. Only you can mark store orders paid or complete, or release middleman money. |
| **Hosting headers** | CSP, HSTS (1 year), `nosniff`, Referrer-Policy and Permissions-Policy are set. Directory listing is off, hidden and backup files are blocked, and only GET/HEAD are allowed on the static site. |
| **Server code** | Up to 5 instances, secrets via Secret Manager, inputs clipped, WhatsApp capped at 10 per vendor per day, dead push tokens removed. |

---

## C. Remaining risks: actions for you (in priority order)

| # | Severity until done | Risk | What to do |
|---|---|---|---|
| R1 | **High** | **Bots can call your database directly** until App Check is enforced. They could also make many anonymous customer accounts to get around the per-visitor order and report caps. | SECURITY.md **step 2**: add the reCAPTCHA key and **Enforce** App Check for Firestore and Authentication. The **Customer store orders** emergency switch can pause fake orders instantly. |
| R2 | Medium | The Firebase API key isn't restricted to your domain. | Google Cloud Console → APIs & Services → Credentials → your *Browser key* → **Website restrictions** = your domains, and **API restrictions** = only the Firebase APIs the app uses. |
| R3 | Medium | The 5-try lockout on the login screen is in the app only. Real brute-force protection comes from Firebase. | Firebase Authentication → Settings: turn on the **password policy** (8+ characters, letters and numbers) and keep **email enumeration protection** on. Turn on 2-step verification on your owner email account. |
| R4 | Medium | The rules haven't been run in Google's emulator (see Limits). | Click **Publish** (Firebase checks the syntax), then run the post-deployment tests below. |
| R5 | Low | A tracking link works like a password for that one order: anyone with it sees the item, amount, city and status (no longer name, phone or address). Order IDs are 87-bit random, so they can't be guessed. | Tell customers not to post their tracking link publicly. |
| R6 | Low | Members can bump a post's comment counter by ±1 (cosmetic only). | Accept, or move counters to the optional server code later. |
| R7 | Low | Reviews don't require a completed deal between the two shops. | Remove unfair reviews as owner (Remove button); report abuse. |
| R8 | Low | `style-src 'unsafe-inline'` is allowed (needed by the app's inline styles). Scripts remain strict. | Accept. |
| R9 | Low | Sign-up says when an email already has an account (email enumeration). | Accept, as it's needed for clear sign-up errors; Firebase throttles repeated attempts. |
| R10 | Low | Your owner email is visible in `config.js` (the app needs it). | Use 2-step verification on that email and be alert to phishing. |
| R11 | Info | Members' phone numbers are visible to other approved members (a feature: WhatsApp and Call buttons). | Mention it in your terms when shops join. |

## D. Post-deployment security tests (run once live)

Open your live site, log in as a normal (non-owner) test member, open the browser **Console**, and check that each of these is **refused** with *Missing or insufficient permissions*:

| # | Test | Expected |
|---|---|---|
| 1 | Read another shop's stock: `members/<otherUid>/devices` | Refused |
| 2 | Change your own `status` to `active`, or `premiumUntil` to a future day, on your member record | Refused |
| 3 | Create a post with `createdAt` set to tomorrow | Refused |
| 4 | Create a third free post in one day | Refused |
| 5 | Update a deal and remove an entry from its `history` | Refused |
| 6 | Read `orders/<someId>/private/contact` for an order that isn't yours | Refused |
| 7 | Create an order with `commission: 0` | Refused |
| 8 | Read the `reports` and `feedback` collections | Refused |
| 9 | Change your `shopName` | Refused |

Also check:
- Your site's headers at **securityheaders.com**. Expect grade **A** with the `.htaccess` or `firebase.json` headers active.
- Firebase **App Check → Firestore**: requests show as verified, then click **Enforce**.

I can walk you through these console tests step by step once the site is live.
