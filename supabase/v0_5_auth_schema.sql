-- Kaylee's Hub v0.5 Auth + Adam permissions schema
-- Run this in Supabase SQL Editor after v0.4 tables exist.
-- Then create/sign up two Supabase Auth users:
-- Kaylee: kayleet.green@gmail.com (or green.kayleet@gmail.com) => admin
-- Adam: adamlamargreen@gmail.com => limited

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null check (role in ('admin','limited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.section_permissions (
  id uuid primary key default gen_random_uuid(),
  user_key text not null default 'adam',
  section_key text not null,
  label text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_key, section_key)
);

alter table public.profiles enable row level security;
alter table public.section_permissions enable row level security;

create or replace function public.profile_role_for_email(email text)
returns text
language sql
stable
as $$
  select case
    when lower(coalesce(email, '')) in ('kayleet.green@gmail.com','green.kayleet@gmail.com') then 'admin'
    when lower(coalesce(email, '')) in ('adamlamargreen@gmail.com') then 'limited'
    else 'limited'
  end;
$$;

create or replace function public.profile_name_for_email(email text)
returns text
language sql
stable
as $$
  select case
    when lower(coalesce(email, '')) in ('kayleet.green@gmail.com','green.kayleet@gmail.com') then 'Kaylee'
    when lower(coalesce(email, '')) in ('adamlamargreen@gmail.com') then 'Adam'
    else split_part(coalesce(email, 'User'), '@', 1)
  end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    public.profile_name_for_email(new.email),
    public.profile_role_for_email(new.email)
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "Profiles read own" on public.profiles;
drop policy if exists "Profiles insert own fixed role" on public.profiles;
drop policy if exists "Profiles update own fixed role" on public.profiles;
drop policy if exists "Admins read all profiles" on public.profiles;

create policy "Profiles read own" on public.profiles
for select to authenticated
using (id = auth.uid());

create policy "Admins read all profiles" on public.profiles
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Profiles insert own fixed role" on public.profiles
for insert to authenticated
with check (
  id = auth.uid()
  and email = (auth.jwt() ->> 'email')
  and role = public.profile_role_for_email(auth.jwt() ->> 'email')
);

create policy "Profiles update own fixed role" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and email = (auth.jwt() ->> 'email')
  and role = public.profile_role_for_email(auth.jwt() ->> 'email')
);

drop policy if exists "Permissions read authenticated" on public.section_permissions;
drop policy if exists "Permissions write admin" on public.section_permissions;

create policy "Permissions read authenticated" on public.section_permissions
for select to authenticated
using (true);

create policy "Permissions write admin" on public.section_permissions
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into public.section_permissions (user_key, section_key, label, can_view, can_edit)
values
  ('adam','today','Today’s Tasks',true,false),
  ('adam','briefing','Daily Briefing',true,false),
  ('adam','calendar','Calendar',true,false),
  ('adam','budget','Budget',true,false),
  ('adam','inventory','Inventory',true,false),
  ('adam','chores','Chores & Tasks',true,false),
  ('adam','adam','Adam’s Tasks',true,false),
  ('adam','vehicles','Vehicles',true,false),
  ('adam','suggestions','Home Suggestions',true,false)
on conflict (user_key, section_key) do nothing;

-- Tighten the important work-side table: students are admin-only.
alter table if exists public.students enable row level security;
drop policy if exists "v0.4 prototype read students" on public.students;
drop policy if exists "v0.4 prototype write students" on public.students;
drop policy if exists "Students admin only read" on public.students;
drop policy if exists "Students admin only write" on public.students;

create policy "Students admin only read" on public.students
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Students admin only write" on public.students
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Home data remains visible to authenticated household users in v0.5.
-- UI permissions control Adam's edit access. RLS can be tightened further in v0.6.
alter table if exists public.inventory_items enable row level security;
alter table if exists public.tasks enable row level security;

drop policy if exists "v0.4 prototype read inventory" on public.inventory_items;
drop policy if exists "v0.4 prototype write inventory" on public.inventory_items;
drop policy if exists "Inventory authenticated read" on public.inventory_items;
drop policy if exists "Inventory authenticated write" on public.inventory_items;
create policy "Inventory authenticated read" on public.inventory_items for select to authenticated using (true);
create policy "Inventory authenticated write" on public.inventory_items for all to authenticated using (true) with check (true);

drop policy if exists "v0.4 prototype read tasks" on public.tasks;
drop policy if exists "v0.4 prototype write tasks" on public.tasks;
drop policy if exists "Tasks authenticated read" on public.tasks;
drop policy if exists "Tasks authenticated write" on public.tasks;
create policy "Tasks authenticated read" on public.tasks for select to authenticated using (true);
create policy "Tasks authenticated write" on public.tasks for all to authenticated using (true) with check (true);
