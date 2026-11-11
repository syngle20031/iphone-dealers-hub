# Put iPhone Dealers Hub online (from your phone, about 10 minutes)

Your Firebase settings, owner email and WhatsApp number are already filled in.
The site goes live at **https://dealers-hub-5c144.web.app** (free, no domain needed).

## 1. Open Google Cloud Shell
In Chrome, go to **shell.cloud.google.com** and sign in with the Google account that owns the Firebase project.
Tip: in Chrome's menu tick **Desktop site** so the terminal is easier to use.

## 2. Upload the zip
Tap **⋮ → Upload** and choose `iphone-dealers-hub.zip`.

## 3. Unzip it
```
rm -rf iphone-dealers-hub && unzip -o iphone-dealers-hub.zip && cd iphone-dealers-hub
```

## 4. Log in to Firebase (first time only)
```
firebase login --no-localhost
```
Answer **n** to the questions about Gemini and usage data. Open the link it shows, sign in, tap **Allow**, copy the code and paste it back.
If it says `command not found`, run `npm i -g firebase-tools` first.

## 5. Deploy
```
firebase deploy --only hosting,firestore --project dealers-hub-5c144
```
This uploads the website **and** the security rules and database indexes. Always include `firestore`.
Wait for **Deploy complete!** The indexes can take a few more minutes to finish building.

## 6. Make yourself the owner (first time only)
1. Open https://dealers-hub-5c144.web.app/hub.html → **Join with your shop**.
2. Sign up with **mabdussamad634@gmail.com** and confirm the email Firebase sends you.
3. Log in again. You now see the owner tools: Members, Store orders, Reports, Security, Dropdown options.

## Your links
- Welcome screen: https://dealers-hub-5c144.web.app
- Vendor hub: https://dealers-hub-5c144.web.app/hub.html
- Customer store: https://dealers-hub-5c144.web.app/store.html

## Updating later
Upload the new zip and repeat steps 3 and 5.

## Recommended after going live (SECURITY.md has the details)
- Turn on **App Check** (reCAPTCHA v3) and paste the site key into `public/config.js`.
- Restrict the API key to your web address in Google Cloud → Credentials.
- Set a password policy in Firebase → Authentication → Settings.
