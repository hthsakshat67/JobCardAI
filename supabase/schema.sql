-- Run this migration in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  service_date date,
  status text not null default 'draft' check (status in ('draft', 'review', 'completed')),
  summary text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_owner_date_idx on public.jobs(owner_id, service_date desc, created_at desc);
alter table public.jobs enable row level security;

drop policy if exists "jobs owner read" on public.jobs;
drop policy if exists "jobs owner insert" on public.jobs;
drop policy if exists "jobs owner update" on public.jobs;
drop policy if exists "jobs owner delete" on public.jobs;
create policy "jobs owner read" on public.jobs for select using (auth.uid() = owner_id);
create policy "jobs owner insert" on public.jobs for insert with check (auth.uid() = owner_id);
create policy "jobs owner update" on public.jobs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "jobs owner delete" on public.jobs for delete using (auth.uid() = owner_id);

create or replace function public.set_job_owner() returns trigger language plpgsql security invoker as $$
begin
  new.owner_id := auth.uid();
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists jobs_owner_trigger on public.jobs;
create trigger jobs_owner_trigger before insert or update on public.jobs for each row execute function public.set_job_owner();

alter table public.jobs replica identity full;
do $$ begin alter publication supabase_realtime add table public.jobs; exception when duplicate_object then null; end $$;
