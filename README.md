# JobCard

JobCard is a calm service-operations workspace for creating, sharing and reviewing job records.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Email login setup

The login flow uses Resend’s server-side email API. Create a Resend API key, verify the sending domain, then set `RESEND_API_KEY` and `MAIL_FROM` in `.env`. Keep the key server-side; it is never sent to the browser. In production, also set a long random `SESSION_SECRET`, `APP_ORIGIN`, and `NODE_ENV=production`.

Without email configuration, local development returns a preview-mode response so the UI can be exercised without sending mail. It never exposes a code unless `SHOW_DEV_OTP=true` is explicitly enabled.

## Production notes

- Run on Node 20+ with `npm start`.
- Put the app behind HTTPS so the HTTP-only session cookie is protected in transit.
- For multiple server instances, replace the in-memory OTP/session maps with a shared store such as Redis or a database.
- Configure a verified Resend sending domain before allowing customer traffic.
