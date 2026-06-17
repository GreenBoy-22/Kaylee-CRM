-- Kaylee's Hub v0.8b — Student Health Engine support
-- Adds graduation goal date for student success tracking.

alter table public.students
add column if not exists graduation_goal_date date;
