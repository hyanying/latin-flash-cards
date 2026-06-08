-- ============================================================
-- LATIN FLASH CARDS — Supabase schema
-- Run this in your Supabase project: SQL Editor > New query
-- ============================================================

-- Categories table
create table categories (
  id    serial primary key,
  name  text   not null unique,
  pos   integer not null default 0
);

-- Cards table
create table cards (
  id          text    primary key,
  latin       text    not null,
  english     text    not null,
  notes       text    not null default '',
  categories  text[]  not null default '{}',
  has_audio   boolean not null default false,
  audio_path  text,
  created_at  bigint  not null default extract(epoch from now()) * 1000
);

-- Enable Row Level Security
alter table categories enable row level security;
alter table cards      enable row level security;

-- Allow full public access (personal app — protected by obscurity of the URL)
create policy "public access" on categories for all to anon using (true) with check (true);
create policy "public access" on cards      for all to anon using (true) with check (true);

-- ============================================================
-- Migration: run this if you already created the cards table
-- ============================================================

alter table cards add column if not exists part_of_speech text;
alter table cards add column if not exists noun_case      text;
alter table cards add column if not exists noun_number    text;
alter table cards add column if not exists noun_gender    text;

-- ============================================================
-- Storage: run after creating the "audio" bucket in the dashboard
-- Storage > New bucket > name: audio > Public bucket: ON
-- Then run these policies:
-- ============================================================

create policy "public upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'audio');

create policy "public delete"
  on storage.objects for delete to anon
  using (bucket_id = 'audio');
