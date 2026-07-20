-- Run this once in Supabase's SQL Editor (web dashboard) to set up
-- the tables MedNotebook needs for accounts + cross-device sync.

-- Maps each account to the username you typed (no email/phone shown to users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Holds each account's entire notebook (one row per user)
create table if not exists notebook_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table notebook_data enable row level security;

create policy "Users can read own data"
  on notebook_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on notebook_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on notebook_data for update
  using (auth.uid() = user_id);
