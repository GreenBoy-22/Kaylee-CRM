# Kaylee's Hub v0.5 — Auth + Adam Permissions

This build adds Supabase Auth, two roles, and a Settings page for controlling Adam's Home-side access.

## What changed

- Login screen using Supabase Auth
- Kaylee profile = `admin`
- Adam profile = `limited`
- Adam is Home-only and cannot access Work mode
- Settings page for Kaylee/admin
- Per-section Adam toggles:
  - View: Adam can see the section
  - Edit: Adam can change/complete/save things in that section
- Students remain admin-only and FERPA-safe
- Inventory save still works, but Adam is view-only unless Inventory Edit is turned on

## Deploy steps

1. Upload/replace these files in GitHub.
2. In Supabase SQL Editor, run:
   - `supabase/v0_5_auth_schema.sql`
3. In Supabase Auth, create users or sign up from the app:
   - Kaylee: `kayleet.green@gmail.com` or `green.kayleet@gmail.com`
   - Adam: `adamlamargreen@gmail.com`
4. In Vercel, confirm env vars exist:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Redeploy.

## Notes

- Adam sees Home sections by default.
- Adam's Edit toggles default off.
- Work mode, Students, and FERPA-safe work data remain Kaylee/admin only.
- v0.6 should tighten RLS for every home table to match the section permissions server-side.


## v0.8a Mentor Success Dashboard

This build adds the first mentor-intelligence layer on the Work dashboard.

### Added
- Mentor Success Dashboard for Kaylee/admin in Work mode
- High Risk count
- Ghost Risk count
- Calls Today count based on manual next appointment dates
- Follow-ups Due count
- Risk-ordered Today's Priority Queue
- Call Prep Focus cards from saved next-call prep/touchpoints
- Risk Buckets and Mentor Metrics panels

### Notes
- No new Supabase table is required for v0.8a.
- This uses the existing `students` and `student_touchpoints` tables from v0.7.
- Outlook calendar integration is still a later build; Calls Today uses the manual `next_appointment_date` field for now.


## v0.8c FERPA CSV Import + Call Prep

This build adds the second mentor-intelligence layer.

### Added
- Student Health Score on each student profile
- Component scores: Momentum, Engagement, Risk Safety, Goal Progress
- Ghost/support/portal-only signals included in scoring
- Graduation Goal Date field on add/edit student
- Student Timeline combining touchpoints, next appointment, and graduation goal
- Health badges in the Work Dashboard priority queue

### Supabase
Run this once before testing the graduation goal field:
- `supabase/v0_8b_student_health.sql`

### Notes
- Health scoring is rule-based for now, not AI.
- Outlook calendar integration is still later; appointments remain manual.
- Salesforce remains clipboard-only.


## v0.8c additions

- Adds a FERPA-safe CSV import button on the Students page.
- Imports the cleaned CSV format with columns such as DisplayName, CourseCode, StudentGraduationGoal, Momentum, LastAcademicActivityDate, CourseEndDate, TermRemainingCU, TermCompletedCU, LatestCourseNote.
- Auto-populates current course, graduation goal date, momentum, course dates, CU progress, latest course note, next conversation focus, and next-call prep.
- Skips duplicate students based on DisplayName + CurrentCourse.

Run this SQL before importing:

```sql
supabase/v0_8c_csv_import.sql
```

Use the FERPA-safe CSV only. Do not import student IDs, full names, emails, phone numbers, or addresses.
