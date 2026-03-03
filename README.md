## Admin Panel

Next.js admin panel for the Humor Project database.

### Features

- OAuth login through Supabase Auth (`Google`) using `/login` and `/auth/callback`
- Login wall for admin access
- Super admin check via `profiles.is_superadmin`
- Dashboard stats for `profiles`, `images`, `captions`, and `caption_votes`
- Manage rows in `profiles`, `images`, and `captions`

### Environment

Create `.env.local` from `.env.example` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.
If not signed in, the app redirects to `/login`.

### Notes

- This project uses direct Supabase REST/Auth calls because package install/network is blocked in this environment.
- Ensure Google OAuth is enabled in Supabase Auth settings and includes your app URL in redirect URLs.
- Ensure your RLS policies allow super admins to read/update/delete the tables used by this app.
