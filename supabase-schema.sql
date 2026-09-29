-- GOLD WITH ELLEANOR V1
-- Run in Supabase SQL Editor when you are ready to connect the app.

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  source text,
  status text not null default 'new_enquiry',
  date_added date not null default current_date,
  education_date date,
  registration_date date,
  started_saving_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  followup_type text not null,
  due_date date not null,
  status text not null default 'pending',
  outcome text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  activity_type text not null,
  activity_date timestamptz not null default now(),
  details text
);

create index if not exists idx_people_status on people(status);
create index if not exists idx_followups_due on followups(status, due_date);
create index if not exists idx_activities_date on activities(activity_date desc);
