# PROJECT_OVERVIEW.md
**Kaylee's Hub — Personal CRM & Household Management System**

| Field | Value |
|-------|-------|
| Project name | Kaylee's Hub |
| Version | 1.0 |
| Last updated | June 17, 2026 |
| Status | Active — prototype phase |
| Primary user | Kaylee Green (green.kayleet@gmail.com) |
| Secondary user | Adam Green (adamlamargreen@gmail.com) |

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Why It Exists](#2-why-it-exists)
3. [Who Uses It](#3-who-uses-it)
4. [Core Concepts](#4-core-concepts)
5. [Technology Stack](#5-technology-stack)
6. [External Services & Integrations](#6-external-services--integrations)
7. [Project Constraints](#7-project-constraints)
8. [Key Decisions & Rationale](#8-key-decisions--rationale)
9. [Glossary](#9-glossary)
10. [Related Documents](#10-related-documents)

---

## 1. What This Project Is

Kaylee's Hub is a dual-mode personal CRM and household management system. It is a single web application that toggles between two operating contexts:

- **Home mode** — household inventory, chores, task management, vehicle maintenance, home suggestions, calendar, and budget
- **Work mode** — WGU student coaching, meeting preparation, email drafts, and daily briefing

Both modes share a unified task queue ("Today's Tasks") and a daily briefing page that surfaces the most important things across both worlds.

The system is not a generic productivity app. Every feature, every design decision, and every business rule was built around one specific household: Kaylee and Adam Green, Canton, Georgia.

---

## 2. Why It Exists

### The core problem
Kaylee works from home as a WGU Student Success Advisor. Her workday consists of back-to-back student coaching calls, but she has gaps between them — sometimes 15 minutes, sometimes an hour. During those gaps she could be doing household tasks, but has no easy way to see what's actionable, quick, and not going to leave her mid-task when the next call starts.

At the same time, she is the primary household manager. Adam has ADHD and DVT, which means she often ends up doing household tasks that were assigned to him. She has no visibility into whether he has done his tasks until she notices they haven't been done.

She also maintains multiple parallel tracking systems: a Todoist account with household chores, nine Google Calendars covering everything from subscriptions to family commitments, a separate mental model for vehicle maintenance, and Salesforce for student notes at work.

### What the system does
Kaylee's Hub collapses all of those separate systems into one command center. It does not replace any of them — it reads from them, surfaces what matters today, and gives Kaylee one place to look in the morning to understand what her day looks like across both her work and personal life.

### What makes it different from generic tools
- It knows Kaylee's specific home (3-bed/2-bath townhouse, Canton GA, renter)
- It knows her specific cars (2016 Toyota Corolla, 2013 Nissan Leaf) and their maintenance histories
- It knows Adam's ADHD constraints and designs around them
- It knows her specific calendar structure (9 named Google Calendars) and maps them correctly
- It knows FERPA compliance requirements for her student notes
- It pulls from live data sources she already maintains rather than asking her to re-enter data

---

## 3. Who Uses It

### Kaylee Green — Admin
**Role:** Primary user, household manager, WGU advisor  
**Access:** Full access to all modules in both Home and Work modes  
**Key workflows:**
- Morning: reads daily briefing, reviews Adam's suggested tasks, approves what goes to him
- During work: uses Work mode for student prep, email drafts, meeting notes
- Between calls: flips to Home mode to check quick household tasks
- Evening: reviews what Adam has and hasn't done, handles escalated tasks

### Adam Green — Limited User
**Role:** Household contributor  
**Access:** His own task list only — no finances, no work mode, no full inventory  
**Key constraints (ADHD/DVT-driven):**
- Max 2–3 tasks per day
- No back-to-back tedious tasks
- Heavy physical tasks (yard work) count as a full day — nothing else added
- Saturday is the only designated heavy day; Sunday is always a rest day
- Tasks broken into small, completable units (vacuum is split by room, not one big task)
- Notifications: 11am push, 5:30pm SMS, 8:30pm SMS — all to 470-302-0444

### Notification flow
Adam does not log into the web app to check tasks. His primary interface is SMS messages and push notifications. The web app is Kaylee's tool; Adam's touchpoint is his phone.

---

## 4. Core Concepts

### The Toggle
The app has a single toggle in the top bar: **Home / Work**. This is not a page navigation — it switches the entire context of the sidebar, the task queue, and the daily briefing. The toggle is the most important UI element in the app.

### The Venn Diagram
The original vision was a system where Home and Work tasks overlap naturally. Tasks that can be done in the background during a work gap (putting laundry in, checking the dishwasher) should surface alongside work tasks. The toggle separates the views, but the underlying task system knows which tasks are "crossover" candidates.

### Kaylee Approves → Adam Executes
Adam never assigns himself tasks. The system proposes tasks for him based on what's overdue in the household pool. Kaylee reviews these proposals and approves them. Only approved tasks are sent to Adam's Todoist. This is by design — Kaylee understands his capacity better than any algorithm.

### Escalation
If Adam hasn't completed a task after 2 days, it silently escalates to Kaylee's list. It stays on Adam's list too — the goal is not to punish him, but to ensure the household doesn't fall behind. Escalated tasks appear with an amber left border and an "Escalated from Adam" badge in Kaylee's view.

### FERPA Boundary
Student data is the one area where the CRM is intentionally incomplete. Kaylee's official student records live in Salesforce (WGU's system). The CRM holds only first names/nicknames, weekly goals, and GROW model coaching notes. Nothing syncs automatically to any system. "Copy to Salesforce" is a manual clipboard action — always intentional, never automatic.

---

## 5. Technology Stack

### Current Phase (Prototype)
The project is currently built as interactive HTML/CSS/JavaScript widgets rendered inside Claude.ai artifacts. These are fully functional prototypes demonstrating the complete UI and UX. They run in the browser with in-memory state and no persistent backend.

| Layer | Prototype | Target |
|-------|-----------|--------|
| Frontend | Vanilla HTML/CSS/JS | React + Next.js |
| Styling | Claude CSS custom properties | Tailwind CSS |
| State | In-memory JS objects | Zustand |
| Backend | None | Next.js API routes |
| Database | None | Supabase (PostgreSQL) |
| Auth | None | Supabase Auth |
| Hosting | None | Vercel |
| SMS | None | Twilio |
| Push notifications | None | Web Push API (PWA) |

### Icon Library
Tabler Icons via CDN
```
https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css
```

### Design Token System
All colors, typography, and border radii use Claude's built-in CSS custom properties. This gives automatic light/dark mode support and a consistent visual system without a custom design system.

Key tokens:
```css
var(--color-background-primary)
var(--color-background-secondary)
var(--color-background-tertiary)
var(--color-text-primary)
var(--color-text-secondary)
var(--color-text-tertiary)
var(--color-border-tertiary)
var(--border-radius-md)
var(--border-radius-lg)
var(--font-sans)
var(--font-mono)
```

### Brand Colors (hardcoded)
```css
--brand-purple:     #534AB7   /* primary accent, Kaylee */
--brand-purple-bg:  #EEEDFE
--brand-purple-dark:#3C3489
--brand-green:      #0F6E56   /* Adam's color, success states */
--brand-green-bg:   #E1F5EE
--brand-red:        #A32D2D   /* overdue, urgent, danger */
--brand-red-bg:     #FCEBEB
--brand-amber:      #854F0B   /* due soon, warnings */
--brand-amber-bg:   #FAEEDA
```

---

## 6. External Services & Integrations

### Connected (Live)
| Service | Auth Method | Used For | Account |
|---------|------------|---------|---------|
| Google Calendar | OAuth via Claude MCP | Read all 9 calendars | green.kayleet@gmail.com |
| Todoist | OAuth via Claude MCP | Read/write tasks and projects | green.kayleet@gmail.com |
| Open Food Facts | None (public API) | Barcode product lookup — food/grocery | N/A |
| Open Beauty Facts | None (public API) | Barcode product lookup — personal care | N/A |

### Planned
| Service | Purpose | Priority |
|---------|---------|---------|
| Microsoft 365 / Outlook | WGU work calendar + email drafts | High |
| Twilio SMS | Adam's notification texts to 470-302-0444 | High |
| Supabase | Database and authentication | High |
| Google Calendar (write) | Create maintenance reminders as calendar events | Medium |
| Todoist webhook | Real-time task completion detection for escalation | Medium |

### Key External IDs

**Google Calendar IDs**
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

**Todoist IDs**
| Item | ID |
|------|-----|
| Kaylee user | `56441076` |
| Adam user | `56451676` |
| House & Daily Life project | `6fPG54QMg3wXq9cG` |
| Gardening project | `6gXCQrrRpGh2q3wr` |
| Odds and Ends project | `6fh3FhfJfmM5h7Pj` |

---

## 7. Project Constraints

### FERPA Compliance
Kaylee is a WGU employee. FERPA (Family Educational Rights and Privacy Act) governs how student information can be stored and transmitted. This project must never store student ID numbers, legal names, grades, enrollment status, or any official academic records. Only first names/nicknames and Kaylee's own coaching notes are permitted. Nothing syncs to Salesforce automatically.

### No Salesforce Integration
WGU prohibits Salesforce API access from personal/external applications. The CRM mirrors what Kaylee would put in Salesforce so she can write notes in a familiar interface and copy them manually.

### Renter Constraints (Home Suggestions)
Kaylee and Adam rent their townhouse. Home maintenance suggestions are filtered to tenant-only responsibilities. Anything structural (roof, foundation, gutters, exterior) is the landlord's responsibility and must not appear in suggestions.

### Adam's Medical Constraints
Adam has ADHD and DVT (deep vein thrombosis). Task design must account for both:
- ADHD: no overwhelming lists, quick wins first, positive framing, generous reminders
- DVT: avoid tasks requiring prolonged standing — any task involving extended yard work or heavy physical labor should be treated as a full-day task

### One-Person Budget Visibility
Adam should not see household finances in his limited view. The Budget module, Expenses calendar, and Pay Day data are Kaylee's administrative layer.

---

## 8. Key Decisions & Rationale

### One Google account with 9 calendars, not multiple accounts
Kaylee organizes everything in a single Gmail account using Google Calendar's multi-calendar feature as an organizational tool — one calendar for subscriptions, one for family commitments, one for paydays, etc. Rather than consolidating these or asking her to change her system, the app reads all 9 and surfaces them together with color-coded filters. Her system is already good; the app just makes it visible in one place.

### Salesforce is copy-paste, not integrated
WGU prohibits API access from personal tools. More importantly, auto-sync would create a FERPA risk — any bug or misconfiguration could cause data to sync inappropriately. Manual copy-paste is slower but safer and keeps the action intentional and human.

### Adam's tasks require Kaylee's approval
An automated algorithm cannot know that Adam had a hard week, or that he already has a medical appointment on Thursday, or that the yard work last weekend wiped him out. Kaylee has that context. The system proposes based on what's overdue; Kaylee decides what's actually reasonable.

### Sundays are always rest days (no exceptions in the UI)
Without a hard rule, Sunday becomes "catch-up day" by default, which defeats the purpose of rest. The UI enforces this — there is no way to assign Adam a Sunday task through the normal approval flow.

### Heavy tasks count as a full day
This mirrors how ADHD actually works. A two-hour yard work session doesn't just take two hours — it drains executive function for the rest of the day. Modeling this correctly prevents the frustration of assigned tasks that were never realistic to begin with.

### Barcode scanner uses keyboard input, not camera
USB and Bluetooth barcode scanners emit their scanned value as simulated keyboard input followed by an Enter keystroke. This means a standard text input with an `onkeydown` Enter handler supports physical scanners with zero additional code. Camera-based scanning (using the device camera to decode barcodes) is more complex and saved for the mobile phase.

### Inventory tracks estimated value for insurance purposes
A full home inventory with purchase dates, serial numbers, and replacement values is one of the most practical documents a household can have. After a fire, flood, or theft, an insurance adjuster needs an itemized list. The system generates this as a CSV export. This was an explicit user request and elevates the inventory module from a grocery tracker to a genuine household asset register.

### Tenant-only home suggestions
Surfacing suggestions about roof maintenance or gutter cleaning to a renter is actively unhelpful — it creates anxiety about things she cannot control and dilutes the signal of things she actually should do. The suggestion engine is filtered at the data level, not just the display level.

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **GROW model** | Coaching framework: Goal, Reality, Options, Will. Kaylee uses this in every student conversation. |
| **Escalation** | When Adam's task is overdue 2+ days, it is "escalated" — added to Kaylee's task list while remaining on Adam's. |
| **Heavy day** | A day when Adam is assigned a physically or cognitively demanding task. No additional tasks are added on heavy days. |
| **Quick win** | A short (under 10 min), low-effort task intentionally placed first in Adam's daily list to provide a dopamine boost before harder tasks. |
| **Session-sticky** | When scanning or adding items, the room selection persists for the whole session so you don't need to re-select it for every item. |
| **FERPA** | Family Educational Rights and Privacy Act. US law governing student educational records. |
| **Tenant-only** | Home maintenance tasks that are the renter's responsibility (not the landlord's). |
| **The Venn diagram** | The conceptual overlap between Home tasks and Work tasks — tasks that can be done in the gaps between work calls. |
| **Todoist** | The task management app Kaylee and Adam both use. The CRM reads from and writes to their shared Todoist. |
| **MCP** | Model Context Protocol — the integration layer that lets Claude directly read from Google Calendar and Todoist. |

---

## 10. Related Documents

| Document | Purpose |
|---------|---------|
| `DATABASE_SCHEMA.md` | Full schema for all database tables |
| `ARCHITECTURE.md` | System architecture, component map, data flows |
| `ROADMAP.md` | Phased development plan with milestones |
| `CURRENT_STATUS.md` | What's built, what's in progress, known bugs |

---

*To continue development in a new conversation: paste the contents of all five documents as context, then describe what you want to build.*
