-- Kaylee's Hub v0.8c — FERPA-safe CSV Import + Weekly Call Prep fields
-- Run this after v0.7/v0.8b schemas.

alter table public.students add column if not exists momentum text default '';
alter table public.students add column if not exists last_academic_activity_date date;
alter table public.students add column if not exists course_end_date date;
alter table public.students add column if not exists term_end_date date;
alter table public.students add column if not exists enrolled_cu numeric;
alter table public.students add column if not exists term_remaining_cu numeric;
alter table public.students add column if not exists term_completed_cu numeric;
alter table public.students add column if not exists contact_term numeric;
alter table public.students add column if not exists weeks_in_course numeric;
alter table public.students add column if not exists latest_course_note text default '';
alter table public.students add column if not exists next_conversation_focus text default '';
alter table public.students add column if not exists known_blockers text default '';
alter table public.students add column if not exists preferred_contact_method text default '';
alter table public.students add column if not exists student_timezone text default '';
