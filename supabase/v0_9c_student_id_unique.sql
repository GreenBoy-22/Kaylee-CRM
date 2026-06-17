-- Kaylee's Hub v0.9c — enforce unique student_id at the database level.
-- Already applied to the live database via Supabase MCP.

alter table public.students
  add constraint students_student_id_unique unique (student_id);
