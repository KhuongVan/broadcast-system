-- ============================================================
-- Emergency Broadcast Feature Migration
-- ============================================================

-- 1. Emergency Sources table
create table if not exists emergency_sources (
  source_id   uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_emergency_sources_sort
on emergency_sources(sort_order asc, created_at asc);

-- 2. Emergency Broadcast Sessions table
create table if not exists emergency_broadcast_sessions (
  session_id          uuid primary key default gen_random_uuid(),
  source_id           uuid references emergency_sources(source_id) on delete set null,
  source_name         text not null,
  source_url          text not null,
  target_device_ids   jsonb not null default '[]'::jsonb,
  target_label        text not null,
  duration_minutes    int  not null,
  started_by          text,
  started_at          timestamptz not null default now(),
  scheduled_end_at    timestamptz not null,
  ended_at            timestamptz,
  status              text not null default 'ACTIVE'
                        check (status in ('ACTIVE', 'FINISHED', 'CANCELLED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_emergency_broadcast_sessions_status
on emergency_broadcast_sessions(status);

create index if not exists idx_emergency_broadcast_sessions_started_at
on emergency_broadcast_sessions(started_at desc);

-- 3. Update device_commands to allow emergency command types
alter table device_commands
drop constraint if exists device_commands_type_check;

alter table device_commands
add constraint device_commands_type_check
  check (type in (
    'SET_VOLUME',
    'START_RECORDING',
    'STOP_RECORDING',
    'PLAY_SCHEDULE',
    'STOP_PLAYBACK',
    'PLAY_EMERGENCY',
    'STOP_EMERGENCY'
  ));
