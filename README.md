# Kaylee's Hub

Dual-mode personal CRM + household management app for Kaylee and Adam Green.

## What is included in this starter build

- Vite + React + TypeScript app
- Deployable Vercel-ready frontend
- Home / Work topbar mode switch
- Sidebar navigation that changes by mode
- Brand palette locked to:
  - Kaylee purple `#534AB7`
  - Adam green `#0F6E56`
  - urgent red `#A32D2D`
  - warning amber `#854F0B`
- Seeded Phase 1 UI pages:
  - Dashboard
  - Inventory
  - Today's Tasks
  - Daily Briefing
  - Adam's ADHD-safe Tasks
  - Vehicles
  - Home Suggestions
  - Budget placeholder
  - Calendar placeholder
  - Students FERPA-safe page
- Supabase starter schema in `supabase/schema.sql`
- `.env.example` for Supabase/Vercel setup

## Important rules preserved in the build

### Adam

Adam is a limited user. In production he should see only his own task list. He should not see finances, work mode, or full inventory.

His ADHD rules are treated as product rules, not suggestions:

- max 2–3 tasks/day
- no back-to-back tedious tasks
- Saturday is the only heavy day
- Sunday is always rest
- quick wins first
- room-level subtasks
- positive reminders
- silent escalation after 2 days
- Kaylee approves before anything goes to Todoist

### FERPA

The Students page is intentionally limited:

- first name/nickname only
- GROW notes only
- no student IDs
- no grades
- no enrollment data
- no Salesforce API sync
- Copy to Salesforce is clipboard only

## Local setup

```bash
npm install
npm run dev
```

Open the local Vite URL shown in your terminal.

## Supabase setup

1. Create a new Supabase project.
2. Create Kaylee and Adam as Auth users.
3. Open Supabase SQL editor.
4. Run `supabase/schema.sql`.
5. Add the values from your Supabase project to `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

This starter UI is still mostly seeded frontend data. The schema is included so the next session can wire Inventory CRUD, auth, and role-based views.

## Vercel deployment

1. Push this folder to GitHub as `kaylees-hub`.
2. In Vercel, import the GitHub repo.
3. Framework preset should auto-detect as Vite.
4. Add the Supabase environment variables.
5. Deploy.

## Recommended next build order

1. Wire Supabase Auth and session state.
2. Connect Inventory page to Supabase CRUD.
3. Add Adam's limited route guard.
4. Build Budget from Expenses + Pay Day calendar cache.
5. Wire Google Calendar OAuth.
6. Wire Todoist OAuth and approval-to-Todoist flow.
7. Build Twilio notifications.

## Notes

The existing Claude MCP Google Calendar and Todoist integrations do not automatically transfer to Vercel. In production, those need real OAuth/API integrations through backend routes or Supabase Edge Functions.
