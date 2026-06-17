# CLAUDE_CONTEXT.md
**Kaylee's Hub — Claude Conversation Context File**

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Purpose | Paste this file at the start of any new Claude conversation to resume development with full context. |

> **How to use:** Copy the entire contents of this file into a new Claude chat, then describe what you want to build. Claude will have everything it needs to continue without re-explaining the project.

---

## What This Project Is

Kaylee's Hub is a dual-mode personal CRM and household management web app for two users: **Kaylee Green** (admin, WGU work-from-home student success advisor) and **Adam Green** (limited user, her husband). It toggles between **Home mode** and **Work mode** from a topbar toggle.

The app is currently a fully functional prototype built as interactive HTML/JS widgets. No persistent backend exists yet — that is Phase 2.

---

## The Two Users

### Kaylee — Admin
- Email: green.kayleet@gmail.com
- Todoist ID: `56441076`
- Full access to everything
- Approves Adam's tasks before they go to his Todoist
- WGU Student Success Advisor — coaches students using the GROW model
- FERPA compliance required for all student data

### Adam — Limited User
- Email: adamlamargreen@gmail.com
- Phone: **470-302-0444** (all SMS notifications go here)
- Todoist ID: `56451676`
- Has ADHD and DVT
- Sees only his own task list — no finances, no work mode, no full inventory
- His primary interface is SMS/push notifications, not the web app

### Adam's ADHD Task Rules (critical — never violate these)
1. Max 2–3 tasks per day
2. No back-to-back tedious tasks
3. Heavy physical tasks (yard work) = that day's only task
4. Saturday is the only heavy day; **Sunday is always a rest day — no exceptions**
5. Quick wins listed first (dopamine → motivation for bigger task)
6. Large tasks split into per-room subtasks (vacuum → Living Room, Bedroom, Office, Guest Room)
7. Reminders framed positively, never as guilt
8. After 2 days of non-completion → escalate silently to Kaylee's list
9. **Kaylee must approve all tasks before they go to Adam's Todoist**

### Adam's Notification Schedule
| Time | Channel | Trigger |
|------|---------|---------|
| 11:00 AM | Push notification | Daily task recap |
| 5:30 PM | SMS to 470-302-0444 | Reminder if tasks incomplete |
| 8:30–9:00 PM | SMS to 470-302-0444 | Wind-down reminder if still incomplete |
| Ad hoc | SMS | Fridge item expiring within 2 days |
| Ad hoc | SMS | Recipe suggestion on cook nights |
| 1hr before | SMS | Any event on Adam's calendar |

---

## The Home

- Canton, Georgia (Mayridge community)
- 3 bed / 2 bath / 2-car garage / basement
- **Renter — not owner** (home suggestions must be tenant-only)
- Georgia-specific considerations: pollen season, humidity, summer heat, pest season

---

## The Two Vehicles

| Vehicle | Type | Miles | Critical Items |
|---------|------|-------|----------------|
| 2016 Toyota Corolla | Gas | 134,000 | Spark plugs overdue (120k interval), transmission fluid (no record) |
| 2013 Nissan Leaf | EV | 82,500 | 12V aux battery (12yr old car, almost certainly dead), HV battery health check |

**Recent Corolla services:** Brake pads & rotors (2025), oil change at 128,000 mi, tire balance & rotation at 133,900 mi  
**Both registrations:** In Kaylee's name, renew on her birthday each year  
**Air filter part numbers:** Leaf engine Fram CA 10755, Leaf cabin Fram CF 11177, Corolla engine Fram CA 10190, Corolla cabin Fram CF 10134

---

## The FERPA Rule (non-negotiable)

Student data is the one area where this CRM is intentionally incomplete. Rules:
- Store **first name or nickname only** — no student IDs, legal names, grades, or enrollment data
- GROW coaching notes only — these are Kaylee's notes, not official academic records
- **Nothing syncs to Salesforce automatically** — "Copy to Salesforce" is a manual clipboard action only
- Official records live in Salesforce (WGU's system) — we mirror, never replace

---

## Completed Modules

| Module | Status | Key Facts |
|--------|--------|-----------|
| Core shell | ✅ Done | Home/Work toggle, sidebar, toast system |
| Inventory | ✅ Done | Barcode lookup (Open Food Facts + Open Beauty Facts), 15 locations, insurance export, scan-to-use mode |
| Chores & Tasks | ✅ Done | Live Todoist data, 37 tasks, day grouping, section filters |
| Household Tasks | ✅ Done | Kaylee+Adam split, room/day/person, room subtasks, escalation |
| Adam's Tasks | ✅ Done | Week plan, approval flow, ADHD rules, notification schedule designed |
| Vehicles | ✅ Done | Both cars, all maintenance items, service log, mileage update |
| Home Suggestions | ✅ Done | 8 tenant-only Georgia suggestions, approval flow, year calendar |
| Calendar | ✅ Done | All 9 Google Calendars live, agenda/month/money views |

---

## Modules Still To Build

| Module | Phase | Priority | Notes |
|--------|-------|----------|-------|
| Budget | Phase 1 | High | Calendar data ready; need dedicated Budget page |
| Today's Tasks | Phase 1 | High | Combined work+home prioritized queue |
| Daily Briefing | Phase 1 | High | 2-3 min morning read from all sources |
| Students | Phase 1 | High | FERPA-safe GROW notes + copy-to-Salesforce |
| Supabase backend | Phase 2 | Critical | Schema designed, not yet created |
| Authentication | Phase 2 | Critical | Two users, role-based access |
| WGU Outlook | Phase 2 | High | M365 connector available, not yet authenticated |
| Twilio SMS | Phase 4 | High | Adam's notification texts |
| Recipe matching | Phase 5 | Medium | From current inventory, expiry-prioritized |
| Email drafts | Phase 5 | Medium | Morning Outlook/Gmail draft generation |
| Camera scanning | Phase 6 | Low | Replace keyboard barcode input |

---

## Technology Stack

**Current (prototype):** Vanilla HTML/CSS/JS widgets in Claude.ai artifacts  
**Target:** React + Next.js → Supabase (PostgreSQL + Auth) → Vercel hosting → Twilio SMS  
**Icons:** Tabler Icons CDN  
**Design tokens:** Claude CSS custom properties (auto light/dark mode)

**Brand colors:**
```
Purple (Kaylee):  #534AB7 / bg #EEEDFE / dark #3C3489
Green (Adam):     #0F6E56 / bg #E1F5EE
Red (urgent):     #A32D2D / bg #FCEBEB
Amber (warning):  #854F0B / bg #FAEEDA
```

---

## Live Integrations (Connected Now)

| Service | Status | Account |
|---------|--------|---------|
| Google Calendar | ✅ Live | green.kayleet@gmail.com |
| Todoist | ✅ Live | green.kayleet@gmail.com |
| Open Food Facts API | ✅ Live (no auth) | Barcode lookup — food |
| Open Beauty Facts API | ✅ Live (no auth) | Barcode lookup — personal care |
| Microsoft 365 / Outlook | ❌ Not connected | WGU work account needed |
| Twilio SMS | ❌ Not built | Phase 4 |
| Supabase | ❌ Not created | Phase 2 |

---

## All Google Calendar IDs

| Calendar | ID |
|---------|-----|
| Kaylee (primary) | `green.kayleet@gmail.com` |
| Adam | `33146a4ad40f11483f25d4fae271ef1ef06532572c008029c18e69da90e3edbd@group.calendar.google.com` |
| Expenses | `58eb4a8d76ad2633af565f70af96ab258511fae3b1472068a27e7ad2fb841536@group.calendar.google.com` |
| Birthdays/Anniversaries | `e3261c94eda64e2911b93408332cf15e694d445b353db8fbad96440883957066@group.calendar.google.com` |
| Holidays/Days Off | `ac345917bfef798558fe105ec8252f3898ef371ecd07e84d9e9c9cc00078032f@group.calendar.google.com` |
| Pay Day | `6fbd6f3be7ba1da6844a077497c40b3bd362895be1937d54b8e6e0450fc086cb@group.calendar.google.com` |
| Places To Be/To Do | `e0a98671e25d588d64b6761cf56bb5d86a78068ab08ee9b0299ef11d9952ba6e@group.calendar.google.com` |
| Vacation | `ee75d72ae5b7761bbc10fb62b88848eb628e4887ea0d528f3cf8ee692ba48d3e@group.calendar.google.com` |
| Holidays in US | `en.usa#holiday@group.v.calendar.google.com` |

---

## All Todoist IDs

| Item | ID |
|------|-----|
| Kaylee user | `56441076` |
| Adam user | `56451676` |
| House & Daily Life project | `6fPG54QMg3wXq9cG` |
| Gardening project | `6gXCQrrRpGh2q3wr` |
| Odds and Ends project | `6fh3FhfJfmM5h7Pj` |

---

## Known Expenses (from Expenses Google Calendar)

Recurring monthly unless noted:

| Item | Amount | Day of Month |
|------|--------|-------------|
| Transistor | $19 | 17th |
| Insurances | $325 | 20th |
| ChatGPT | $20 | 23rd |
| Electric | Variable | 1st |
| Rent | Variable | 1st |
| Google | $10 | 2nd |
| Acorns | $8 | 2nd |
| Netflix | $8 | 2nd |
| Fortnite | $13 | 2nd |
| Apple Care | $10 | 4th |
| Todoist | $7 | 5th |
| HBO | $3 | 5th |
| Student Loan | $175 | 9th |
| ABC Savings | $225 | 10th |
| Spotify | $17 | 10th |
| Loan Payment | $1,600 | 16th |
| Car Air Filters | $75 | Annual (Jun) |
| Hallmark Ornaments | $100 | Annual (Jul) |
| Corolla Oil Change | $75 | Annual (Jul) |
| Windshield Wipes | $50 | Annual (Jul) |

**Pay Day schedule:** Adam paid every 2 weeks (Fridays). Kaylee paid every 2 weeks (Thursdays, offset by 1 week from Adam).

---

## UI/UX Conventions (maintain consistency)

- **Mode toggle** is always in the topbar — not a page navigation
- **Sidebar** shows mode-specific nav; Today's Tasks and Daily Briefing always visible in both modes
- **Stats cards** (4-up grid) at top of every major page
- **Tab bar** for sub-views within a page (not sidebar navigation)
- **Toast notifications** bottom-center for all user feedback
- **Room subtasks** use expandable "Show rooms" toggle — never shown by default
- **Escalated tasks** always use amber left border (`border-left: 3px solid #EF9F27`)
- **Adam's tasks** always show green "A" avatar; Kaylee's show purple "K" avatar
- **Overdue/urgent** = red left border; **due soon** = amber left border; **ok** = green left border
- **Modal forms** always have location/room selection BEFORE item name — session-sticky
- **Barcode lookup** result card appears inline in the form, above manual fields
- **Export buttons** always green (`#0F6E56`) — they are additive/safe actions
- **Destructive actions** (delete, dismiss) always use red outline button style

---

## Key Architectural Decisions (don't re-debate these)

| Decision | Rationale |
|----------|-----------|
| Salesforce = copy-paste, no API | WGU prohibits external API access; manual copy is safer for FERPA |
| 9 Google Calendars, not consolidated | Kaylee already maintains this system — app reads it, doesn't replace it |
| Kaylee approves Adam's tasks | She knows his capacity; algorithm cannot |
| Sunday always rest day | Hard rule prevents Sunday becoming overflow day |
| Tenant-only home suggestions | Renter — structural items are landlord's problem |
| Barcode = keyboard input | Physical scanners emit keyboard keystrokes; camera scanning is Phase 6 |
| Inventory tracks estimated value | Insurance documentation — one of the most practical household documents |
| Heavy task = full day for Adam | ADHD executive function drain is real; modeling it prevents unrealistic assignments |
| Subtasks for vacuum/mop/sweep | Partial progress should be visible and rewarded |
| Budget data from Expenses calendar | Kaylee already maintains it there; don't duplicate |

---

## Full Documentation

For deeper reference, five full documents exist:
- `docs/PROJECT_OVERVIEW.md` — purpose, users, decisions, glossary
- `docs/DATABASE_SCHEMA.md` — full Supabase/PostgreSQL schema with RLS
- `docs/ARCHITECTURE.md` — component map, data flows, API routes, notification pipeline
- `docs/ROADMAP.md` — 6 phases with checkboxes
- `docs/CURRENT_STATUS.md` — what's built, bugs, debt, what to build next

---

## How To Continue Development

1. Paste this file into a new Claude conversation
2. Optionally paste `CURRENT_STATUS.md` for full bug/debt/status detail
3. Say what you want to build — e.g. *"Build the Budget module"* or *"Start Phase 2 Supabase setup"*
4. Claude will continue with full context, consistent design, and correct business rules

When a session ends, update `CURRENT_STATUS.md` with what was completed and what's next. Bump the version number and date at the top of this file whenever major new features are added.

---

*Last updated: June 17, 2026 — end of initial prototype session*
