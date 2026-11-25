# Account sign-in setup

The landing page and email/password auth screens use the shared self-hosted Supabase Auth service at `api-v3.therama.dev`.

Set these public build-time variables in Vercel for production (or in local `.env` for development):

```dotenv
VITE_SUPABASE_URL=https://api-v3.therama.dev
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is expected to be available in browser code. Never use a Supabase secret/service-role key in this app. The database must enforce access through row-level security.

Signup collects a display name, email, and password. If email confirmation is enabled in the Supabase Auth configuration, users confirm their address before signing in. Password reset is sent through Supabase Auth email. The client redirects successful sign-ins to `/app`.

The app works without an account; local documents stay in browser IndexedDB. A signed-in user gets encrypted Markdown sync enabled by default and can pause it in Preferences → Storage. Pausing keeps existing local and remote copies. Only Markdown documents sync; provider credentials and other workspace data stay on the client.

The browser encrypts document content, titles, and folder/workspace data before upload. The server stores ciphertext plus the account/device IDs and sync metadata needed for access control and conflict handling. A random recovery key unlocks the encrypted workspace on another device. Save it when the app shows it; the server stores only a wrapped encryption key. Losing the recovery key and every device's local key means the cloud copies cannot be recovered.

The UI calls `https://api-v3.therama.dev/md/v1/`. The API repository must have migration `028_md_workspace_sync.sql` applied and the public Cloudflare path filter must include `md` for this route to work from production.
