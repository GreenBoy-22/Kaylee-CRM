# CURRENT_STATUS.md
**Kaylee's Hub — Current Development Status**

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Current phase | Phase 1 — Prototype |
| Next milestone | Complete Phase 1 remaining items + begin Phase 2 setup |

> **How to use this document:** Update this file at the start of every new development session. It is the "ground truth" for what currently works, what is broken, and what the next priority is. It is intentionally short — full details live in ROADMAP.md.

---

## Quick Status Summary

| Module | Status | Notes |
|--------|--------|-------|
| Core shell (toggle, sidebar, nav) | ✅ Complete | |
| Inventory | ✅ Complete | Live barcode lookup working |
| Chores & Tasks (Todoist) | ✅ Complete | Live Todoist data |
| Household Tasks (Kaylee+Adam) | ✅ Complete | Mock escalation data |
| Adam's ADHD Task System | ✅ Complete | Approval flow, notification design |
| Vehicle Maintenance | ✅ Complete | Both cars, service history logged |
| Home Suggestions | ✅ Complete | 8 suggestions, year calendar |
| Calendar (9 Google Calendars) | ✅ Complete | Live data, agenda/month/money views |
| Budget Module | 🔄 In progress | Calendar data ready, page not built |
| WGU Outlook Calendar | 🔄 Blocked | M365 connector available, not authenticated |
| Today's Tasks (combined view) | ⬜ Not started | Phase 1 remaining |
| Daily Briefing | ⬜ Not started | Phase 1 remaining |
| Students Module | ⬜ Not started | Phase 1 remaining |
| Supabase Backend | ⬜ Not started | Phase 2 |
| Authentication | ⬜ Not started | Phase 2 |
| Twilio SMS | ⬜ Not started | Phase 4 |
| Push Notifications | ⬜ Not started | Phase 4 |

---

## What Was Built in This Session (June 17, 2026)

This is a record of everything built in the initial project conversation.

### 1. Core Shell
Full application shell with Home/Work mode toggle, sidebar navigation, shared sections, and toast notification system.

### 2. Inventory Module (v4 — most current)
- Manual add and scan-to-add flows
- Barcode lookup via Open Food Facts + Open Beauty Facts (live API calls)
- Scan-to-use/remove mode with amber banner and Enter-key barcode input
- All 15 storage locations and rooms
- Insurance fields: estimated value, purchase date, serial/model number
- Room card view with per-room estimated value totals
- Insurance CSV export
- Session-sticky location selection
- Stats bar with total qty, total estimated value, expiring soon, expired

### 3. Chores & Tasks Module
- Live Todoist data from House & Daily Life, Gardening, and Odds and Ends projects
- 37 tasks pulled and displayed
- Tab navigation: Today / All recurring / One-off / Garden / All
- Section filter pills
- Recurrence and due date tags
- Expandable room subtasks

### 4. Household Task System (Kaylee + Adam Split)
- Person avatars (K/A) on every task
- Tasks grouped by day of week
- Room badges on each task
- Multi-room subtask expansion (Vacuum → rooms)
- Escalation logic with amber banner and badge
- Four view modes: Week, Today, Mine only, Adam's view
- Person filter in week view

### 5. Adam's ADHD Task System
- Week plan: Mon–Sat column layout with effort color coding
- Saturday heavy day with explanatory note
- Sunday rest day (no tasks, permanent)
- Approval flow: pending badge, per-day approval cards with ADHD rationale
- Notification schedule page: 11am/5:30pm/8:30pm with message framing
- Additional alerts: fridge expiry, recipe suggestions, calendar events
- ADHD Rules tab: 7 rules documented

### 6. Vehicle Maintenance Tracker
- Both vehicles: 2016 Toyota Corolla (gas, 134,000 mi) and 2013 Nissan Leaf (EV, 82,500 mi)
- All maintenance items with overdue/due-soon/unknown/ok status
- Progress bars for interval tracking
- Critical flag on high-risk items
- Mark done → logs service, updates status
- Service log tab
- Mileage update form for both cars
- Registration tied to birthday reminder
- Recent services pre-logged: brake pads (Corolla), oil change (128k), balance & rotation (133,900 mi)
- Air filter part numbers recorded

### 7. Home Suggestions Module
- 8 tenant-only suggestions, Georgia/Canton specific
- Urgency levels with color coding (urgent/soon/seasonal/routine)
- Approval / dismiss / snooze actions
- Approved items tracked separately
- Year calendar tab (12 months, June highlighted)

### 8. Calendar Module
- All 9 Google Calendar IDs discovered and mapped:
  Kaylee, Adam, Expenses, Birthdays/Anniversaries, Holidays/Days Off, Pay Day, Places To Be/To Do, Vacation, Holidays in US
- Live data pulled from: Expenses, Pay Day, Places To Be/To Do, Adam, Birthdays/Anniversaries
- Per-calendar color chips with on/off toggle
- Agenda view: chronological, source labels, dollar amounts
- Month view: June 2026 grid with mini event chips
- Money view: cashflow timeline (Expenses + Pay Day only)
- Stats bar: events this week, bills due, next payday, commitments count
- Real events surfaced:
  - Watch Paxton for Scott & Nicole (Jun 19–21)
  - Lynn's Friday Night Dinner (weekly recurring, Fridays 6–8pm)
  - Adam Game Night & Streaming (weekly recurring, Thu 5–8pm)
  - DND Night (weekly recurring, Sun 4–7:30pm)
  - Zac is over (weekly recurring, Mon 5–10pm)
  - Church (weekly recurring, Sun 11am)
  - Watch Sean's Zoo (Jul 3–4)
  - Watch Sean's Doggos (Jul 8)
  - Full Expenses calendar data (subscriptions, bills, annual expenses)
  - Adam Pay Day: Jun 19, Jul 3, Jul 17
  - Kaylee Pay Day: Jun 26, Jul 10

### 9. Documentation Suite
- Master project document (single file): `kaylees-hub-master-project-doc.md`
- `PROJECT_OVERVIEW.md`
- `DATABASE_SCHEMA.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `CURRENT_STATUS.md`

---

## Known Bugs

| ID | Severity | Module | Description | Workaround |
|----|----------|--------|-------------|------------|
| B001 | Medium | Chores | Todoist Tasks calendar (separate from Google Calendar) not surfaced in chores view | Manual cross-reference |
| B002 | Low | Calendar | Google Tasks calendar is a separate API from Google Calendar events — not yet pulled | N/A |
| B003 | Low | Vehicles | Progress bar shows 0% for items with no `lastMiles` even when status is 'overdue' | Status text is still correct |
| B004 | Low | Calendar | Month view doesn't render multi-day events spanning multiple cells correctly | Events show on start date only |
| B005 | Medium | Inventory | Physical barcode scanner integration is keyboard-input only — not tested with an actual scanner | Type barcode manually |
| B006 | High | Chores | Task escalation is based on static mock data — not live Todoist completion dates | Adam's actual completion status not reflected |
| B007 | Medium | Vehicles | Birthday-based registration reminder is UI-only — no Google Calendar event is created | Set a manual reminder |
| B008 | Low | Inventory | Scan-to-use mode requires exact barcode match — typo in barcode input returns "not found" | Type carefully or use physical scanner |

---

## Technical Debt

| ID | Priority | Description |
|----|----------|-------------|
| TD001 | High | All widgets are standalone HTML/JS — needs React component architecture |
| TD002 | High | No persistent storage — all data resets on page reload |
| TD003 | High | Todoist sync is read-only via MCP — needs write-back for task completions |
| TD004 | High | No authentication — both users see everything in prototype |
| TD005 | High | Twilio SMS designed but not implemented |
| TD006 | Medium | Barcode lookup makes direct client-side API calls — needs backend proxy for CORS in production |
| TD007 | Medium | Google Calendar is read-only — needs write access for creating reminders |
| TD008 | Low | Home suggestions are hardcoded — should be database-driven |
| TD009 | Low | Vehicle maintenance intervals are hardcoded — should be configurable |
| TD010 | Low | No error boundaries in widgets — unhandled errors crash the widget silently |

---

## What To Build Next

### Immediate (finish Phase 1)

**1. Budget Module**
Calendar data is already live. Build a dedicated Budget page with:
- Monthly cashflow view (income vs expenses by week)
- Subscription tracker (all recurring subscriptions from Expenses calendar with monthly total)
- Upcoming bills (next 30 days)
- Payday alignment (bills vs payday timing)

Known subscription data is fully captured in the Expenses calendar — see DATABASE_SCHEMA.md section 9 for the full list.

**2. Today's Tasks Combined View**
A single prioritized queue of: today's work tasks (from WGU Outlook, when connected), today's personal calendar items, today's Todoist tasks, and any home tasks that are quick enough to do in a work gap. Work tasks always appear before home tasks. Crossover tasks (quick, doable during work hours) are flagged separately.

**3. Daily Briefing**
A 2–3 minute morning read that generates from: today's calendar events, top priority task, student calls with prep notes, expiring inventory items, upcoming bills/paydays, and any vehicle/home maintenance due. Designed as a read-only summary page that refreshes each morning.

**4. Students Module Prototype**
FERPA-safe student list + GROW model session notes + copy-to-Salesforce flow. All design decisions are documented in PROJECT_OVERVIEW.md section 8 and DATABASE_SCHEMA.md section 8.

### After Phase 1
Begin Phase 2: Supabase project setup, schema implementation, Next.js scaffold. Full details in ROADMAP.md.

---

## Environment Checklist

Before starting a new development session, confirm:

- [ ] Google Calendar MCP is connected (green.kayleet@gmail.com)
- [ ] Todoist MCP is connected (green.kayleet@gmail.com)
- [ ] Microsoft 365 connector is available (WGU Outlook — may need re-auth)
- [ ] All 5 documentation files are in context

---

## People & Contacts Reference

| Person | Role | Email | Phone | Notes |
|--------|------|-------|-------|-------|
| Kaylee Green | Admin / Owner | green.kayleet@gmail.com | — | WGU Student Success Advisor |
| Adam Green | Limited User | adamlamargreen@gmail.com | 470-302-0444 | ADHD + DVT; notifications to this number |

## Home Reference
- Canton, Georgia (Mayridge community)
- 3 bed / 2 bath / 2-car garage / basement
- Renter (not owner) — tenant-only maintenance

## Vehicle Reference
| Vehicle | Miles | Last Service | Next Due |
|---------|-------|-------------|---------|
| 2016 Toyota Corolla | 134,000 | Balance & rotation at 133,900 mi | Oil change due now |
| 2013 Nissan Leaf | 82,500 | No recent services logged | 12V battery critical |

---

*Update this document at the start of each development session. Move completed items to the "What Was Built" section with a date. Keep the "What To Build Next" section current.*
