# Kaylee's Hub v0.6 - Settings + Adam Access Levels

This build updates v0.5 authentication to use the `module_permissions` table and a three-level Adam permission system:

- Hidden
- View Only
- Edit

## What changed

- Settings page now uses dropdowns instead of view/edit checkboxes.
- Settings loads from `public.module_permissions` where `role = 'limited'`.
- Saving a dropdown updates Supabase using `upsert`.
- Adam's sidebar hides modules with `hidden` access.
- View-only modules show a read-only banner and hide/disable edit controls where currently implemented.
- Kaylee/admin still sees everything.
- Adam is still Home-only. Students remains admin-only.

## SQL

You already created/populated `module_permissions`. If you need to repair or recreate it, run:

`supabase/v0_6_module_permissions.sql`

## Deploy

Upload/replace the files in GitHub and let Vercel redeploy.
