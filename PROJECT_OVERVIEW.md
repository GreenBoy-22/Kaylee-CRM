# DATABASE_SCHEMA.md
**Kaylee's Hub — Database Schema**

| Field | Value |
|-------|-------|
| Database | Supabase (PostgreSQL) |
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Status | Designed — not yet implemented |

> This schema is derived from the data structures used in the working prototypes. It reflects the intended production database design. No Supabase project has been created yet as of this document version.

---

## Table of Contents

1. [Schema Overview](#1-schema-overview)
2. [Authentication & Users](#2-authentication--users)
3. [Inventory](#3-inventory)
4. [Chores & Tasks](#4-chores--tasks)
5. [Vehicles](#5-vehicles)
6. [Home Suggestions](#6-home-suggestions)
7. [Calendar Sources](#7-calendar-sources)
8. [Students (FERPA-safe)](#8-students-ferpa-safe)
9. [Budget & Expenses Cache](#9-budget--expenses-cache)
10. [Notifications](#10-notifications)
11. [Enums & Lookup Values](#11-enums--lookup-values)
12. [Row Level Security (RLS) Policies](#12-row-level-security-rls-policies)
13. [Indexes](#13-indexes)
14. [Migration Notes](#14-migration-notes)

---

## 1. Schema Overview

```
users
  └── inventory_items
  └── chore_tasks
        └── chore_subtasks
  └── vehicle_records
        └── vehicle_maintenance_items
        └── vehicle_service_logs
  └── home_suggestions
  └── calendar_sources
  └── students
        └── student_sessions
  └── budget_events_cache
  └── notification_log
```

All tables use `uuid` primary keys. All tables include `created_at timestamptz` and most include `updated_at timestamptz`. Soft deletes are used throughout (`deleted_at timestamptz`) to preserve history.

---

## 2. Authentication & Users

### users
Extends Supabase Auth's built-in `auth.users` table via a public profile.

```sql
CREATE TABLE public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text UNIQUE NOT NULL,
  role          text NOT NULL DEFAULT 'limited'
                  CHECK (role IN ('admin', 'limited')),
  phone         text,           -- used for SMS notifications
  todoist_id    text,           -- Todoist user ID
  avatar_color  text,           -- 'purple' (Kaylee) or 'green' (Adam)
  timezone      text DEFAULT 'America/New_York',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**Seed data:**
```sql
-- Kaylee: id matches her Supabase auth UUID, set at signup
-- role = 'admin', todoist_id = '56441076', avatar_color = 'purple'

-- Adam: id matches his Supabase auth UUID, set at signup
-- role = 'limited', todoist_id = '56451676', avatar_color = 'green', phone = '4703020444'
```

---

## 3. Inventory

### inventory_locations (lookup)
```sql
CREATE TABLE public.inventory_locations (
  id            text PRIMARY KEY,   -- e.g. 'fridge', 'pantry-in'
  label         text NOT NULL,      -- e.g. 'Fridge', 'Indoor Pantry'
  icon          text,               -- Tabler icon name e.g. 'ti-snowflake'
  is_storage    boolean DEFAULT false,  -- true = food/supply storage
  sort_order    integer
);
```

**Seed values:**
```sql
('fridge',        'Fridge',           'ti-snowflake',    true,  1),
('pantry-in',     'Indoor Pantry',    'ti-box',          true,  2),
('pantry-out',    'Outdoor Pantry',   'ti-box',          true,  3),
('backstock',     'Backstock',        'ti-archive',      true,  4),
('kitchen',       'Kitchen',          'ti-chef-hat',     false, 5),
('living-room',   'Living Room',      'ti-sofa',         false, 6),
('bedroom',       'Bedroom',          'ti-bed',          false, 7),
('guest-bedroom', 'Guest Bedroom',    'ti-bed',          false, 8),
('office',        'Office',           'ti-device-laptop',false, 9),
('bathroom',      'Bathroom',         'ti-droplet',      false, 10),
('laundry',       'Laundry Room',     'ti-wash',         false, 11),
('library',       'Library',          'ti-books',        false, 12),
('basement',      'Basement',         'ti-stairs-down',  false, 13),
('garage',        'Garage',           'ti-car',          false, 14),
('outdoor',       'Outdoor / Yard',   'ti-plant',        false, 15)
```

### inventory_items
```sql
CREATE TABLE public.inventory_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  brand             text,
  location_id       text REFERENCES inventory_locations(id),
  category          text,           -- see enum in Section 11
  quantity          integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  expires_date      date,
  purchase_date     date,
  estimated_value   numeric(10,2),  -- for insurance export
  serial_number     text,
  model_number      text,
  barcode           text,
  notes             text,
  image_url         text,           -- from barcode lookup API
  source            text DEFAULT 'manual'
                      CHECK (source IN ('manual', 'barcode_scan')),
  created_by        uuid REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz     -- soft delete
);

CREATE INDEX idx_inventory_location ON inventory_items(location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_barcode  ON inventory_items(barcode)     WHERE barcode IS NOT NULL;
CREATE INDEX idx_inventory_expiry   ON inventory_items(expires_date) WHERE expires_date IS NOT NULL;
```

**Business rules enforced in application layer:**
- When `quantity` reaches 0, set `deleted_at = now()` (soft delete)
- Barcode lookup: try Open Food Facts first, then Open Beauty Facts
- If barcode found, set `source = 'barcode_scan'` and populate `image_url`, `brand`, `category`

---

## 4. Chores & Tasks

### chore_tasks
```sql
CREATE TABLE public.chore_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  assigned_to         uuid REFERENCES public.users(id),
  day_of_week         text NOT NULL,   -- 'Daily','Monday'...'Sunday','Weekend','Monthly'
  room                text,            -- free text room name
  recurrence          text,            -- human-readable e.g. 'every Mon at 9am'
  effort_level        text DEFAULT 'light'
                        CHECK (effort_level IN ('light', 'medium', 'heavy')),
  estimated_minutes   integer,
  todoist_task_id     text,            -- ID in Todoist after approval + send
  todoist_section     text,            -- Section name in Todoist
  approved_by         uuid REFERENCES public.users(id),
  approved_at         timestamptz,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft',            -- system-generated, not yet reviewed
                          'pending_approval', -- awaiting Kaylee review
                          'approved',         -- Kaylee approved, not yet sent
                          'sent',             -- sent to Adam's Todoist
                          'completed',        -- marked done in Todoist
                          'escalated',        -- overdue 2+ days, added to Kaylee's list
                          'skipped'           -- Kaylee chose to skip this day
                        )),
  escalated_at        timestamptz,
  escalated_to        uuid REFERENCES public.users(id),
  last_completed_at   timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
```

### chore_subtasks
For tasks that are split by room (vacuum, mop, sweep).

```sql
CREATE TABLE public.chore_subtasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES chore_tasks(id) ON DELETE CASCADE,
  room        text NOT NULL,        -- e.g. 'Living room', 'Bedroom'
  sort_order  integer DEFAULT 0,
  completed   boolean DEFAULT false,
  completed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Business rules:**
- A task with `subtasks` is only marked complete when all subtasks are checked
- If all subtasks are completed, parent task `status` → `'completed'`
- Escalation check runs daily at midnight: any task with `status = 'sent'` and `approved_at < now() - interval '2 days'` is escalated
- Only tasks assigned to Adam (`assigned_to = adam_user_id`) can be escalated
- Adam can never have more than 3 tasks with `status IN ('sent', 'approved')` on any given `day_of_week`
- Heavy tasks: if any task for a given day has `effort_level = 'heavy'`, no other tasks are added to that day

---

## 5. Vehicles

### vehicle_records
```sql
CREATE TABLE public.vehicle_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year              integer NOT NULL,
  make              text NOT NULL,
  model             text NOT NULL,
  trim              text,
  type              text NOT NULL CHECK (type IN ('gas', 'ev', 'hybrid')),
  color             text,
  current_mileage   integer NOT NULL DEFAULT 0,
  owner_id          uuid REFERENCES public.users(id),
  registration_renewal_month  integer,   -- month number (1-12)
  registration_renewal_day    integer,   -- day of month
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

**Seed data:**
```sql
-- 2016 Toyota Corolla: gas, 134000 miles, owner = Kaylee
-- registration_renewal_month/day = Kaylee's birthday month/day (to be set)

-- 2013 Nissan Leaf: ev, 82500 miles, owner = Kaylee  
-- registration_renewal_month/day = same as Corolla
```

### vehicle_maintenance_items
```sql
CREATE TABLE public.vehicle_maintenance_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid NOT NULL REFERENCES vehicle_records(id) ON DELETE CASCADE,
  name              text NOT NULL,
  category          text,           -- 'fluid','filter','tire','belt','battery','inspection','registration'
  interval_miles    integer,        -- null = not mileage-based
  interval_months   integer,        -- null = not time-based
  last_service_miles     integer,
  last_service_date      date,
  status            text NOT NULL DEFAULT 'unknown'
                      CHECK (status IN ('ok', 'due-soon', 'overdue', 'unknown')),
  is_critical       boolean DEFAULT false,
  notes             text,           -- specific advice for this car/item
  icon              text,           -- Tabler icon name
  icon_bg           text,           -- background color hex
  icon_color        text,           -- icon color hex
  sort_order        integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

**Status calculation (application layer):**
```
if last_service_miles IS NULL AND last_service_date IS NULL → 'unknown'
if miles_since_last >= interval_miles → 'overdue'
if miles_since_last >= (interval_miles * 0.9) → 'due-soon'
else → 'ok'
Time-based: same logic with months instead of miles
```

**Known critical items (seed data):**
| Vehicle | Item | Reason |
|---------|------|--------|
| Corolla | Spark plugs | Iridium plugs due at 120k; currently 134k, no record |
| Corolla | Transmission fluid | No record ever; 134k miles |
| Corolla | Serpentine belt inspection | No record; should inspect every oil change after 100k |
| Leaf | 12V auxiliary battery | 2013 car, 12+ years old; typical lifespan 3-5 years |
| Leaf | HV battery health check | Georgia heat accelerates capacity degradation |

### vehicle_service_logs
```sql
CREATE TABLE public.vehicle_service_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        uuid NOT NULL REFERENCES vehicle_records(id) ON DELETE CASCADE,
  maintenance_item_id uuid REFERENCES vehicle_maintenance_items(id),
  service_name      text NOT NULL,  -- denormalized for display
  service_date      date NOT NULL,
  mileage_at_service integer,
  cost              numeric(10,2),
  shop_name         text,
  notes             text,
  logged_by         uuid REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

**Existing logs (from conversation — to be seeded):**
| Vehicle | Item | Date | Miles | Notes |
|---------|------|------|-------|-------|
| Corolla | Oil change | ~Early 2026 | 128,000 | Estimated |
| Corolla | Tire balance & rotation | June 2026 | 133,900 | Just done — 100 miles ago |
| Corolla | Brake pads & rotors | 2025 (approx) | Unknown | Done last year |

**Air filter part numbers (stored in notes):**
- Leaf engine filter: Fram CA 10755
- Leaf cabin filter: Fram CF 11177
- Corolla engine filter: Fram CA 10190
- Corolla cabin filter: Fram CF 10134
- Windshield wipers: RainX 820147 — 26" and 16"

---

## 6. Home Suggestions

### home_suggestions
```sql
CREATE TABLE public.home_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  why_text        text NOT NULL,    -- plain-English explanation for display
  urgency         text NOT NULL
                    CHECK (urgency IN ('urgent', 'soon', 'seasonal', 'routine')),
  frequency       text,             -- human-readable e.g. 'Every 1-2 months (spring)'
  room            text,
  effort_level    text CHECK (effort_level IN ('light', 'medium', 'heavy')),
  estimated_time  text,             -- e.g. '5 min', '30-60 min'
  badges          text[],           -- ['urgent','tenant','georgia','annual','seasonal']
  icon            text,             -- Tabler icon name
  icon_bg         text,
  icon_color      text,
  is_tenant_only  boolean DEFAULT true,
  is_georgia_specific boolean DEFAULT false,
  applies_month   integer[],        -- months this is relevant (1=Jan, 6=Jun etc)
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'dismissed', 'snoozed')),
  snoozed_until   date,
  approved_at     timestamptz,
  added_to_tasks  boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Surfacing logic (application layer):**
- Show if `status = 'pending'`
- Show snoozed items when `snoozed_until <= current_date`
- Order by urgency: urgent → soon → seasonal → routine
- Filter to current month via `applies_month @> ARRAY[EXTRACT(MONTH FROM NOW())::int]`

---

## 7. Calendar Sources

### calendar_sources
Stores metadata about each connected calendar. Actual events are NOT stored in the database — they are fetched live from Google Calendar / Outlook APIs on demand.

```sql
CREATE TABLE public.calendar_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users(id),
  name            text NOT NULL,      -- display name e.g. 'Expenses'
  source_type     text NOT NULL CHECK (source_type IN ('google', 'outlook')),
  external_id     text NOT NULL,      -- Google Calendar ID or Outlook calendar ID
  color_hex       text,               -- for display in unified calendar view
  color_bg        text,               -- background color for event chips
  color_text      text,               -- text color for event chips
  is_active       boolean DEFAULT true,
  sort_order      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Seed data (all Kaylee's Google calendars):**

| name | external_id (abbreviated) | color_hex |
|------|--------------------------|-----------|
| Kaylee | green.kayleet@gmail.com | #534AB7 |
| Adam | 33146a4a...edbd | #0F6E56 |
| Expenses | 58eb4a8d...36 | #A32D2D |
| Birthdays/Anniversaries | e3261c94...66 | #D4537E |
| Holidays/Days Off | ac345917...2f | #378ADD |
| Pay Day | 6fbd6f3b...cb | #1D9E75 |
| Places To Be/To Do | e0a98671...6e | #854F0B |
| Vacation | ee75d72a...3e | #7A5AF0 |
| Holidays in US | en.usa#holiday... | #888888 |

---

## 8. Students (FERPA-safe)

> ⚠️ FERPA NOTICE: This table intentionally stores minimal information. No student IDs, legal names, grades, or enrollment data. Official records live in Salesforce only.

### students
```sql
CREATE TABLE public.students (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name          text NOT NULL,   -- first name or nickname ONLY
  is_active             boolean DEFAULT true,
  last_contact_date     date,
  next_scheduled_date   date,
  notes_in_salesforce   boolean DEFAULT false,  -- reminder flag only
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz      -- soft delete
);
```

### student_sessions
One row per coaching conversation. This is Kaylee's coaching notepad — NOT an academic record.

```sql
CREATE TABLE public.student_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_date      date NOT NULL DEFAULT CURRENT_DATE,

  -- GROW Model fields
  grow_goal         text,    -- What have you been working on?
  grow_reality      text,    -- What is the current situation?
  grow_options      text,    -- What will you do to achieve that goal?
  grow_will         text,    -- What are you committed to?

  weekly_goal       text,    -- The goal set for next week
  notes             text,    -- Additional coaching notes (max ~5 sentences)

  copied_to_salesforce      boolean DEFAULT false,
  copied_to_salesforce_at   timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

**Application rules:**
- `notes` field should be kept to 4-5 sentences maximum (UI enforced with character guidance)
- "Copy to Salesforce" copies a formatted string to clipboard — no API call is made
- Format copied: `[Date] - [Goal]: [grow_will] | Notes: [notes]`
- `copied_to_salesforce` is set to `true` only by explicit user action, never automatically

---

## 9. Budget & Expenses Cache

Actual expense data lives in the Expenses and Pay Day Google Calendars. This table caches that data locally to avoid re-fetching on every page load and to enable analytics.

```sql
CREATE TABLE public.budget_events_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_source_id uuid REFERENCES public.calendar_sources(id),
  external_event_id  text NOT NULL,    -- Google Calendar event ID
  title           text NOT NULL,
  event_date      date NOT NULL,
  amount          numeric(10,2),       -- null if not a fixed amount
  category        text,               -- 'subscription','bill','income','savings','vehicle','annual'
  is_income       boolean DEFAULT false,
  is_recurring    boolean DEFAULT false,
  recurrence_rule text,               -- RRULE string if recurring
  notes           text,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_budget_cache_event ON budget_events_cache(external_event_id);
CREATE INDEX idx_budget_cache_date ON budget_events_cache(event_date);
```

**Known recurring expenses (to be seeded from Expenses calendar):**
| Title | Amount | Day | Category |
|-------|--------|-----|---------|
| Transistor | $19 | 17th | Subscription |
| Insurances | $325 | 20th | Bill |
| ChatGPT | $20 | 23rd | Subscription |
| Electric | Variable | 1st | Bill |
| RENT IS DUE | Variable | 1st | Bill |
| Google | $10 | 2nd | Subscription |
| Acorns | $8 | 2nd | Savings |
| Netflix | $8 | 2nd | Subscription |
| Fortnite | $13 | 2nd | Subscription |
| Apple Care | $10 | 4th | Subscription |
| Todoist | $7 | 5th | Subscription |
| HBO | $3 | 5th | Subscription |
| Student Loan | $175 | 9th | Bill |
| ABC Savings | $225 | 10th | Savings |
| Spotify | $17 | 10th | Subscription |
| Loan Payment | $1,600 | 16th | Bill |
| Corolla Oil Change | $75 | Annual | Vehicle |
| Car Air Filters | $75 | Annual | Vehicle |
| Hallmark Ornaments | $100 | Annual (Jul) | Personal |
| Windshield Wipes | $50 | Annual | Vehicle |

---

## 10. Notifications

### notification_log
Tracks all notifications sent to Adam so we can enforce the schedule and avoid duplicates.

```sql
CREATE TABLE public.notification_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid NOT NULL REFERENCES public.users(id),
  channel         text NOT NULL CHECK (channel IN ('sms', 'push', 'email')),
  type            text NOT NULL,  -- 'daily_recap','evening_reminder','winddown',
                                  --  'expiry_alert','recipe_suggestion','calendar_reminder'
  content         text,           -- the message body sent
  related_task_id uuid REFERENCES chore_tasks(id),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivery_status text DEFAULT 'sent' CHECK (delivery_status IN ('sent','delivered','failed')),
  twilio_sid      text            -- Twilio message SID for delivery tracking
);

CREATE INDEX idx_notif_recipient_date ON notification_log(recipient_id, sent_at DESC);
```

**Scheduled notification rules (implemented as backend cron jobs):**
| Time (ET) | Type | Channel | Condition |
|-----------|------|---------|-----------|
| 11:00 AM | daily_recap | Push | Always, on days Adam has tasks |
| 5:30 PM | evening_reminder | SMS | Tasks still incomplete |
| 8:30–9:00 PM | winddown | SMS | Tasks still incomplete |
| Ad hoc | expiry_alert | SMS | Inventory item expires within 2 days |
| Adam's cook nights | recipe_suggestion | SMS | Adam has 'Make dinner' task |
| 1hr before event | calendar_reminder | SMS | Any event on Adam's calendar |

---

## 11. Enums & Lookup Values

### Inventory Categories
```
'Food & groceries'
'Electronics'
'Furniture'
'Clothing'
'Appliances'
'Tools'
'Cleaning'
'Personal care'
'Other'
```

### Task Day of Week Values
```
'Daily'     -- appears every day
'Monday'
'Tuesday'
'Wednesday'
'Thursday'
'Friday'
'Saturday'
'Sunday'
'Weekend'   -- Saturday + Sunday
'Monthly'   -- once per month, specific date set separately
```

### Effort Levels
```
'light'    -- under 20 minutes, low cognitive load
'medium'   -- 20-45 minutes, moderate focus required
'heavy'    -- 45+ minutes OR physically demanding; counts as full day for Adam
```

### Home Suggestion Badges
```
'urgent'     -- needs attention now
'soon'       -- within 30 days
'seasonal'   -- current season
'routine'    -- ongoing regular task
'tenant'     -- tenant responsibility (not landlord)
'georgia'    -- Georgia / Canton climate specific
'annual'     -- once per year
```

### Vehicle Maintenance Categories
```
'fluid'        -- oil, coolant, brake fluid, transmission fluid
'filter'       -- air filter, cabin filter, fuel filter
'tire'         -- rotation, balance, replacement
'belt'         -- serpentine, timing belt
'battery'      -- 12V, HV pack
'brake'        -- pads, rotors, fluid
'inspection'   -- visual checks, safety inspections
'electrical'   -- spark plugs, wiring
'registration' -- annual registration renewal
'other'
```

---

## 12. Row Level Security (RLS) Policies

Supabase RLS ensures each user only sees their own data. All tables have RLS enabled.

### General pattern
```sql
-- Kaylee (admin) sees everything
CREATE POLICY "admin_full_access" ON {table}
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Adam (limited) sees only his assigned records
CREATE POLICY "adam_own_tasks" ON public.chore_tasks
  USING (
    assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'limited')
  );
```

### Table-specific notes
| Table | Kaylee | Adam |
|-------|--------|------|
| users | Read own row | Read own row |
| inventory_items | Full CRUD | No access |
| chore_tasks | Full CRUD | Read own tasks, update status only |
| chore_subtasks | Full CRUD | Update completed only (own tasks) |
| vehicle_records | Full CRUD | No access |
| vehicle_maintenance_items | Full CRUD | No access |
| vehicle_service_logs | Full CRUD | No access |
| home_suggestions | Full CRUD | No access |
| calendar_sources | Full CRUD | No access |
| students | Full CRUD | No access |
| student_sessions | Full CRUD | No access |
| budget_events_cache | Read only | No access |
| notification_log | Read all | Read own |

---

## 13. Indexes

```sql
-- Inventory
CREATE INDEX idx_inventory_location  ON inventory_items(location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_barcode   ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_inventory_expiry    ON inventory_items(expires_date) WHERE expires_date IS NOT NULL;
CREATE INDEX idx_inventory_category  ON inventory_items(category);

-- Tasks
CREATE INDEX idx_tasks_assigned      ON chore_tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status        ON chore_tasks(status);
CREATE INDEX idx_tasks_day           ON chore_tasks(day_of_week);
CREATE INDEX idx_tasks_todoist       ON chore_tasks(todoist_task_id) WHERE todoist_task_id IS NOT NULL;

-- Vehicles
CREATE INDEX idx_maint_vehicle       ON vehicle_maintenance_items(vehicle_id);
CREATE INDEX idx_maint_status        ON vehicle_maintenance_items(status);
CREATE INDEX idx_logs_vehicle        ON vehicle_service_logs(vehicle_id);
CREATE INDEX idx_logs_date           ON vehicle_service_logs(service_date DESC);

-- Notifications
CREATE INDEX idx_notif_recipient     ON notification_log(recipient_id, sent_at DESC);
CREATE INDEX idx_notif_type_date     ON notification_log(type, sent_at DESC);

-- Budget
CREATE UNIQUE INDEX idx_budget_event ON budget_events_cache(external_event_id);
CREATE INDEX idx_budget_date         ON budget_events_cache(event_date);

-- Students
CREATE INDEX idx_sessions_student    ON student_sessions(student_id, session_date DESC);
```

---

## 14. Migration Notes

When implementing this schema in Supabase:

1. **Create the schema in order**: users → locations lookup → inventory → tasks → vehicles → suggestions → calendars → students → budget_cache → notifications

2. **Enable RLS on all tables immediately** — do not leave any table without RLS even temporarily

3. **Seed data before first use**: inventory_locations, vehicle_records with both cars, known maintenance items with their history, home suggestions

4. **Todoist sync**: The initial task sync should read from Todoist's API and populate `chore_tasks` with existing recurring tasks. Set `todoist_task_id` for each. The `status` should be set based on Todoist's completion state.

5. **Calendar sources**: Seed all 9 Google Calendar IDs from the table in PROJECT_OVERVIEW.md. Do not fetch events into the database — fetch live per-request.

6. **Budget cache**: Seed from the Expenses and Pay Day calendar data. Set up a daily cron job to refresh `budget_events_cache` from Google Calendar API.

7. **Supabase Edge Functions needed**:
   - `check-escalations` — runs nightly, escalates overdue Adam tasks
   - `send-adam-notifications` — runs at 11am, 5:30pm, 8:30pm ET
   - `check-expiry-alerts` — runs daily, checks inventory for items expiring in 2 days
   - `refresh-budget-cache` — runs nightly, syncs Expenses/PayDay calendars
   - `send-registration-reminders` — runs annually, 30 days before Kaylee's birthday

---

*See `ARCHITECTURE.md` for how these tables connect to the application layer.*
*See `CURRENT_STATUS.md` for implementation progress.*
