create table if not exists public.login_attempts (
    id uuid primary key default gen_random_uuid(),
    email_normalized text not null,
    ip_address text not null,
    failure_count integer not null default 0,
    locked_until timestamptz,
    last_attempt_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint login_attempts_failure_count_nonnegative check (failure_count >= 0),
    constraint login_attempts_email_ip_unique unique (email_normalized, ip_address)
);

create index if not exists login_attempts_locked_until_idx
    on public.login_attempts (locked_until);
