# Security Guide: iPhone Dealers Hub

Your platform has several layers of protection. Some are already built into the app and the rules. Others are switches you turn on in Firebase and Cloudflare, which take about 30 minutes in total.

Being honest about it: **no website is attack-proof.** The aim is to make attacks expensive, limit the damage when one happens, and recover fast. Large DDoS floods are absorbed by Google (where your data lives) and Cloudflare (in front of your domain), not by the app itself.

---

## Already built in (nothing to do)

| Protection | What it stops |
|---|---|
| **Server-side rules** (`firestore.rules`) | Nobody can read or change data they shouldn't, even with hacking tools. Each shop's stock is private. |
| **Approval + verified email** | Bots and fake accounts can't use anything until they confirm a real email **and** you approve the shop. |
| **Daily caps per member** | Spam and flooding: 2 free posts, 150 comments, 10 reports, 30 new reviews, 100 deals and 20 middleman requests per day. The server counts them, so they can't be bypassed. |
| **Field checks** | Oversized or malicious data: every text has a length limit, prices must be numbers, photos must be real images, video links must be TikTok. |
| **Escaping all user text** | Script injection (XSS): posts, comments and names are shown as plain text, never run as code. |
| **Content Security Policy** | Script injection and data theft: the browser only loads code from your site and Google. |
| **Anti-clickjacking headers** | Other sites can't put your app in a hidden frame to trick members into clicking. |
| **Login protection** | Password guessing: lockout after 5 wrong tries, plus Firebase's own throttling. New passwords need 8+ characters with letters and numbers. |
| **Idle logout** | A shared or lost phone: members are logged out after 2 hours idle (change it with `IDLE_LOGOUT_MINUTES`). |
| **Owner account protection** | Someone faking your owner account: owner powers need your email **verified**, so even if someone signs up with your email before you, they can't confirm it. |
| **Emergency switches** (Me → Security) | During an attack you can pause new sign-ups, broadcast posting or new store orders instantly, for everyone. |
| **Customer store limits** | Each customer device can place at most 5 orders a day. An order is only accepted if the phone is live and the price matches the listing exactly, so a hacked browser can't order at a fake price. |
| **Private order links** | Each order has a long random code. Only someone with the link can open it, and nobody can list other people's orders. |
| **Dealer prices stay private** | The store only ever receives the customer price. Dealer prices and each shop's stock never leave the hub. |

---

## Step 1: HTTPS and security headers

**cPanel hosting:**
1. In cPanel: **SSL/TLS Status → Run AutoSSL**.
2. Upload `public/.htaccess` next to `index.html`. (In File Manager, tap **Settings → Show hidden files** to see it.) It forces HTTPS, adds the security headers and blocks access to hidden files.

**Firebase Hosting:** nothing to do. `firebase.json` already sends all the headers, and HTTPS is automatic.

## Step 2: Bot protection with App Check (important)

App Check makes the database accept requests **only from your real website**. Scripts, bots and copies of your site get rejected. It's free.

1. Go to **https://www.google.com/recaptcha/admin/create**.
   - Label: your platform name
   - Type: **reCAPTCHA v3** (score based)
   - Domains: your domain, e.g. `hub.yourdomain.com`
   - Submit, then copy the **Site key** and the **Secret key**.
2. In Firebase: **Build → App Check → Apps → your web app → reCAPTCHA v3**. Paste the **Secret key**, then click **Save**.
3. In `public/config.js`, set `RECAPTCHA_SITE_KEY` to the **Site key**. Upload `config.js` again.
4. Open your site and use it for a few minutes. In **App Check → APIs → Cloud Firestore**, check that the requests show as **verified**.
5. Click **Enforce** for **Cloud Firestore** and **Authentication**.

> Do step 5 only after step 4 shows verified requests. Enforcing too early blocks your own app.

Your **Me → Security** checklist shows "Bot protection: OK" once the key is in.

## Step 3: Cloudflare in front of your domain (DDoS shield)

Cloudflare's free plan sits between the internet and your website. It absorbs DDoS floods, blocks known bad bots and hides your hosting server.

1. Create a free account at **https://dash.cloudflare.com**, then **Add a site** and enter your domain.
2. Choose the **Free** plan. Cloudflare copies your DNS records; check they look right.
3. Cloudflare gives you 2 **nameservers**. At your domain registrar (Whogohost, Qservers, etc.), replace the nameservers with these two. It can take a few hours.
4. In Cloudflare, turn on:
   - **SSL/TLS → Overview → Full (strict)**
   - **SSL/TLS → Edge Certificates → Always Use HTTPS: On**
   - **Security → Bots → Bot Fight Mode: On**
   - **Security → Settings → Security level: Medium**
   - **Security → WAF → Rate limiting rules → Create rule**: when requests from one IP to your site are more than **100 in 10 seconds**, **Block for 1 minute**. (The free plan includes 1 rule.)
5. **If you're under attack:** in Cloudflare **Overview**, turn on **Under Attack Mode**. Visitors get a short check page while the flood is filtered out. Turn it off when things calm down.

> Cloudflare protects your website files. Your database is on Google's network, which has its own DDoS protection, and App Check (step 2) keeps bots out of it.

## Step 4: Firebase sign-in settings

In Firebase **Authentication → Settings**:
- **User actions:** keep **Email enumeration protection** ON. Attackers then can't find out which emails have accounts.
- **Password policy:** turn it on, minimum length **8**, require letters and numbers.
- **Authorized domains:** keep **only** your domain(s), `localhost`, and the default Firebase domains. Remove anything else.
- **Sign-in method:** keep only **Email/Password** and **Anonymous** (for store customers) enabled.

## Step 5: Protect your own owner account

Your owner email is the master key, so:
- Use a **strong, unique password** that you don't use anywhere else.
- Turn on **2-step verification** on that Gmail or email account. Whoever controls your email can reset your password.
- Use the Google account that owns the Firebase project only for this. Turn on 2-step verification there too.
- Never share your password with staff. If someone helps you, give them their own member account.

## Step 6: Watch your usage

Firebase **Usage and billing → Details**: check it now and then. On the free Spark plan nobody can run up a bill; at worst the app pauses until the next day if a flood uses up the daily quota. App Check and Cloudflare make that unlikely.

If you move to the paid Blaze plan later, set a **budget alert** (e.g. ₦5,000/month) in Google Cloud **Billing → Budgets & alerts** right away.

## Step 7: Backups

Once a week, as owner, go to **Me → Reports → Export** and save the CSV files (stock and deals). Each member can do the same for their own shop. On the Blaze plan you can also schedule full database exports (Firestore → Import/Export).

---

## If something happens: what to do

| You see | Do this |
|---|---|
| Lots of strange sign-ups | **Me → Security → New sign-ups → Pause.** Don't approve them. Turn sign-ups back on later. |
| Fake orders flooding the store | **Me → Security → Customer store orders → Pause.** Browsing still works. Cancel the fake orders in **Store orders**. |
| Spam flooding the broadcast board | **Me → Security → Broadcast posting → Pause.** Suspend the spammers in **Members** and delete their posts. |
| A member reported for scams | Check **Vendor reports**, WhatsApp both sides, and **Suspend** if needed. |
| Website slow or down from heavy traffic | Turn on Cloudflare **Under Attack Mode** (step 3). |
| You think your owner password leaked | Change your email password first, then use **Reset my password** on the app login page. In Firebase **Authentication → Users**, find your account → **⋮ → Disable/Enable** to end other sessions. |
| A member's account was hacked | **Suspend** it in Members. They reset their password, and then you reactivate them. |

---

## Keep it updated

- When you change `config.js` or `firestore.rules`, re-upload and **Publish** again.
- Check Firebase and Cloudflare emails. They warn you about unusual activity.
- Review **Me → Security** weekly.
