-- Kaylee's Hub v0.7 Students CRM Foundation
-- Run this after v0.4/v0.5/v0.6 schemas.

create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  goal text default '',
  risk text default 'Medium',
  copied boolean not null default false,
  grow_note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ferpa_display_name_reasonable check (char_length(display_name) <= 40)
);

alter table public.students add column if not exists course text default '';
alter table public.students add column if not exists status text default 'Active';
alter table public.students add column if not exists admin_notes text default '';
alter table public.students add column if not exists next_call_prep text default '';
alter table public.students add column if not exists constructive_note text default '';
alter table public.students add column if not exists last_contact_date date;
alter table public.students add column if not exists next_appointment_date date;
alter table public.students add column if not exists missed_call_count integer not null default 0;
alter table public.students add column if not exists archived boolean not null default false;

create table if not exists public.student_touchpoints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  touchpoint_type text not null,
  touchpoint_date date not null default current_date,
  course text default '',
  momentum text default '',
  note text not null default '',
  next_call_prep text default '',
  constructive_note text default '',
  follow_up_email text default '',
  follow_up_text text default '',
  copied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.student_touchpoints enable row level security;

drop policy if exists "v0.7 admin read students" on public.students;
drop policy if exists "v0.7 admin write students" on public.students;
drop policy if exists "v0.7 admin read touchpoints" on public.student_touchpoints;
drop policy if exists "v0.7 admin write touchpoints" on public.student_touchpoints;

-- Prototype policy: authenticated Kaylee app access. Tighten with role-based RPC/RLS later.
create policy "v0.7 admin read students" on public.students for select to authenticated using (true);
create policy "v0.7 admin write students" on public.students for all to authenticated using (true) with check (true);
create policy "v0.7 admin read touchpoints" on public.student_touchpoints for select to authenticated using (true);
create policy "v0.7 admin write touchpoints" on public.student_touchpoints for all to authenticated using (true) with check (true);

update public.students
set risk = case when risk in ('Watch','Support') then 'Medium' else risk end,
    status = case when copied is true then coalesce(status, 'Active') else coalesce(status, 'Active') end
where risk in ('Watch','Support') or status is null;
