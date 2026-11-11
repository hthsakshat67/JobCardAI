# Dispatch Draft

Dispatch Draft is a calm service-operations workspace for creating, sharing and reviewing job records.

## In-memory backend

Dispatch Draft ships with a self-contained Node backend. Accounts, sessions, and job records live in process memory, so the app starts empty and data is intentionally cleared whenever the server restarts. This is useful for local publishing, review environments, and lightweight single-process deployments; it is not durable storage for a multi-instance production deployment.

The backend normalizes email addresses, rejects duplicate accounts, hashes passwords with `scrypt`, enforces eight characters plus one uppercase character, scopes jobs to their owner, and streams job changes to the dashboard over Server-Sent Events. No plaintext passwords or seeded records are stored.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Deployment notes

- Run on Node 20+ with `npm start`.
- Put the app behind HTTPS so the HTTP-only session cookie is protected in transit.
- Set `APP_ORIGIN` to the public origin when deployed.
- Use a process manager that keeps one server process alive if you need the in-memory records to remain available.
- If records must survive restarts or scale across instances, replace the in-memory Maps with a durable database before production use.
