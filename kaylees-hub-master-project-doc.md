# ROADMAP.md
**Kaylee's Hub — Development Roadmap**

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Current phase | Phase 1 — Prototype |

---

## Overview

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
Prototype    Backend     Students    Notify      Intelligence  Mobile
(now)       & Persist   Module      System      Layer         App
```

---

## Phase 1 — Prototype & Validation
**Status: In progress**  
**Goal:** Build and validate the full UX before writing a single line of backend code.

Every module is prototyped as a working HTML/JS widget with real data where possible (Google Calendar and Todoist are live). The prototype proves what the app should do and how it should feel. No feature is built in the real stack until it's been validated here first.

### Completed ✅
- [x] Core shell — dual-mode toggle, sidebar, navigation
- [x] Inventory module — add, scan, scan-to-use, by-room view, insurance export
- [x] Barcode lookup — Open Food Facts + Open Beauty Facts live integration
- [x] Chores & Tasks — Todoist sync, day grouping, section filters, check-off
- [x] Household task view — Kaylee + Adam split, day/room/person breakdown, subtasks by room
- [x] Task escalation — amber banner, escalated badge, 2-day rule (mock data)
- [x] Adam's ADHD task system — week plan, approval flow, ADHD rules documentation
- [x] Notification schedule — designed and documented, not yet wired
- [x] Vehicle maintenance tracker — Corolla + Leaf, status/log/mileage tabs
- [x] Vehicle service history — brake pads, oil change, rotation logged
- [x] Home maintenance suggestions — tenant-only, Georgia-specific, approval flow
- [x] Home suggestions year calendar — 12-month maintenance schedule
- [x] Calendar — all 9 Google Calendars connected and pulling live data
- [x] Calendar unified view — agenda, month, money tabs, per-calendar filters
- [x] Master project documentation — PROJECT_OVERVIEW, DATABASE_SCHEMA, ARCHITECTURE, ROADMAP, CURRENT_STATUS

### In progress 🔄
- [ ] WGU Outlook calendar connection (Microsoft 365 connector available, not yet authenticated)
- [ ] Budget module — dedicated page for cashflow from Expenses + PayDay calendars

### Remaining for Phase 1 ⬜
- [ ] Budget module prototype
- [ ] Today's Tasks combined view prototype
- [ ] Daily Briefing prototype
- [ ] Students module prototype (FERPA-safe design)

---

## Phase 2 — Backend & Persistence
**Status: Not started**  
**Goal:** Replace in-memory prototype state with real database persistence and authentication.

### 2.1 — Supabase Setup
- [ ] Create Supabase project
- [ ] Implement full schema from DATABASE_SCHEMA.md
- [ ] Enable RLS on all tables
- [ ] Set up two user accounts: Kaylee (admin) and Adam (limited)
- [ ] Seed lookup tables: inventory_locations, calendar_sources
- [ ] Seed vehicle records and known maintenance history

### 2.2 — Next.js App Scaffold
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Tailwind CSS
- [ ] Configure Supabase client
- [ ] Implement auth flow (Supabase Auth with session cookies)
- [ ] Set up environment variables for all API keys

### 2.3 — API Routes
- [ ] `/api/inventory` — CRUD
- [ ] `/api/inventory/barcode/:code` — barcode lookup proxy (fix CORS)
- [ ] `/api/tasks` — CRUD + approve + escalation query
- [ ] `/api/vehicles` — CRUD
- [ ] `/api/calendar` — unified fetch from all Google Calendar IDs
- [ ] `/api/suggestions` — read + approve/dismiss/snooze
- [ ] `/api/budget` — monthly cashflow from budget_events_cache

### 2.4 — Migrate Prototype Data
- [ ] Migrate inventory items from prototype to Supabase
- [ ] Migrate vehicle maintenance history
- [ ] Sync Todoist tasks to chore_tasks table
- [ ] Seed home suggestions
- [ ] Import budget events from Expenses + PayDay calendars

### 2.5 — Outlook Integration
- [ ] Authenticate Microsoft 365 with WGU account
- [ ] Fetch WGU work calendar events
- [ ] Merge into unified `/api/calendar` response
- [ ] Surface in Calendar page alongside Google Calendars

### Success criteria for Phase 2
- Inventory persists between page reloads
- Kaylee and Adam can log in and see different views
- Tasks sync bidirectionally with Todoist
- All 9 Google Calendars + WGU Outlook appear in unified calendar view

---

## Phase 3 — Students Module
**Status: Not started**  
**Goal:** Build the FERPA-safe student coaching interface for Kaylee's WGU work.

### 3.1 — Student List
- [ ] Student list page with add/edit/soft-delete
- [ ] Fields: display name (first name only), active status, last contact, next scheduled
- [ ] No student IDs, legal names, or official academic data

### 3.2 — GROW Model Session Notes
- [ ] Session note form with 4 GROW fields + weekly goal + freeform notes
- [ ] Character guidance on notes field (target: 4-5 sentences)
- [ ] Session history timeline per student
- [ ] Session date auto-filled to today

### 3.3 — Salesforce Copy Flow
- [ ] "Copy to Salesforce" button formats note as clipboard string
- [ ] Format: `[Date] — Goal: [grow_will] | Notes: [notes]`
- [ ] Sets `copied_to_salesforce = true` on successful copy
- [ ] Visual indicator on session rows that have been copied

### 3.4 — Calendar Integration
- [ ] Student calls from WGU Outlook appear as prep items in Daily Briefing
- [ ] Next scheduled date auto-populated from Outlook when available

### Success criteria for Phase 3
- Kaylee can create a student record, write GROW notes, and copy to Salesforce in under 60 seconds
- No student data is stored beyond first name and coaching notes
- FERPA audit: an outside reviewer looking at the database would find no identifiable student information

---

## Phase 4 — Notification System
**Status: Not started**  
**Goal:** Get Adam's SMS and push notifications working.

### 4.1 — Twilio Setup
- [ ] Create Twilio account
- [ ] Purchase phone number for outbound SMS
- [ ] Store credentials in environment variables
- [ ] Build Twilio SMS helper function

### 4.2 — Scheduled Notifications
- [ ] Supabase Edge Function: `send-daily-recap` (11:00 AM ET)
- [ ] Supabase Edge Function: `send-evening-reminder` (5:30 PM ET)
- [ ] Supabase Edge Function: `send-winddown-reminder` (8:30 PM ET)
- [ ] All functions check `notification_log` to avoid duplicates
- [ ] All functions check if tasks are actually incomplete before sending

### 4.3 — Event-Driven Notifications
- [ ] Expiry alert: trigger when inventory item expires in ≤2 days
- [ ] Recipe suggestion: trigger on nights Adam has a cook task
- [ ] Calendar reminder: trigger 1 hour before Adam's calendar events

### 4.4 — PWA Push Notifications
- [ ] Set up PWA manifest and service worker
- [ ] Implement Web Push subscription for Adam's device
- [ ] Daily recap as push notification (11am)
- [ ] Adam can install app to home screen on iPhone

### 4.5 — Notification Preferences
- [ ] Kaylee can view notification history for Adam
- [ ] Kaylee can temporarily pause notifications (e.g. Adam is on vacation)
- [ ] Kaylee can adjust notification times

### Success criteria for Phase 4
- Adam receives SMS at 11am, 5:30pm, 8:30pm on days he has tasks
- Texts stop once all tasks are marked complete for the day
- Adam can complete tasks via Todoist and the web app reflects completion
- Escalation runs correctly: after 2 days, tasks appear in Kaylee's view

---

## Phase 5 — Intelligence Layer
**Status: Not started**  
**Goal:** Add AI-powered features that make the system proactive rather than reactive.

### 5.1 — Recipe Matching
- [ ] Recipe suggestion engine: given current inventory, suggest recipes
- [ ] Prioritize items expiring soonest
- [ ] Account for Adam's cook nights (Monday, Thursday from chore schedule)
- [ ] Send suggested recipe in his cook-night SMS

### 5.2 — ADHD Task Auto-Suggestion
- [ ] System reviews overdue household tasks + Adam's completed task history
- [ ] Suggests a weekly task plan (Mon–Sat) for Kaylee to approve
- [ ] Applies all ADHD rules automatically: max 3/day, quick wins first, no back-to-back, Sunday off
- [ ] Kaylee sees proposed week in the approval view

### 5.3 — Daily Briefing Generation
- [ ] Morning briefing page that generates from all data sources
- [ ] Student call prep: for each call today, pull student's name, last session goal, what to ask
- [ ] One smart question per student call based on last session notes
- [ ] Energy flag: "These two calls are back-to-back — you may want to block focus time after"
- [ ] Single most important task of the day
- [ ] Expiring items callout
- [ ] Payday / bill due alerts from budget calendar

### 5.4 — Email Draft Generation (Work Mode)
- [ ] Morning email scan: check Gmail and Outlook for unread emails needing reply
- [ ] Skip: newsletters, notifications, automated emails
- [ ] For each email needing reply: read full thread, check sent folder for tone
- [ ] Generate draft reply that sounds like Kaylee
- [ ] Save draft to Gmail drafts folder or Outlook drafts
- [ ] Flag urgent/sensitive emails with a note
- [ ] Review interface in Emails page

### 5.5 — Home Suggestion Intelligence
- [ ] Connect inventory to suggestions: if HVAC filter not replaced in 6 months, surface suggestion
- [ ] Vehicle maintenance → suggestions: if Corolla spark plugs overdue, surface in Home Suggestions
- [ ] Seasonal triggers: surface appropriate suggestions based on current month

### Success criteria for Phase 5
- Daily briefing can be read in under 3 minutes and contains genuinely useful information
- Email drafts sound like Kaylee (no generic corporate tone)
- Recipe suggestions use actual current inventory, not just generic recipes

---

## Phase 6 — Mobile App
**Status: Not started**  
**Goal:** Native-feeling mobile experience, especially for Adam. Camera barcode scanning.

### 6.1 — PWA Polish
- [ ] App installs to home screen on iOS and Android
- [ ] Works offline for inventory viewing (cached)
- [ ] Splash screen and app icon

### 6.2 — Camera Barcode Scanning
- [ ] Replace keyboard barcode input with camera-based scanning
- [ ] Use `BarcodeDetector` API (Chrome/Android) or `ZXing` JS library (iOS fallback)
- [ ] Scan mode: camera overlay, auto-triggers lookup on successful scan
- [ ] Multi-scan mode: keep camera open, scan multiple items to same location

### 6.3 — Adam's Dedicated Mobile View
- [ ] Simplified view optimized for his phone: just his tasks for today
- [ ] Large, tap-friendly checkboxes
- [ ] No financial data, no full inventory, no work mode
- [ ] Task detail shows room + estimated time + effort level
- [ ] Subtasks expandable for room-by-room vacuuming etc.

### 6.4 — Mobile-Optimized Inventory Entry
- [ ] Full-screen scan mode on mobile
- [ ] Session location persists across scan sessions
- [ ] Haptic feedback on successful scan
- [ ] Photo capture for items without barcodes (insurance documentation)

### Success criteria for Phase 6
- Adam can check off all his tasks without opening the web app
- Barcode scanning works with a phone camera for grocery items
- App installs to home screen and feels native

---

## Backlog (Unscheduled)

These features have been discussed but not yet assigned to a phase:

- [ ] Projects module — personal and household projects with subtasks (separate from recurring chores)
- [ ] Vacation planning integration — Vacation calendar + budget for trips
- [ ] Grocery list integration — from inventory low-stock + Adam's "add to grocery list" task
- [ ] Chore history analytics — completion rates, patterns, by person
- [ ] Budget analytics — monthly spend by category, subscription total, year-over-year
- [ ] Home inventory photos — attach photos to insurance items
- [ ] Vehicle expense tracking — log fuel costs, parking, tolls
- [ ] WGU Outlook email drafts — same draft generation as Gmail but for Outlook
- [ ] Smart scheduling — "you have a 25-minute gap at 2pm — here's what you could do"

---

## Version History

| Version | Date | Phase | Summary |
|---------|------|-------|---------|
| 1.0 | June 17, 2026 | Phase 1 | Initial roadmap created from completed prototype session |
