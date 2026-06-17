# Kaylee's Hub v0.3

Dual-mode personal CRM + household management app for Kaylee and Adam Green.

## What changed in v0.3

- Reworked the app into one unified Claude-style shell.
- Every module now loads inside the same topbar/sidebar layout.
- Added responsive mobile sidebar behavior.
- Added the Students MVP page with FERPA-safe GROW note layout.
- Expanded Today's Tasks, Daily Briefing, Calendar, Budget, Inventory, Chores, Adam's Tasks, Vehicles, and Home Suggestions pages.
- Kept Adam's rules visible: max 2–3 tasks/day, Saturday heavy day, Sunday rest, Kaylee approval before Todoist.

## Deploy settings for Vercel

Framework preset: Vite

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

Install command:

```bash
npm install
```

## Environment variables

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The current build uses seeded/mock data in React. Supabase is scaffolded but not yet required for the UI to load.

## Next recommended build

v0.4 should connect the Students MVP to Supabase and add real CRUD for FERPA-safe student records and GROW session notes.
