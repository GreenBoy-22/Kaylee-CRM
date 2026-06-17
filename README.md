# Kaylee's Hub v0.5 — Auth + Adam Permissions

This build adds Supabase Auth, two roles, and a Settings page for controlling Adam's Home-side access.

## What changed

- Login screen using Supabase Auth
- Kaylee profile = `admin`
- Adam profile = `limited`
- Adam is Home-only and cannot access Work mode
- Settings page for Kaylee/admin
- Per-section Adam toggles:
  - View: Adam can see the section
  - Edit: Adam can change/complete/save things in that section
- Students remain admin-only and FERPA-safe
- Inventory save still works, but Adam is view-only unless Inventory Edit is turned on

## Deploy steps

1. Upload/replace these files in GitHub.
2. In Supabase SQL Editor, run:
   - `supabase/v0_5_auth_schema.sql`
3. In Supabase Auth, create users or sign up from the app:
   - Kaylee: `kayleet.green@gmail.com` or `green.kayleet@gmail.com`
   - Adam: `adamlamargreen@gmail.com`
4. In Vercel, confirm env vars exist:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Redeploy.

## Notes

- Adam sees Home sections by default.
- Adam's Edit toggles default off.
- Work mode, Students, and FERPA-safe work data remain Kaylee/admin only.
- v0.6 should tighten RLS for every home table to match the section permissions server-side.
