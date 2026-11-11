# Vendor notifications

Every vendor chooses what they hear about in **Me → Notifications**. Nothing is sent to a phone or WhatsApp unless that vendor switches it on.

## What works straight away (free, no setup)

| Feature | How it works |
|---|---|
| **Notification bell** 🔔 | Top right of the vendor app. Shows new broadcast posts (all of them, or only ones matching the vendor's alerts), store orders, deal requests, middleman steps, new reviews and comments, plus anything that needs their action. |
| **Alerts** | A vendor can choose *only posts that match my alerts*: post type, models or words (e.g. `13 pro, 14 pro max`), maximum price and city. |
| **Phone pop-ups** | With **Phone notifications** on, the phone shows a pop-up for anything new while the app is open or in the background. The phone asks for permission the first time. |
| **WhatsApp sharing** | After posting, a vendor gets a one-tap **Share on WhatsApp** to send the post to their groups and status. |
| **Daily digest** (owner) | **Me → WhatsApp daily digest** builds a list of today's listings, ready to post in your community WhatsApp group. Put your group link in `WHATSAPP_COMMUNITY_URL` in `config.js`. |

**iPhone users:** Apple only allows website notifications after the site is added to the Home Screen. In Safari, tap **Share → Add to Home Screen**, open the app from that icon, then switch on notifications (iOS 16.4 or newer).

---

## Optional: alerts when the app is closed, and automatic WhatsApp messages

This needs a small piece of server code (in the `functions` folder), which runs on Firebase's **Blaze (pay-as-you-go)** plan. The monthly free allowance is large, so a small platform usually pays little or nothing, but Firebase needs a card on file. Set a budget alert.

### A) Push notifications (phone alerts even when the app is closed)
1. In Firebase: **Upgrade** the project to **Blaze**. In Google Cloud **Billing → Budgets & alerts**, add a budget (e.g. ₦5,000).
2. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Copy the key.
3. In `public/config.js`, set `FCM_VAPID_KEY` to that key and `PUSH_ENABLED = true`.
4. On a computer with Node.js 22, open a terminal in this folder and run:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
   When it asks for `APP_URL`, give your site address ending with `/` (e.g. `https://yourdomain.com/`). For `OWNER_EMAIL`, give your owner email.
5. Upload the new `config.js`. Vendors then switch on **Phone notifications** again on each phone.

### B) Automatic WhatsApp alerts (WhatsApp Cloud API)
WhatsApp only allows automatic business messages through Meta's official API, using pre-approved message **templates**. Meta charges a small fee per message; check Meta's current WhatsApp pricing for Nigeria.
1. Go to **developers.facebook.com → My Apps → Create app → Business**, then add **WhatsApp**.
2. Add and verify a phone number for your business (a number not already used on the normal WhatsApp app).
3. In **WhatsApp Manager → Message templates**, create a template:
   - Name: `dealer_alert`, Category: **Utility**, Language: **English**
   - Body: `{{1}}` on the first line, `{{2}}` on the second line, e.g. `Alert: {{1}}` / `{{2}}`
   - Submit and wait for approval.
4. Create a **permanent access token** (Business settings → System users → Generate token, with `whatsapp_business_messaging` permission).
5. In the terminal:
   ```
   firebase functions:secrets:set WHATSAPP_TOKEN
   ```
   Paste the token when asked. Then deploy again with these values:
   ```
   firebase deploy --only functions
   ```
   Set `WHATSAPP_ENABLED` to `true` and `WHATSAPP_PHONE_ID` to the **Phone number ID** from the WhatsApp API setup page.
6. In `public/config.js`, set `WHATSAPP_ALERTS_ENABLED = true` and upload it. Vendors can now tick **WhatsApp messages** in their notification settings.

**What gets sent on WhatsApp** (only to vendors who switched it on, at most 10 a day each): new store orders and payments, deal confirmations and sales, middleman steps, and broadcast posts that match the vendor's own alerts. Every other update goes by push and in-app only, to keep WhatsApp useful and costs low.

### Checking it works
- Firebase **Functions → Logs** shows each alert sent, and any errors.
- To test, post from one vendor account while another vendor (with alerts on) has the app closed.
