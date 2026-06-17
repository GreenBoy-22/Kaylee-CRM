# Kaylee's Hub — Master Project Document
**Version:** 1.0  
**Last Updated:** June 17, 2026  
**Project Status:** Active Development  
**Primary Developer:** Claude (Anthropic) in collaboration with Kaylee Green  

> This is a living document. Paste it at the start of any new conversation to resume development with full context. Update the version number and Last Updated date each time it is revised.

---

## Table of Contents

1. [Project Purpose & Goals](#1-project-purpose--goals)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [User Roles & Permissions](#4-user-roles--permissions)
5. [Database Schema](#5-database-schema)
6. [Completed Features](#6-completed-features)
7. [Features In Progress](#7-features-in-progress)
8. [Planned Features](#8-planned-features)
9. [API Integrations](#9-api-integrations)
10. [Business Rules](#10-business-rules)
11. [UI/UX Decisions](#11-uiux-decisions)
12. [Known Bugs & Issues](#12-known-bugs--issues)
13. [Technical Debt](#13-technical-debt)
14. [Development Roadmap](#14-development-roadmap)
15. [Key Decisions & Rationale](#15-key-decisions--rationale)
16. [Environment & Credentials Reference](#16-environment--credentials-reference)

---

## 1. Project Purpose & Goals

### What It Is
Kaylee's Hub is a dual-mode personal CRM and household management system for Kaylee Green (WGU work-from-home advisor) and Adam Green (her husband/household partner). It runs as a web app, toggleable between a **Work mode** (WGU student coaching) and a **Home mode** (household management).

### Core Problem It Solves
Kaylee works from home for WGU as a student success advisor, managing daily coaching calls using the GROW model. Between calls she has downtime that could be used for household tasks. The system bridges both worlds — keeping work and home tasks visible in one place so she can efficiently manage her day without context-switching between multiple apps.

### Primary Goals
- Give Kaylee a single command center for work and home
- Surface the right tasks at the right time based on what mode she's in and what's available in the gaps between calls
- Track household inventory (including for insurance purposes) with barcode scanning support
- Manage Adam's ADHD-friendly task assignments with Kaylee's approval before tasks are sent to him
- Track vehicle maintenance for both cars
- Provide a daily briefing that combines calendar, tasks, student prep, and home items
- Surface home maintenance suggestions proactively (tenant-only, Georgia-specific)
- Unify all 9 Google Calendars plus WGU Outlook into one view

### Non-Goals
- This is NOT a replacement for Salesforce (WGU's official student notes system)
- This does NOT store official student records — FERPA compliance means student data is kept minimal and separate
- This does NOT execute financial transactions — budget tracking is read-only from Google Calendar

---

## 2. Technology Stack

### Current (Prototype Phase)
The project is currently built as a series of **interactive HTML/React widgets** rendered inside Claude.ai artifacts. These are functional prototypes demonstrating the full UX — they are not yet backed by a persistent database.

| Layer | Current | Target |
|-------|---------|--------|
| Frontend | HTML/CSS/JS widgets in Claude artifacts | React (Next.js) |
| Styling | CSS custom properties (Claude design tokens) | Tailwind CSS |
| State | In-memory JavaScript | Zustand or Redux |
| Backend | None yet | Node.js / Next.js API routes |
| Database | None yet | Supabase (PostgreSQL) |
| Auth | None yet | Supabase Auth (two users: Kaylee, Adam) |
| Barcode lookup | Open Food Facts API (live) | Same, add Open Beauty Facts |
| Task management | Todoist MCP (live read/write) | Todoist API via backend |
| Calendar | Google Calendar MCP (live read) | Google Calendar API via backend |
| Notifications | Designed, not yet built | Twilio SMS + push notifications |
| Hosting | None yet | Vercel |

### Icons
Tabler Icons via CDN (`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css`)

### Design Tokens
Using Claude's built-in CSS custom properties:
- `var(--color-background-primary/secondary/tertiary)`
- `var(--color-text-primary/secondary/tertiary)`
- `var(--color-border-primary/secondary/tertiary)`
- `var(--border-radius-md/lg)`
- `var(--font-sans/mono)`

---

## 3. Architecture Overview

### Mode Toggle
The app has two top-level modes toggled from the topbar:
- **Home mode** — Inventory, Recipes, Chores & Tasks, Projects, Home Suggestions, Vehicles, Calendar, Budget
- **Work mode** — Students, Meetings, Emails, Daily Briefing

Both modes share: Today's Tasks (combined view) and Daily Briefing.

### Module Map
```
Kaylee's Hub
├── HOME MODE
│   ├── Inventory          ← barcode scan, room-based, insurance export
│   ├── Recipes            ← based on current inventory (planned)
│   ├── Chores & Tasks     ← Todoist sync, room+day+person split
│   ├── Projects           ← personal/household projects (planned)
│   ├── Home Suggestions   ← proactive tenant maintenance (live)
│   ├── Vehicles           ← Corolla + Leaf maintenance tracker (live)
│   ├── Calendar           ← all 9 Google Calendars unified (live)
│   └── Budget             ← Expenses + PayDay calendars (planned module)
│
├── WORK MODE
│   ├── Students           ← GROW model notes, weekly goals (planned)
│   ├── Meetings           ← calendar-linked prep notes (planned)
│   └── Emails             ← draft email queue from Outlook (planned)
│
├── HOUSEHOLD
│   └── Adam's Tasks       ← ADHD-friendly, Kaylee-approved, notification schedule
│
└── SHARED
    ├── Today's Tasks      ← unified work+home task queue (planned)
    └── Daily Briefing     ← morning overview (planned)
```

### Data Flow (Target Architecture)
```
Google Calendar API ──┐
Todoist API          ──┼──► Next.js API Routes ──► Supabase DB ──► React Frontend
Outlook/M365 API     ──┤                                              │
Open Food Facts API  ──┘                                              │
Twilio SMS                ◄──────────────────────────────────────────┘
                          (notification triggers from backend)
```

---

## 4. User Roles & Permissions

### Kaylee (Admin)
- Full access to all modules in both Home and Work modes
- Can view and edit Adam's task list
- Approves Adam's tasks before they are sent to Todoist
- Sees escalated tasks (Adam's tasks overdue 2+ days) in her own list
- Manages all calendar sources, inventory, vehicles, home suggestions

### Adam (Limited User)
- Sees only his own task list (ADHD-friendly, max 2-3 tasks/day)
- Cannot see Kaylee's work/WGU information
- Cannot see household finances
- Receives notifications via SMS (470-302-0444) and push
- Can mark tasks complete; cannot add or modify task definitions

### Notification Schedule (Adam)
| Time | Channel | Trigger |
|------|---------|---------|
| 11:00 AM | Push notification | Daily recap of his tasks |
| 5:30 PM | Text SMS | Reminder if tasks incomplete when he gets home |
| 8:30–9:00 PM | Text SMS | Wind-down reminder if tasks still incomplete |
| Ad hoc | Text SMS | Fridge items expiring within 2 days |
| Ad hoc | Text SMS | Recipe suggestion on nights he cooks |
| 1 hr before | Text SMS | Any calendar event that involves Adam |

---

## 5. Database Schema

> Note: No live database yet. This schema reflects the intended Supabase/PostgreSQL design based on data structures in the current prototypes.

### users
```sql
id uuid PRIMARY KEY
name text
email text UNIQUE
role text CHECK (role IN ('admin','limited'))
phone text  -- for SMS notifications
todoist_user_id text
created_at timestamptz
```

### inventory_items
```sql
id uuid PRIMARY KEY
name text NOT NULL
brand text
location_id text  -- FK to locations enum
category text
quantity integer DEFAULT 1
expires_date date
purchase_date date
estimated_value numeric
serial_number text
model_number text
barcode text
notes text
created_at timestamptz
updated_at timestamptz
```

### locations (enum/lookup)
```
fridge, pantry-in, pantry-out, backstock,
kitchen, living-room, bedroom, guest-bedroom,
office, bathroom, laundry, library, basement,
garage, outdoor
```

### chore_tasks
```sql
id uuid PRIMARY KEY
name text NOT NULL
assigned_to uuid REFERENCES users(id)
day_of_week text  -- Monday, Tuesday... Daily, Weekend, Monthly
room text
recurrence text
effort_level text CHECK (effort IN ('light','medium','heavy'))
subtasks jsonb  -- array of {id, room, checked}
todoist_task_id text
approved_by uuid REFERENCES users(id)
approved_at timestamptz
status text CHECK (status IN ('pending_approval','approved','sent','completed','escalated'))
escalated_at timestamptz
escalated_to uuid REFERENCES users(id)
created_at timestamptz
```

### vehicle_records
```sql
id uuid PRIMARY KEY
name text  -- '2016 Toyota Corolla'
year integer
make text
model text
type text CHECK (type IN ('gas','ev'))
current_mileage integer
owner_id uuid REFERENCES users(id)
created_at timestamptz
```

### vehicle_maintenance_items
```sql
id uuid PRIMARY KEY
vehicle_id uuid REFERENCES vehicle_records(id)
name text
interval_miles integer
last_service_miles integer
last_service_date date
status text CHECK (status IN ('ok','due-soon','overdue','unknown'))
is_critical boolean DEFAULT false
notes text
```

### vehicle_service_logs
```sql
id uuid PRIMARY KEY
vehicle_id uuid REFERENCES vehicle_records(id)
item_name text
service_date date
mileage_at_service integer
notes text
created_at timestamptz
```

### home_suggestions
```sql
id uuid PRIMARY KEY
name text
why_text text
urgency text CHECK (urgency IN ('urgent','soon','seasonal','routine'))
frequency text
room text
effort_level text
estimated_time text
badges text[]  -- ['urgent','tenant','georgia'] etc
status text CHECK (status IN ('pending','approved','dismissed','snoozed'))
snoozed_until date
approved_at timestamptz
created_at timestamptz
```

### calendar_sources
```sql
id uuid PRIMARY KEY
user_id uuid REFERENCES users(id)
source_name text  -- 'Kaylee', 'Adam', 'Expenses', 'Pay Day' etc
source_type text  -- 'google', 'outlook'
calendar_id text  -- Google Calendar ID or Outlook ID
color_hex text
is_active boolean DEFAULT true
```

### students (FERPA-safe)
```sql
id uuid PRIMARY KEY  -- internal ID only, no student ID numbers
display_name text    -- first name or nickname only
week_goal text
grow_notes text      -- current week GROW conversation notes
last_contact_date date
next_scheduled_date date
notes_copied_to_salesforce boolean DEFAULT false
created_at timestamptz
-- NOTE: No PII beyond first name. Full records live in Salesforce only.
```

---

## 6. Completed Features

### ✅ Core Shell
- Dual-mode toggle (Home/Work) in topbar
- Sidebar navigation with mode-specific sections
- Shared sections (Today's Tasks, Daily Briefing) visible in both modes
- Toast notifications system
- Color-coded design system

### ✅ Household Inventory
- Add items manually
- Scan to add (barcode lookup via Open Food Facts + Open Beauty Facts APIs)
- Auto-fill product name, brand, category from barcode scan
- Scan to use/remove mode (decrement qty or remove item)
- Room/location tagging with session default (scan multiple items to same location)
- All locations: Fridge, Indoor Pantry, Outdoor Pantry, Backstock, Kitchen, Living Room, Bedroom, Guest Bedroom, Office, Bathroom, Laundry Room, Library, Basement, Garage, Outdoor/Yard
- Expiry tracking with color status (green/amber/red)
- Quantity +/− controls
- Category filter
- Room filter tabs (only shows rooms with items)
- Insurance fields: estimated value, purchase date, serial/model number
- List view and By Room card view
- Room detail drill-down with insurance data
- Insurance CSV export (item, brand, room, category, qty, value, serial, purchase date)
- Running estimated total value in stats bar

### ✅ Chores & Tasks (Todoist Integration)
- Live sync from Todoist (House & Daily Life + Gardening + Odds and Ends projects)
- Tasks displayed with day-of-week grouping, section labels, recurrence tags
- Today / All Recurring / One-off / Garden / All tabs
- Section filter pills
- Check off tasks (in-app)
- Expiry/due date color coding
- Awareness of Kaylee's Todoist ID (56441076) and Adam's (56451676)

### ✅ Household Task System (Adam + Kaylee Split)
- Tasks split by person (K/A avatar badges)
- Tasks split by day of week (Mon–Sun + Daily + Monthly)
- Tasks split by room
- Multi-room subtasks (Vacuum → Living Room, Bedroom, Office, Guest Room as separate checkoffs)
- Escalation logic: Adam's tasks overdue 2+ days bubble up to Kaylee's list, shown in amber
- Escalation banner with count
- View switcher: Week view, Today only, Mine only, Adam's view
- Person filter in week view

### ✅ Adam's ADHD Task System
- Week plan view (Mon–Sat columns, Sun always rest day)
- Effort color coding: light (green), medium (amber), heavy (red)
- Heavy day logic: Saturday only; no other tasks added when heavy task present
- Task approval flow: Kaylee reviews → approves → sends to Adam's Todoist
- Approval cards with ADHD rationale notes
- Pending badge count on Approve tab
- Notification schedule documented and displayed (11am push, 5:30pm text, 8:30pm text)
- Additional alerts: fridge expiry, recipe suggestions, calendar events
- ADHD Rules tab documenting all 7 design decisions

### ✅ Home Maintenance Suggestions
- 8 tenant-only suggestions pre-loaded (Georgia/Canton specific)
- Urgency levels: urgent (red), soon (amber), seasonal (green), routine (purple)
- Per-suggestion: why it matters, frequency, room, effort, estimated time
- Actions: Add to my tasks / Remind me later (2-week snooze) / Not applicable (dismiss)
- Approved tab tracking what's been added to task list
- Year calendar tab: 12-month maintenance schedule
- Correctly filtered to tenant-only (no structural, exterior, roof)
- Georgia-specific items flagged (pollen, heat, humidity, pest season)

### ✅ Vehicle Maintenance Tracker
- Two vehicles: 2016 Toyota Corolla (gas, 134,000 mi) and 2013 Nissan Leaf (EV, 82,500 mi)
- All maintenance items with status: overdue / due-soon / unknown / ok
- Critical flag for high-priority items
- Progress bars showing % through service interval
- Mark done → logs service, updates status, removes critical flag
- Add to tasks button
- Service log tab with history
- Mileage update form for both cars
- Registration linked to birthday reminder (both cars in Kaylee's name)
- Recent services logged: brake pads & rotors (Corolla, 2025), oil change (Corolla, 128k mi), tire balance & rotation (Corolla, 133,900 mi)
- Air filter part numbers stored in Expenses calendar (Leaf: Fram CA 10755 engine, CF 11177 cabin; Corolla: CA 10190 engine, CF 10134 cabin)
- Known critical items: Corolla spark plugs (overdue at 134k), transmission fluid (no record), Leaf 12V aux battery (overdue on 12yr old car), Leaf HV battery health

### ✅ Calendar (9 Google Calendars Unified)
- All 9 calendars connected and pulling live data via Google Calendar MCP
- Calendar IDs resolved and mapped to names/colors
- Per-calendar color coding with toggle chips
- Agenda view: chronological timeline with source labels and dollar amounts
- Month view: June 2026 grid with mini event chips
- Money view: Expenses + Pay Day calendars as cashflow timeline
- Stats bar: events this week, bills due, next payday, commitments count
- Real data pulled: Lynn's Friday Night Dinner (recurring weekly), Watch Paxton (Jun 19-21), Watch Sean's Zoo (Jul 3-4), Watch Sean's Doggos (Jul 8), Adam Game Night (recurring Thu), DND Night (recurring Sun), Zac is over (recurring Mon), Church (recurring Sun), all expense subscriptions and bills

---

## 7. Features In Progress

### 🔄 Calendar — Outlook/WGU Integration
- Microsoft 365 connector is available but not yet connected
- Work student calls live in WGU Outlook calendar
- Needs M365 auth with WGU account

### 🔄 Budget Module
- Expenses and Pay Day data is live in Calendar
- Need dedicated Budget page that shows: monthly cashflow, subscription tracker, spending categories, bill calendar
- Known subscriptions from Expenses calendar: Transistor $19, Insurances $325, ChatGPT $20, Car Air Filters $75 (annual), Electric (variable), Rent (Jul 1), Google $10, Acorns $8, Netflix $8, Fortnite $13, Hallmark Ornaments $100 (annual), Apple Care $10, Todoist $7, HBO $3, Student Loan $175, ABC Savings $225, Spotify $17, Loan Payment $1600, Windshield Wipes $50 (annual), Corolla Oil Change $75

---

## 8. Planned Features

### Students Module (Work Mode)
- Student list (FERPA-safe: first name/nickname only, no IDs)
- Weekly GROW model conversation template: What have you been working on? / What do you plan to work on? / What will you do to achieve that goal?
- 4-5 sentence note per conversation
- "Copy to Salesforce" button (one-click copy to clipboard, formatted for paste into Salesforce)
- Weekly goal tracking
- Last contact date, next scheduled date
- Notes explicitly NOT synced to any external system — FERPA compliance

### Meetings Module (Work Mode)
- Calendar-linked meeting prep notes
- For each meeting: who, context, what to walk in knowing, one smart question to ask
- Pulls from both Google Calendar and WGU Outlook

### Daily Briefing
- Morning overview readable in 2-3 minutes
- Pulls: today's calendar events, today's tasks, student calls prep, home reminders, expiring fridge items
- Single most important task of the day
- Flag for energy-draining back-to-back events

### Today's Tasks (Combined View)
- Unified task queue blending work tasks and home tasks
- Priority ordering: work before home
- Home tasks that can be done in background during work (low-effort, quick)
- Gap identification: "You have 20 mins between calls — here's a quick home task"

### Recipes Module
- Based on current inventory
- Prioritizes items expiring soon
- Sends recipe suggestion to Adam on his cook nights via SMS

### Email Drafts (Work Mode)
- Morning draft generation for unread emails needing reply
- Reads full thread for context, checks sent emails for tone matching
- Saves draft to Gmail or Outlook drafts folder
- Flags urgent/sensitive emails with notes

### Projects Module
- Personal and household projects (not recurring chores)
- Project-based items with subtasks
- Not connected to Todoist by default — standalone tracking

### App / Push Notifications
- Mobile app wrapper (PWA or React Native) for push notification support
- Adam's notification schedule: 11am push, 5:30pm SMS, 8:30pm SMS
- Kaylee's escalation alerts when Adam's tasks are overdue

---

## 9. API Integrations

### Currently Connected (via Claude MCP)
| Service | Auth | Used For |
|---------|------|---------|
| Google Calendar | OAuth (Kaylee's Gmail) | Read all 9 calendars |
| Todoist | OAuth | Read/write tasks, projects |
| Microsoft 365 | Not yet connected | WGU Outlook calendar + email |

### External APIs (Direct, No Auth Required)
| API | URL | Used For |
|-----|-----|---------|
| Open Food Facts | `https://world.openfoodfacts.org/api/v0/product/{barcode}.json` | Barcode product lookup (food) |
| Open Beauty Facts | `https://world.openbeautyfacts.org/api/v0/product/{barcode}.json` | Barcode product lookup (personal care) |

### Planned Integrations
| Service | Purpose |
|---------|---------|
| Twilio SMS | Adam's text notifications to 470-302-0444 |
| Supabase | Database + auth |
| Google Calendar write | Create events from CRM (vehicle reminders, home maintenance) |
| Todoist webhook | Real-time task completion detection for escalation logic |

### Google Calendar IDs
| Calendar Name | ID |
|--------------|-----|
| Kaylee (primary) | `green.kayleet@gmail.com` |
| Adam | `33146a4ad40f11483f25d4fae271ef1ef06532572c008029c18e69da90e3edbd@group.calendar.google.com` |
| Expenses | `58eb4a8d76ad2633af565f70af96ab258511fae3b1472068a27e7ad2fb841536@group.calendar.google.com` |
| Birthdays/Anniversaries | `e3261c94eda64e2911b93408332cf15e694d445b353db8fbad96440883957066@group.calendar.google.com` |
| Holidays/Days Off | `ac345917bfef798558fe105ec8252f3898ef371ecd07e84d9e9c9cc00078032f@group.calendar.google.com` |
| Pay Day | `6fbd6f3be7ba1da6844a077497c40b3bd362895be1937d54b8e6e0450fc086cb@group.calendar.google.com` |
| Places To Be/To Do | `e0a98671e25d588d64b6761cf56bb5d86a78068ab08ee9b0299ef11d9952ba6e@group.calendar.google.com` |
| Vacation | `ee75d72ae5b7761bbc10fb62b88848eb628e4887ea0d528f3cf8ee692ba48d3e@group.calendar.google.com` |
| Holidays in US | `en.usa#holiday@group.v.calendar.google.com` |

### Todoist IDs
| Item | ID |
|------|-----|
| Kaylee user ID | `56441076` |
| Adam user ID | `56451676` |
| House & Daily Life project | `6fPG54QMg3wXq9cG` |
| Gardening project | `6gXCQrrRpGh2q3wr` |
| Odds and Ends project | `6fh3FhfJfmM5h7Pj` |

---

## 10. Business Rules

### FERPA Compliance (Students Module)
- Never store student ID numbers, full legal names, SSNs, grades, or enrollment status
- First name or nickname only in the CRM
- GROW notes are Kaylee's coaching notes, not official academic records
- No student data syncs to any external system automatically
- "Copy to Salesforce" is always a manual, intentional action by Kaylee
- If a note feels like it would break FERPA, it doesn't go in the CRM

### Adam's ADHD Task Rules
1. Maximum 2–3 tasks per day
2. No back-to-back tedious/similar tasks
3. Heavy physical tasks (yard work, deep clean) = that day's only task
4. Saturday is the only heavy day; Sunday is always a rest day
5. Quick wins are listed first (dopamine → motivation for bigger task)
6. Large tasks (vacuum, mop) are broken into per-room subtasks
7. Reminders are framed positively, not as repeated guilt/nagging
8. After 2 days of non-completion, tasks escalate silently to Kaylee's list
9. Kaylee must approve all tasks before they are sent to Adam's Todoist
10. DVT awareness: avoid tasks requiring prolonged standing without movement breaks

### Inventory Rules
- Items with qty 0 are automatically removed from inventory
- Scan-to-use mode decrements by 1; at 1 the item is removed entirely
- Barcode lookup tries Open Food Facts first, then Open Beauty Facts
- If barcode not found in either database, manual entry is required
- Room selection is session-sticky — once you pick a location in a session, all subsequent items default to that room until changed
- Insurance export always includes: item name, brand, room, category, qty, estimated value, serial/model, purchase date

### Vehicle Maintenance Rules
- Corolla registration renewal: annual on Kaylee's birthday
- Leaf registration renewal: annual on Kaylee's birthday (same day)
- Mileage must be updated periodically for interval calculations to stay accurate
- Critical items are: Corolla spark plugs, Corolla transmission fluid, Leaf 12V aux battery, Leaf HV battery health
- Service log entry automatically moves item status to "ok" and clears critical flag

### Task Escalation Rules
- Adam's tasks are checked daily
- If a task has not been marked complete in Todoist after 2 days past its due date, it escalates
- Escalated tasks appear in Kaylee's view with an amber left border and "Escalated from Adam" badge
- Escalated tasks are NOT removed from Adam's list — they appear in both views
- Kaylee can complete escalated tasks on Adam's behalf

### Home Suggestions Rules
- Only tenant-responsible items (no structural, roof, exterior, gutters)
- Georgia/Canton climate specific (pollen, humidity, heat, pest season)
- Suggestions are never automatically added to Kaylee's task list — she must approve
- "Not applicable" permanently dismisses a suggestion
- "Remind me later" snoozes for 2 weeks
- Suggestions resurface based on seasonality (e.g. HVAC filter resurfaces every 1-2 months in spring)

---

## 11. UI/UX Decisions

### Design System
- Uses Claude.ai's built-in CSS custom properties for all colors, typography, and radius
- This means the app automatically respects light/dark mode
- No hardcoded color values except for calendar source colors and status indicators
- Purple (`#534AB7` / `#EEEDFE`) is the primary brand accent throughout
- Green (`#0F6E56`) is used for Adam's color scheme to differentiate from Kaylee's purple

### Navigation Pattern
- Fixed sidebar with mode-specific sections
- Toggle in topbar is the primary mode switch — not a page navigation
- "Home mode" and "Work mode" are different contexts, not different pages
- Shared modules (Today's Tasks, Daily Briefing) are always visible in sidebar regardless of mode

### Status Color System
| Status | Color | Used In |
|--------|-------|---------|
| Overdue / Urgent | Red (`#A32D2D`) | Vehicle maintenance, task escalation, expiry |
| Due soon / Warning | Amber (`#854F0B`) | Vehicle, inventory expiry, task reminders |
| OK / Success | Green (`#0F6E56`) | Completed items, up-to-date maintenance |
| Unknown / No record | Gray | Vehicle maintenance with no service history |
| Today | Purple (`#534AB7`) | Calendar today highlight, active nav |

### Adam vs Kaylee Visual Distinction
- Kaylee: purple avatar "K", purple accent
- Adam: green avatar "A", green accent
- Every task in the household view shows an avatar badge so you never lose track of whose it is

### Calendar Color Coding
Each of the 9 Google Calendars has a distinct color — see the Calendar IDs table in Section 9. Toggle chips use the calendar's background/text colors for accessibility.

### Barcode Lookup UX
- Lookup box appears at the TOP of the add-item form (before location selection)
- Spinner shows during API call
- Product image + name + brand shown in a "found" card
- "Use this" button auto-fills the form — user still confirms before saving
- If not found, gracefully falls back to manual entry with no dead ends

### Mobile Considerations
- All widgets built with `overflow-x: auto` where needed
- Grid layouts use `minmax(0, 1fr)` to prevent overflow
- Touch targets minimum 36px
- Toast notifications appear at bottom center

---

## 12. Known Bugs & Issues

| ID | Description | Severity | Module | Status |
|----|-------------|----------|--------|--------|
| B001 | Todoist Tasks calendar not yet surfaced in chores view | Medium | Chores | Open |
| B002 | Google Tasks calendar not pulled (separate from Google Calendar events) | Low | Calendar | Open |
| B003 | Vehicle progress bar shows 0% for items with no lastMiles even if overdue | Low | Vehicles | Open |
| B004 | Month view doesn't handle multi-day events spanning cells | Low | Calendar | Open |
| B005 | Barcode scanner in prototype requires keyboard input; physical scanner integration not yet tested | Medium | Inventory | Open |
| B006 | Adam's task escalation is based on static mock data in prototype, not live Todoist completion dates | High | Chores | Open |
| B007 | Registration birthday reminder in vehicles is UI-only; no actual Google Calendar event created yet | Medium | Vehicles | Open |
| B008 | Scan-to-use mode requires exact barcode match — no fuzzy matching if barcode entered with typo | Low | Inventory | Open |

---

## 13. Technical Debt

| Item | Description | Priority |
|------|-------------|----------|
| TD001 | All widgets are standalone HTML/JS with no shared state — needs proper React component architecture | High |
| TD002 | No persistent storage yet — all data resets on page reload | High |
| TD003 | Todoist sync is read-only via MCP; needs write-back for task completion syncing | High |
| TD004 | Google Calendar is read-only via MCP; needs write access for creating reminders/events | Medium |
| TD005 | No authentication layer — both users see everything | High |
| TD006 | Barcode lookup makes direct client-side API calls; should be proxied through backend to avoid CORS issues in production | Medium |
| TD007 | Home suggestions are hardcoded; should be a database-driven rules engine | Low |
| TD008 | Vehicle maintenance intervals are hardcoded; should be configurable per vehicle | Low |
| TD009 | Twilio SMS integration is designed but not implemented | High (for Adam's notifications) |
| TD010 | No error boundary handling in widgets | Low |

---

## 14. Development Roadmap

### Phase 1 — Foundation (Current)
✅ Prototype all core modules as interactive widgets  
✅ Validate UX and information architecture  
✅ Connect live data sources (Google Calendar, Todoist)  
🔄 Connect WGU Outlook calendar  
🔄 Build Budget module  

### Phase 2 — Backend & Persistence
- Set up Supabase project (database + auth)
- Migrate all widget data structures to Supabase schema
- Build Next.js app with API routes
- Implement two-user auth (Kaylee admin, Adam limited)
- Persist inventory, tasks, vehicle logs, home suggestions to database

### Phase 3 — Student Module
- FERPA-compliant student list
- GROW model note-taking template
- "Copy to Salesforce" clipboard flow
- Weekly goal tracking

### Phase 4 — Notifications
- Twilio SMS integration for Adam
- Push notification setup (PWA service worker)
- Daily briefing generator (scheduled job)
- Fridge expiry alert automation

### Phase 5 — Intelligence Layer
- Recipe matching from inventory
- ADHD task auto-suggestion engine (suggests tasks for Kaylee to approve)
- Daily briefing AI generation (student prep notes, smart question, energy flag)
- Email draft generation (tone-matching from sent history)

### Phase 6 — Mobile
- Progressive Web App (PWA) packaging
- Mobile-optimized layouts
- Native barcode camera scanning (replace keyboard input)
- Adam's standalone mobile view (limited to his tasks only)

---

## 15. Key Decisions & Rationale

### Decision: Two separate Google accounts not used — one Google account with 9 calendars
**Rationale:** Kaylee organizes everything in one Gmail account using calendar categories as organizational layers (budget tracking, subscriptions, family commitments, etc.). Rather than fighting this system, we read all 9 calendars and surface them unified with color-coding and toggle filters.

### Decision: Salesforce is NOT integrated — copy-paste workflow for student notes
**Rationale:** Kaylee's employer (WGU) would not permit direct Salesforce API integration from a personal app. The CRM mirrors what would go into Salesforce (GROW notes, goals) so Kaylee can write once in a familiar interface, then copy to Salesforce. No student data ever leaves the CRM automatically.

### Decision: Adam's tasks require Kaylee's approval before going to Todoist
**Rationale:** Adam has ADHD and DVT. He needs a carefully curated, low-friction task list that respects his capacity. Kaylee — who understands his energy levels, what he has going on that week, and the ADHD-friendly design rules — is the right person to approve what goes on his list. The system proposes; Kaylee approves; Adam executes.

### Decision: Sunday is always a rest day for Adam, no exceptions
**Rationale:** ADHD recovery needs built-in downtime. Without a guaranteed rest day, Sunday becomes an overflow day for Saturday's incomplete tasks, which creates a pressure cycle that worsens ADHD symptoms. Sunday being sacred means Adam always has a day to decompress.

### Decision: Tenant-only home maintenance suggestions, not full homeowner list
**Rationale:** Kaylee and Adam rent their townhouse. Surfacing suggestions about roof, gutters, foundation, or exterior would be irrelevant and potentially confusing — those are landlord responsibilities. The suggestion engine is explicitly filtered to only things a tenant in Georgia would be responsible for.

### Decision: Inventory uses Open Food Facts + Open Beauty Facts (free APIs) not paid barcode services
**Rationale:** The majority of what Kaylee is scanning is grocery and personal care items, which are covered comprehensively by these two free, open databases. For high-value insurance items (electronics, furniture, appliances) she enters manually anyway since serial numbers matter more than product names.

### Decision: Barcode scanner integration is keyboard-input based (not camera)
**Rationale:** Physical USB/Bluetooth barcode scanners emit their output as keyboard text followed by Enter — exactly like typing. This means a physical scanner "just works" with a text input field with no special camera API integration required in the browser.

### Decision: Vacuum, mop, sweep are broken into per-room subtasks
**Rationale:** These are the tasks most likely to be started and not finished, especially with ADHD. By breaking them into per-room checkoffs, partial progress is tracked and rewarded rather than the task appearing as entirely incomplete. "I vacuumed the living room" is a win even if the bedroom didn't happen.

### Decision: Expenses calendar is the source of truth for subscriptions and bills
**Rationale:** Kaylee already maintains a meticulous Expenses Google Calendar with every subscription and bill mapped as a recurring event, including amounts. Rather than rebuilding this in a new system, we read that calendar as the budget data source. This means the budget module will always be current because Kaylee already maintains it.

---

## 16. Environment & Credentials Reference

> ⚠️ Never store actual passwords or API keys here. This section is for non-sensitive reference only.

### People
| Person | Role | Email | Phone | Todoist ID |
|--------|------|-------|-------|------------|
| Kaylee Green | Admin / Owner | green.kayleet@gmail.com | — | 56441076 |
| Adam Green | Limited User | adamlamargreen@gmail.com | 470-302-0444 | 56451676 |

### Home
- Address context: Mayridge townhouse, Canton, Georgia 30114
- Type: 3 bed / 2 bath / 2-car garage / basement
- Tenure: Renter (not owner)

### Vehicles
| Vehicle | Year | Make | Model | Type | Current Miles | Notes |
|---------|------|------|-------|------|--------------|-------|
| Corolla | 2016 | Toyota | Corolla | Gas | 134,000 | Registration on Kaylee's birthday |
| Leaf | 2013 | Nissan | Leaf | EV | 82,500 | Registration on Kaylee's birthday; 12V aux battery critical |

### Connected Services (as of June 2026)
| Service | Status | Account |
|---------|--------|---------|
| Google Calendar | ✅ Connected | green.kayleet@gmail.com |
| Todoist | ✅ Connected | green.kayleet@gmail.com |
| Microsoft 365 / Outlook | ❌ Not connected | WGU work account |
| Twilio SMS | ❌ Not configured | — |
| Supabase | ❌ Not set up | — |

---

*End of document. To resume development: paste this entire document at the start of a new Claude conversation, describe what you'd like to build next, and development can continue with full context.*

**Document version history:**
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | June 17, 2026 | Initial document created from full project conversation |
