# Kaylee's Hub

Version 0.2 rebuild: Claude-style UI port.

## What changed

- Reworked the app shell to match the Claude artifact style: topbar, Home/Work toggle, 200px sidebar, grouped nav, card-based modules.
- Added styled prototype pages for Inventory, Chores & Tasks, Adam's Tasks, Vehicles, Home Suggestions, Calendar, Today's Tasks, Daily Briefing, and Students.
- Preserved the non-negotiables: Adam limited/approval-first workflow, Sunday rest, tenant-only home suggestions, and FERPA-safe student notes.

## Vercel settings

Framework preset: Vite
Build command: `npm run build`
Output directory: `dist`
Install command: `npm install`

## Environment variables

Optional until live Supabase reads/writes are connected:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Local run

```bash
npm install
npm run dev
```

## Next build candidates

1. Wire Inventory to Supabase CRUD.
2. Add real barcode lookup proxy.
3. Wire Vehicles/Home Suggestions to Supabase.
4. Add auth and role-based routing for Kaylee vs. Adam.
