create extension if not exists pgcrypto;

create table if not exists public.contact_messages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default timezone('utc', now()),
    email text not null,
    name text,
    category text not null check (category in ('bug', 'question', 'feature', 'other')),
    subject text not null check (char_length(subject) <= 60),
    message text not null check (char_length(message) <= 2000),
    attachments jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    status text not null default 'new' check (status in ('new', 'triage', 'replied', 'closed')),
    notion_sync_status text not null default 'pending' check (notion_sync_status in ('pending', 'synced', 'failed')),
    notion_page_id text,
    notion_sync_error text
);

alter table public.contact_messages
    add column if not exists notion_sync_status text not null default 'pending';

alter table public.contact_messages
    add column if not exists notion_page_id text;

alter table public.contact_messages
    add column if not exists notion_sync_error text;

alter table public.contact_messages enable row level security;

drop policy if exists "Anyone can insert contact messages" on public.contact_messages;
create policy "Anyone can insert contact messages"
on public.contact_messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "No direct reads for contact messages" on public.contact_messages;
create policy "No direct reads for contact messages"
on public.contact_messages
for select
to anon, authenticated
using (false);

drop policy if exists "No direct updates for contact messages" on public.contact_messages;
create policy "No direct updates for contact messages"
on public.contact_messages
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct deletes for contact messages" on public.contact_messages;
create policy "No direct deletes for contact messages"
on public.contact_messages
for delete
to anon, authenticated
using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'contact-attachments',
    'contact-attachments',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload contact attachments" on storage.objects;
create policy "Anyone can upload contact attachments"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'contact-attachments');

drop policy if exists "Anyone can view contact attachments" on storage.objects;
create policy "Anyone can view contact attachments"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'contact-attachments');

drop policy if exists "Anyone can update contact attachments" on storage.objects;
create policy "Anyone can update contact attachments"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'contact-attachments')
with check (bucket_id = 'contact-attachments');

drop policy if exists "Anyone can delete contact attachments" on storage.objects;
create policy "Anyone can delete contact attachments"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'contact-attachments');
