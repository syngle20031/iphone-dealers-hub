# iPhone Dealers Hub

A web platform for iPhone dealers in Nigeria, with two parts:

- **Dealer hub** (`public/hub.html`): each approved shop gets a private stock tracker, deals with other shops confirmed by both sides, a broadcast board, ratings, reports, a middleman (escrow) desk, and store orders.
- **Customer store** (`public/store.html`): customers browse phones listed by dealers, filter by state, parts and Face ID, and order with buyer protection.
- **Welcome screen** (`public/index.html`): choose customer or vendor.

Built on Firebase (Hosting, Authentication, Cloud Firestore). The security rules in `firestore.rules` are what protect the data.

Live: https://dealers-hub-5c144.web.app

## Deploy
See `DEPLOY-NOW.md`. In short:

```
firebase deploy --only hosting,firestore --project dealers-hub-5c144
```

## Docs
- `SETUP-GUIDE.md`: full setup
- `SECURITY.md` and `SECURITY-AUDIT.md`: protections and audit
- `NOTIFICATIONS.md`: push and WhatsApp alerts (optional Cloud Functions in `functions/`)

Powered by Syngle (M.A Haske).
