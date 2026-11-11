# Dispatch Draft

Dispatch Draft is a calm service-operations workspace for creating, sharing and reviewing job records.

## Production backend setup

1. Create a Supabase project and copy its project URL and publishable anon key into `.env` using [.env.example](.env.example).
2. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor. It creates the jobs table, ownership trigger, indexes, Row Level Security policies, and Realtime publication.
3. In Supabase Auth settings, enable email/password authentication. Supabase Auth owns password hashing, duplicate-email enforcement, sessions, email confirmation, and account recovery.
4. Run `npm start` and open `http://localhost:3000`.

The front end has no seeded records. The dashboard starts empty, job records are stored in Postgres, and authenticated clients receive updates through Supabase Realtime. The server never receives or stores plaintext passwords.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Production notes

- Run on Node 20+ with `npm start`.
- Put the app behind HTTPS so the HTTP-only session cookie is protected in transit.
- The app uses Supabase email/password sign-in with email confirmation available in hosted projects.
- Passwords require at least eight characters and one uppercase character in the UI and signup flow; Supabase remains responsible for secure password storage and session management.
- Review Supabase’s production checklist before launch, including HTTPS, email confirmation, RLS, and a custom SMTP provider.
