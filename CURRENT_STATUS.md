# ARCHITECTURE.md
**Kaylee's Hub — System Architecture**

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Status | Prototype phase — target architecture documented |

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Current Architecture (Prototype)](#2-current-architecture-prototype)
3. [Target Architecture (Production)](#3-target-architecture-production)
4. [Frontend Component Map](#4-frontend-component-map)
5. [Module Dependencies](#5-module-dependencies)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [API Layer Design](#7-api-layer-design)
8. [Authentication & Authorization Flow](#8-authentication--authorization-flow)
9. [Notification Architecture](#9-notification-architecture)
10. [Background Jobs](#10-background-jobs)
11. [External API Contracts](#11-external-api-contracts)
12. [Error Handling Strategy](#12-error-handling-strategy)
13. [Performance Considerations](#13-performance-considerations)

---

## 1. Architecture Overview

Kaylee's Hub is a **two-user household + work management system** with a clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│   React (Next.js)  ·  Two user contexts  ·  PWA wrapper     │
├─────────────────────────────────────────────────────────────┤
│                     API LAYER                                │
│   Next.js API Routes  ·  Supabase Edge Functions             │
├──────────────────────────┬──────────────────────────────────┤
│     DATABASE LAYER       │      INTEGRATION LAYER           │
│   Supabase (PostgreSQL)  │  Google Calendar  ·  Todoist     │
│   Supabase Auth          │  Outlook/M365  ·  Twilio SMS     │
│   Supabase Storage       │  Open Food Facts  ·  Open Beauty │
└──────────────────────────┴──────────────────────────────────┘
```

### Core architectural principles

**1. Read from existing systems, don't replace them**
Kaylee already has Google Calendar, Todoist, and Salesforce. The app reads from these and surfaces them in one place. It doesn't ask her to abandon or duplicate her existing workflows.

**2. Write-back is intentional and minimal**
The app writes to Todoist (send approved tasks to Adam) and creates Google Calendar events (vehicle reminders, maintenance alerts). Every write-back is a deliberate user action, never automatic.

**3. FERPA boundary is hard-coded at the architecture level**
Student data never leaves the app. There is no student data export, no sync, no webhook. The only data movement is clipboard copy — a human action.

**4. Two user roles with clean separation**
Kaylee is admin. Adam is limited. They share a database but see fundamentally different views. Adam's interface is primarily SMS/push, not the web app.

---

## 2. Current Architecture (Prototype)

```
┌────────────────────────────────────────────┐
│         Claude.ai Artifact Renderer         │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │   HTML/CSS/JavaScript Widget          │  │
│  │                                       │  │
│  │  ┌─────────┐  ┌──────────────────┐   │  │
│  │  │ In-memory│  │ Live API calls   │   │  │
│  │  │  state  │  │ (from browser):  │   │  │
│  │  │         │  │ · Open Food Facts│   │  │
│  │  │  JS     │  │ · Open Beauty    │   │  │
│  │  │ objects │  │   Facts          │   │  │
│  │  └─────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  Claude MCP layer (outside widget):         │
│  · Google Calendar MCP (live read)          │
│  · Todoist MCP (live read/write)            │
└────────────────────────────────────────────┘
```

**Limitations of current architecture:**
- No persistence — state resets on page reload
- No authentication — single user context
- No Adam view — everything is Kaylee's view only
- No real-time updates — manual refresh required
- External API calls from browser (CORS limitations in production)
- Each widget is isolated — no shared state between modules

---

## 3. Target Architecture (Production)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│                                                                  │
│  ┌──────────────────────┐    ┌────────────────────────────────┐ │
│  │  Kaylee's Web App     │    │  Adam's Mobile (PWA)           │ │
│  │  (Full admin access)  │    │  (Task list + notifications)   │ │
│  │  Next.js on Vercel    │    │  Minimal UI + push notifs      │ │
│  └──────────┬───────────┘    └───────────────┬────────────────┘ │
└─────────────┼─────────────────────────────────┼─────────────────┘
              │                                 │
              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER                                   │
│                                                                  │
│  Next.js API Routes (/api/*)          Supabase Edge Functions   │
│  ┌─────────────────────────────┐      ┌───────────────────────┐ │
│  │ /api/inventory              │      │ check-escalations     │ │
│  │ /api/tasks                  │      │ send-notifications    │ │
│  │ /api/vehicles               │      │ check-expiry-alerts   │ │
│  │ /api/calendar               │      │ refresh-budget-cache  │ │
│  │ /api/students               │      │ registration-reminder │ │
│  │ /api/barcode/:code          │      └───────────────────────┘ │
│  │ /api/suggestions            │                                 │
│  │ /api/notifications          │                                 │
│  └─────────────────────────────┘                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌──────────────────┐          ┌──────────────────────────────────┐
│  Supabase         │          │  External Services               │
│                   │          │                                  │
│  PostgreSQL DB    │          │  Google Calendar API             │
│  Supabase Auth    │          │  Todoist API                     │
│  Supabase Storage │          │  Microsoft 365 / Outlook API     │
│  Realtime WS      │          │  Twilio SMS                      │
└──────────────────┘          │  Open Food Facts API             │
                               │  Open Beauty Facts API           │
                               └──────────────────────────────────┘
```

---

## 4. Frontend Component Map

### Application Shell
```
<App>
├── <Topbar>
│   ├── <Logo>
│   ├── <ModeToggle> (Home / Work)
│   └── <UserAvatar>
│
├── <Sidebar>
│   ├── <HomeNav> (shown in Home mode)
│   │   ├── Inventory
│   │   ├── Recipes
│   │   ├── Chores & Tasks
│   │   ├── Projects
│   │   ├── Home Suggestions
│   │   └── Vehicles
│   ├── <WorkNav> (shown in Work mode)
│   │   ├── Students
│   │   ├── Meetings
│   │   └── Emails
│   ├── <HouseholdNav>
│   │   └── Adam's Tasks
│   └── <SharedNav> (always visible)
│       ├── Calendar
│       ├── Budget
│       ├── Today's Tasks
│       └── Daily Briefing
│
└── <MainContent>
    ├── <InventoryPage>
    │   ├── <StatCards>
    │   ├── <ScanBanner> (scan-to-use mode)
    │   ├── <ActionBar> (Scan to add / Add manually / Export)
    │   ├── <ViewToggle> (List / By Room)
    │   ├── <RoomTabs>
    │   ├── <SearchBar>
    │   ├── <InventoryTable> or <RoomCardGrid>
    │   └── <AddItemModal>
    │       ├── <BarcodeScanner> (lookup + autofill)
    │       └── <ItemForm>
    │
    ├── <ChoresPage>
    │   ├── <SyncBanner>
    │   ├── <StatCards>
    │   ├── <ViewTabs> (Today / All recurring / One-off / Garden / All)
    │   ├── <SectionFilterPills>
    │   └── <TaskList>
    │       └── <TaskCard>
    │           └── <SubtaskGroup>
    │
    ├── <HouseholdTaskPage> (combined Kaylee+Adam)
    │   ├── <EscalateBanner>
    │   ├── <StatCards>
    │   ├── <ViewSwitcher>
    │   └── <DayGroupList>
    │       └── <TaskRow>
    │           └── <SubtaskRow>
    │
    ├── <AdamTaskPage>
    │   ├── <TabBar> (Week plan / Approve & send / Notifications / ADHD rules)
    │   ├── <WeekPlanView>
    │   │   ├── <WeekdayColumns>
    │   │   └── <SaturdayHeavyDay>
    │   ├── <ApprovalView>
    │   │   └── <ApprovalCard> × n days
    │   ├── <NotificationScheduleView>
    │   └── <AdhdRulesView>
    │
    ├── <VehiclePage>
    │   ├── <CarSwitcher> (Corolla / Leaf)
    │   ├── <TabBar> (Status / Service log / Settings)
    │   ├── <CriticalBanner>
    │   ├── <StatCards>
    │   └── <MaintenanceList>
    │       └── <MaintenanceItem>
    │
    ├── <HomeSuggestionsPage>
    │   ├── <TabBar> (Pending / Approved / Year calendar)
    │   ├── <StatCards>
    │   └── <SuggestionCard> × n
    │
    ├── <CalendarPage>
    │   ├── <CalendarFilters> (per-calendar toggle chips)
    │   ├── <TabBar> (Agenda / Month / Money view)
    │   ├── <AgendaView>
    │   ├── <MonthView>
    │   └── <MoneyView>
    │
    ├── <StudentsPage> (Work mode — planned)
    ├── <MeetingsPage> (Work mode — planned)
    ├── <EmailsPage> (Work mode — planned)
    ├── <TodayPage> (Shared — planned)
    └── <BriefingPage> (Shared — planned)
```

---

## 5. Module Dependencies

```
Calendar ──────────────────────────────────────────────────────►
  ├── feeds → Daily Briefing (today's events)
  ├── feeds → Adam's Tasks (his calendar events → reminders)
  └── feeds → Budget (Expenses + Pay Day calendars)

Inventory ──────────────────────────────────────────────────────►
  ├── feeds → Recipes (what's available to cook)
  ├── feeds → Adam's Notifications (items expiring → SMS)
  └── feeds → Daily Briefing (expiring items callout)

Todoist ─────────────────────────────────────────────────────────►
  ├── feeds → Chores & Tasks (full task list)
  ├── feeds → Household Tasks (Kaylee+Adam split view)
  └── receives ← Adam's Tasks (approved tasks pushed to Todoist)

Vehicles ────────────────────────────────────────────────────────►
  ├── feeds → Home Suggestions (if maintenance overdue)
  └── feeds → Calendar (create maintenance reminders)

Home Suggestions ────────────────────────────────────────────────►
  └── receives ← Inventory (e.g. if filter not changed in 6 months)

Adam's Tasks ────────────────────────────────────────────────────►
  ├── reads ← Household Tasks (overdue unassigned tasks)
  ├── reads ← Calendar (Adam's events for scheduling)
  └── sends → Notifications (triggers SMS/push schedule)

Daily Briefing ──────────────────────────────────────────────────►
  ├── reads ← Calendar (today's events)
  ├── reads ← Today's Tasks (top priority task)
  ├── reads ← Students (today's calls + prep notes)
  ├── reads ← Inventory (expiring items)
  └── reads ← Vehicles (if anything critical)
```

---

## 6. Data Flow Diagrams

### Barcode Scan Flow
```
User scans barcode
      │
      ▼
Input field receives barcode number
      │
      ▼
API call → Open Food Facts /api/v0/product/{barcode}.json
      │
      ├── FOUND → display product card (name, brand, image, category)
      │              User clicks "Use this"
      │              Form fields auto-filled
      │              User selects location + qty + expiry
      │              User clicks "Save item"
      │              POST /api/inventory → Supabase INSERT
      │
      └── NOT FOUND → API call → Open Beauty Facts
                           │
                           ├── FOUND → same flow as above
                           └── NOT FOUND → manual entry form
                                           User fills all fields
                                           POST /api/inventory → Supabase INSERT
```

### Adam Task Approval Flow
```
Nightly job OR manual trigger
      │
      ▼
System queries overdue household tasks (Todoist + Supabase)
      │
      ▼
ADHD rules engine filters and prioritizes:
  - Max 3 tasks per day
  - No back-to-back tedious tasks
  - Heavy tasks fill the day
  - Quick wins first
      │
      ▼
Draft tasks created in Supabase (status = 'pending_approval')
      │
      ▼
Kaylee sees "Approve & Send" badge in Adam's Tasks page
      │
      ▼
Kaylee reviews each day's tasks
      │
      ├── Approve → status = 'approved'
      │              Todoist API: create task in Adam's project
      │              status → 'sent'
      │              Notification schedule begins
      │
      ├── Edit → Kaylee modifies task → re-review
      │
      └── Skip → status = 'skipped'
```

### Escalation Flow
```
Supabase Edge Function: check-escalations (runs nightly)
      │
      ▼
Query: chore_tasks WHERE
  assigned_to = adam_id
  AND status = 'sent'
  AND approved_at < NOW() - INTERVAL '2 days'
  AND deleted_at IS NULL
      │
      ▼
For each result:
  UPDATE chore_tasks SET
    status = 'escalated',
    escalated_at = NOW(),
    escalated_to = kaylee_id
      │
      ▼
Kaylee's task view now shows escalated tasks with amber styling
```

### Calendar Unified View Flow
```
User opens Calendar page
      │
      ▼
Frontend requests /api/calendar?start=X&end=Y
      │
      ▼
API Route fetches in parallel:
  ├── Google Calendar API: all 9 calendar IDs
  └── Outlook API: WGU work calendar (when connected)
      │
      ▼
Merge and sort all events by date
Add calendar source metadata (color, name) to each event
      │
      ▼
Return unified event array to frontend
      │
      ▼
Frontend renders:
  ├── Agenda view (timeline)
  ├── Month view (grid)
  └── Money view (Expenses + PayDay only, filtered)
```

---

## 7. API Layer Design

### Route Conventions
```
GET    /api/{resource}         — list/query
GET    /api/{resource}/{id}    — single record
POST   /api/{resource}         — create
PATCH  /api/{resource}/{id}    — partial update
DELETE /api/{resource}/{id}    — soft delete (sets deleted_at)
```

### Core API Routes

```
/api/inventory
  GET    ?location=fridge&category=food  → filtered inventory list
  POST                                   → create item
  PATCH  /:id                            → update item (qty, expiry, etc)
  DELETE /:id                            → soft delete

/api/inventory/barcode/:code
  GET                                    → lookup barcode, return product data

/api/tasks
  GET    ?assigned_to=adam&day=Monday    → filtered task list
  POST                                   → create draft task
  PATCH  /:id                            → update (status, approve, complete)

/api/tasks/:id/approve
  POST                                   → approve + send to Todoist

/api/tasks/escalations
  GET                                    → get all escalated tasks for Kaylee

/api/vehicles
  GET                                    → list vehicles
  PATCH  /:id                            → update mileage

/api/vehicles/:id/maintenance
  GET                                    → list maintenance items
  PATCH  /:itemId                        → update item (mark done)

/api/vehicles/:id/logs
  GET                                    → service log
  POST                                   → add log entry

/api/calendar
  GET    ?start=ISO&end=ISO              → unified events from all sources

/api/suggestions
  GET                                    → pending suggestions
  PATCH  /:id                            → approve / dismiss / snooze

/api/students
  GET                                    → student list
  POST                                   → create student
  PATCH  /:id                            → update student

/api/students/:id/sessions
  GET                                    → session history
  POST                                   → create session
  PATCH  /:sessionId/copy                → mark as copied to Salesforce

/api/budget
  GET    ?month=YYYY-MM                  → monthly budget events

/api/notifications/adam
  POST                                   → trigger immediate notification
```

---

## 8. Authentication & Authorization Flow

```
User visits app
      │
      ▼
Supabase Auth checks session cookie
      │
      ├── No session → Login page
      │                  ├── Kaylee logs in → role='admin' → full app
      │                  └── Adam logs in  → role='limited' → tasks only
      │
      └── Session found
              │
              ▼
          auth.uid() used in all Supabase queries
          RLS policies filter data by role automatically
              │
              ├── role='admin' (Kaylee)
              │   All tables visible
              │   All CRUD operations permitted
              │   Sees both users' data
              │
              └── role='limited' (Adam)
                  Only chore_tasks WHERE assigned_to = auth.uid()
                  Only chore_subtasks for own tasks
                  Only notification_log for own notifications
                  Cannot access: inventory, vehicles, students,
                                 suggestions, budget, calendar sources
```

---

## 9. Notification Architecture

```
┌──────────────────────────────────────────────────────┐
│             NOTIFICATION TRIGGERS                     │
│                                                       │
│  Scheduled (cron):        Event-driven:              │
│  ┌─────────────────┐      ┌────────────────────────┐ │
│  │ 11:00 AM ET     │      │ Task approved → send   │ │
│  │ Daily recap     │      │ Task escalated → alert │ │
│  │                 │      │ Item expires in 2 days │ │
│  │ 5:30 PM ET      │      │ Calendar event in 1hr  │ │
│  │ Evening check   │      │ Recipe night (Adam     │ │
│  │                 │      │ has cook task)         │ │
│  │ 8:30 PM ET      │      └────────────────────────┘ │
│  │ Wind-down check │                                  │
│  └─────────────────┘                                  │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│           NOTIFICATION DECISION ENGINE                │
│                                                       │
│  1. Check: does Adam have tasks today?               │
│  2. Check: are any tasks still incomplete?           │
│  3. Check: has this notification type been sent      │
│     already today? (query notification_log)          │
│  4. Compose message with correct framing:            │
│     - Positive, not guilt-based                      │
│     - Lists specific tasks remaining                 │
│     - Includes time estimates                        │
└──────────────────────────┬───────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐    ┌────────────────────────────┐
│  Twilio SMS API      │    │  Web Push API (PWA)        │
│                      │    │                            │
│  TO: 470-302-0444    │    │  Service Worker            │
│  FROM: Twilio number │    │  Push Subscription         │
│  BODY: message text  │    │  Push message payload      │
└──────────┬───────────┘    └──────────┬─────────────────┘
           │                           │
           ▼                           ▼
┌────────────────────────────────────────────────────┐
│              notification_log (Supabase)            │
│  Record: recipient, channel, type, content,         │
│          sent_at, delivery_status, twilio_sid       │
└────────────────────────────────────────────────────┘
```

---

## 10. Background Jobs

All background jobs run as **Supabase Edge Functions** on a cron schedule.

| Function | Schedule | Purpose |
|---------|----------|---------|
| `check-escalations` | Daily at midnight ET | Escalate overdue Adam tasks |
| `send-daily-recap` | Daily at 11:00 AM ET | Send Adam's morning task summary |
| `send-evening-reminder` | Daily at 5:30 PM ET | Remind Adam if tasks incomplete |
| `send-winddown-reminder` | Daily at 8:30 PM ET | Final task reminder |
| `check-expiry-alerts` | Daily at 9:00 AM ET | Alert on items expiring in ≤2 days |
| `refresh-budget-cache` | Daily at 2:00 AM ET | Sync Expenses/PayDay to budget_events_cache |
| `send-calendar-reminders` | Every 15 minutes | Send 1-hr-before alerts for Adam's events |
| `send-registration-reminders` | Annual (30 days pre-birthday) | Remind about both car registrations |

---

## 11. External API Contracts

### Open Food Facts
```
GET https://world.openfoodfacts.org/api/v0/product/{barcode}.json

Response shape (relevant fields):
{
  "status": 1,           // 1 = found, 0 = not found
  "product": {
    "product_name": "...",
    "brands": "...",
    "categories": "...",
    "image_small_url": "...",
    "image_url": "..."
  }
}
```

### Open Beauty Facts
```
GET https://world.openbeautyfacts.org/api/v0/product/{barcode}.json
// Same response shape as Open Food Facts
```

### Todoist API (task creation)
```
POST https://api.todoist.com/rest/v2/tasks
Authorization: Bearer {token}

Body:
{
  "content": "Task name",
  "project_id": "6fPG54QMg3wXq9cG",
  "assignee_id": "56451676",       // Adam's user ID
  "due_string": "every monday",
  "labels": ["household"]
}
```

### Google Calendar API (event fetch)
```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
  ?timeMin={ISO}&timeMax={ISO}&orderBy=startTime&singleEvents=true
  
Authorization: Bearer {oauth_token}
```

### Twilio SMS
```
POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
Authorization: Basic {base64(AccountSid:AuthToken)}

Body (form-encoded):
  To=+14703020444
  From={TwilioNumber}
  Body={message}
```

---

## 12. Error Handling Strategy

### Frontend
- All API calls wrapped in try/catch
- User-facing errors shown as toast notifications (not console errors)
- Failed barcode lookups fall through to manual entry — no dead ends
- Optimistic UI updates with rollback on API failure

### API Layer
- All routes return consistent error shape:
  ```json
  { "error": "Human-readable message", "code": "MACHINE_CODE" }
  ```
- 401 — not authenticated → redirect to login
- 403 — not authorized → show "Access denied" (Adam trying to access Kaylee's data)
- 404 — not found → show empty state
- 500 — server error → show generic error toast, log to Supabase

### Background Jobs
- Each Edge Function logs start/end/errors to a `job_logs` table
- Failed notification sends are retried once after 5 minutes
- Failed Todoist sync sends alert to Kaylee's email (not SMS — don't flood Adam with system errors)

---

## 13. Performance Considerations

### Calendar
- Don't cache calendar events in database (except budget cache) — fetch live
- Fetch all 9 calendars in parallel (Promise.all), not sequentially
- Default window: today + 30 days for agenda, current month for month view
- Extend window on demand (user scrolls or navigates)

### Inventory
- Full inventory list is expected to be < 500 items — no pagination needed initially
- Barcode image URLs from product APIs are loaded lazily
- Insurance CSV export generated client-side from in-memory data, not a server render

### Notifications
- Check `notification_log` before sending to avoid duplicates
- Use Twilio's message status webhooks to update `delivery_status`
- Rate limit: max 3 SMS per day to Adam's number (11am, 5:30pm, 8:30pm)

### Database
- All frequently queried columns are indexed (see DATABASE_SCHEMA.md)
- Soft deletes kept for 90 days then hard-deleted by a monthly cleanup job
- Budget cache table is the one "hot" table — indexed by date, refreshed nightly

---

*See `DATABASE_SCHEMA.md` for table definitions.*
*See `ROADMAP.md` for implementation timeline.*
*See `CURRENT_STATUS.md` for what's built today.*
