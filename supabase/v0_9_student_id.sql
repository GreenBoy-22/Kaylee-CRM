-- Kaylee's Hub v0.9 — add student_id (WGU ID) to students
-- Already applied to the live database via Supabase MCP on 2026-06-17.
-- File is here for the supabase/ folder in your repo.

alter table public.students
  add column if not exists student_id text;

create index if not exists students_student_id_idx
  on public.students (student_id);
