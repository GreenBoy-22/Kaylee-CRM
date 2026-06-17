-- Kaylee's Hub starter Supabase schema
-- Run after creating Supabase Auth users for Kaylee and Adam.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  role text not null default 'limited' check (role in ('admin','limited')),
  phone text,
  todoist_id text,
  avatar_color text,
  timezone text default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_locations (
  id text primary key,
  label text not null,
  icon text,
  is_storage boolean default false,
  sort_order integer
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  location_id text references public.inventory_locations(id),
  category text,
  quantity integer not null default 1 check (quantity >= 0),
  expires_date date,
  purchase_date date,
  estimated_value numeric(10,2),
  serial_number text,
  model_number text,
  barcode text,
  notes text,
  image_url text,
  source text default 'manual' check (source in ('manual','barcode_scan')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.chore_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  assigned_to uuid references public.users(id),
  day_of_week text not null,
  room text,
  recurrence text,
  effort_level text default 'light' check (effort_level in ('light','medium','heavy')),
  estimated_minutes integer,
  todoist_task_id text,
  todoist_section text,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','completed','escalated','skipped')),
  escalated_at timestamptz,
  escalated_to uuid references public.users(id),
  last_completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  active boolean default true,
  week_goal text,
  grow_notes text,
  last_contact_date date,
  next_scheduled_date date,
  notes_copied_to_salesforce boolean default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.users enable row level security;
alter table public.inventory_items enable row level security;
alter table public.chore_tasks enable row level security;
alter table public.students enable row level security;

create policy "Users can read own profile" on public.users for select using (auth.uid() = id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "Admin sees all inventory" on public.inventory_items for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "Adam sees own tasks only" on public.chore_tasks for select using (assigned_to = auth.uid() or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "Students admin only" on public.students for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

insert into public.inventory_locations (id,label,icon,is_storage,sort_order) values
('fridge','Fridge','snowflake',true,1),('pantry-in','Indoor Pantry','box',true,2),('pantry-out','Outdoor Pantry','box',true,3),('backstock','Backstock','archive',true,4),('kitchen','Kitchen','chef-hat',false,5),('living-room','Living Room','sofa',false,6),('bedroom','Bedroom','bed',false,7),('guest-bedroom','Guest Bedroom','bed',false,8),('office','Office','laptop',false,9),('bathroom','Bathroom','droplet',false,10),('laundry','Laundry Room','washing-machine',false,11),('library','Library','book',false,12),('basement','Basement','stairs',false,13),('garage','Garage','car',false,14),('outdoor','Outdoor / Yard','plant',false,15)
on conflict (id) do nothing;
