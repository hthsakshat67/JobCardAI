# JobCard

JobCard is a calm service-operations workspace for creating, sharing and reviewing job records.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Production notes

- Run on Node 20+ with `npm start`.
- Put the app behind HTTPS so the HTTP-only session cookie is protected in transit.
- The current email-only sign-in is intentionally frictionless. For a public multi-user deployment, add a password, SSO, or external identity provider before treating email addresses as proof of identity.
- For multiple server instances, replace the in-memory session map with a shared store such as Redis or a database.
