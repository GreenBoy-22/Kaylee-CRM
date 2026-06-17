# Kaylee's Hub v0.7 — Students CRM Foundation

Adds the first real Work-side Students CRM foundation on top of v0.6 auth + Adam permissions.

## What changed

- Student list + detail pane layout
- Add/edit/archive students
- Course, risk, status, last contact, next appointment, missed-call counter
- Admin notes section
- Touchpoint log with WGU-style types:
  - Email from/to student
  - Text from/to student
  - Call from/to student
  - Voicemail from/to student
  - Appointment
  - No-show / missed call
- Rule-based next-call prep
- Constructive coaching note for Kaylee
- Follow-up email/text drafts with copy buttons
- FERPA guardrail warnings for likely email/phone/ID/SSN-like data

## Supabase

Run this in SQL Editor before testing Students:

```sql
-- supabase/v0_7_students_crm.sql
```

## Deploy

Upload/replace files in GitHub, then let Vercel redeploy.

## Test flow

1. Log in as Kaylee.
2. Go to Work → Students.
3. Add a student with display name only.
4. Add a touchpoint.
5. Confirm next-call prep and follow-up drafts appear.
6. Refresh and confirm data persists.
