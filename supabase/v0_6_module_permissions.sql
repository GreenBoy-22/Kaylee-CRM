-- Kaylee's Hub v0.6 module permissions
-- You already ran these rows manually, but this file is safe to run again.

create extension if not exists pgcrypto;

create table if not exists public.module_permissions (
  id uuid primary key default gen_random_uuid(),
  module_name text not null,
  role text not null check (role in ('admin','limited')),
  access_level text not null check (access_level in ('hidden','view','edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_name, role)
);

alter table public.module_permissions enable row level security;

drop policy if exists "read module permissions" on public.module_permissions;
drop policy if exists "write module permissions" on public.module_permissions;

create policy "read module permissions"
on public.module_permissions
for select
to authenticated
using (true);

create policy "write module permissions"
on public.module_permissions
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into public.module_permissions
(module_name, role, access_level)
values
('dashboard','limited','edit'),
('today_tasks','limited','edit'),
('daily_briefing','limited','view'),
('calendar','limited','edit'),
('inventory','limited','edit'),
('chores','limited','edit'),
('adam_tasks','limited','edit'),
('vehicles','limited','view'),
('home_suggestions','limited','edit'),
('budget','limited','view'),
('students','limited','hidden'),
('work_mode','limited','hidden')
on conflict (module_name, role)
do update set access_level = excluded.access_level;
