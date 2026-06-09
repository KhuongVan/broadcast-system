create table if not exists audio_files (
  file_id uuid primary key,
  original_name text not null,
  storage_path text not null unique,
  size bigint not null,
  mimetype text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists playlists (
  playlist_id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists playlist_items (
  playlist_item_id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(playlist_id) on delete cascade,
  file_id uuid not null references audio_files(file_id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_playlist_items_playlist_id
on playlist_items(playlist_id);

create unique index if not exists idx_playlist_items_unique_order
on playlist_items(playlist_id, sort_order);

create table if not exists broadcast_schedules (
  schedule_id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('FILE', 'RTSP')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL', 'EMERGENCY')),
  playlist_id uuid references playlists(playlist_id) on delete set null,
  file_id uuid references audio_files(file_id) on delete set null,
  file_mode text check (file_mode in ('PLAYLIST', 'SINGLE_FILE')),
  rtsp_url text,
  start_date date not null,
  start_time time not null,
  end_time time not null,
  repeat_type text not null default 'ONCE' check (repeat_type in ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_schedules_time_check check (end_time > start_time),
  constraint broadcast_schedules_source_check check (
    (source_type = 'FILE' and playlist_id is not null and file_mode is not null)
    or
    (source_type = 'RTSP' and rtsp_url is not null)
  )
);

create index if not exists idx_broadcast_schedules_enabled
on broadcast_schedules(enabled);

create index if not exists idx_broadcast_schedules_time
on broadcast_schedules(start_date, start_time, end_time);

create table if not exists schedule_run_logs (
  run_log_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references broadcast_schedules(schedule_id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('STARTED', 'FINISHED', 'FAILED', 'SKIPPED')),
  message text
);

create index if not exists idx_schedule_run_logs_schedule_id
on schedule_run_logs(schedule_id);

create table if not exists live_broadcast_sessions (
  session_id uuid primary key default gen_random_uuid(),
  title text not null,
  target_type text not null check (target_type in ('AREA', 'DEVICE')),
  target_area text,
  target_device_ids jsonb not null default '[]'::jsonb,
  target_label text not null,
  mic_label text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('STARTED', 'FINISHED', 'FAILED', 'DELETED')),
  started_by text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_broadcast_sessions_started_at
on live_broadcast_sessions(started_at desc);

create index if not exists idx_live_broadcast_sessions_status
on live_broadcast_sessions(status);

create table if not exists devices (
  device_id uuid primary key default gen_random_uuid(),
  name text not null,
  mac_address text not null unique,
  android_id text,
  device_token_hash text,
  area text not null,
  connection_type text not null default '4G' check (connection_type in ('LAN', '4G')),
  online boolean not null default false,
  last_seen_at timestamptz,
  play_allowed boolean not null default true,
  play_status text not null default 'IDLE' check (play_status in ('IDLE', 'PLAYING', 'STOPPED', 'ERROR')),
  current_schedule_id uuid references broadcast_schedules(schedule_id) on delete set null,
  app_version text,
  network_type text,
  battery_level integer,
  playback_message text,
  playback_position_seconds integer,
  playback_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table devices
add column if not exists android_id text;

alter table devices
add column if not exists device_token_hash text;

alter table devices
add column if not exists play_status text not null default 'IDLE';

alter table devices
add column if not exists current_schedule_id uuid references broadcast_schedules(schedule_id) on delete set null;

alter table devices
add column if not exists app_version text;

alter table devices
add column if not exists network_type text;

alter table devices
add column if not exists battery_level integer;

alter table devices
add column if not exists playback_message text;

alter table devices
add column if not exists playback_position_seconds integer;

alter table devices
add column if not exists playback_updated_at timestamptz;

alter table devices
add column if not exists deleted_at timestamptz;

alter table devices
add column if not exists latitude double precision;

alter table devices
add column if not exists longitude double precision;

alter table devices
drop constraint if exists devices_mac_address_key;

create unique index if not exists idx_devices_mac_address_active_unique
on devices(mac_address)
where deleted_at is null;

create unique index if not exists idx_devices_android_id_active_unique
on devices(android_id)
where android_id is not null and deleted_at is null;

create index if not exists idx_devices_device_token_hash
on devices(device_token_hash)
where device_token_hash is not null and deleted_at is null;

alter table devices
drop constraint if exists devices_play_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'devices_play_status_check'
  ) then
    alter table devices
    add constraint devices_play_status_check check (play_status in ('IDLE', 'PLAYING', 'STOPPED', 'ERROR'));
  end if;
end $$;

create index if not exists idx_devices_area
on devices(area);

create index if not exists idx_devices_online
on devices(online);

create index if not exists idx_devices_deleted_at
on devices(deleted_at);

create table if not exists device_mic_test_uploads (
  upload_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(device_id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mimetype text not null,
  size bigint not null,
  duration_seconds int,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_mic_test_uploads_device_created
on device_mic_test_uploads(device_id, created_at desc);

create table if not exists device_schedule_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(device_id) on delete cascade,
  schedule_id uuid not null references broadcast_schedules(schedule_id) on delete cascade,
  sync_status text not null default 'PENDING' check (sync_status in ('PENDING', 'SYNCED', 'FAILED')),
  last_synced_at timestamptz,
  sync_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_schedule_assignments_device_unique unique (device_id)
);

create index if not exists idx_device_schedule_assignments_schedule_id
on device_schedule_assignments(schedule_id);

insert into devices (device_id, name, mac_address, area, connection_type, online, last_seen_at, play_allowed, play_status, latitude, longitude)
values
  ('11111111-1111-1111-1111-111111111111', 'Loa Thôn 1', '22:22:E5:6C:16:F4', 'Thôn 1', '4G', true, now() - interval '2 minutes', true, 'IDLE', 11.0168, 106.6293),
  ('22222222-2222-2222-2222-222222222222', 'Loa Thôn 5', '22:22:60:29:5D:E3', 'Thôn 5', 'LAN', true, now() - interval '8 minutes', true, 'IDLE', 10.9804, 106.6519),
  ('33333333-3333-3333-3333-333333333333', 'Loa Thôn 9', '22:22:9A:47:10:B8', 'Thôn 9', '4G', false, now() - interval '45 minutes', false, 'STOPPED', 10.9488, 106.6127)
on conflict (device_id) do nothing;

insert into broadcast_schedules (
  schedule_id,
  name,
  source_type,
  priority,
  playlist_id,
  file_id,
  file_mode,
  rtsp_url,
  start_date,
  start_time,
  end_time,
  repeat_type,
  enabled
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Tiếp sóng bản tin xã buổi sáng',
    'RTSP',
    'NORMAL',
    null,
    null,
    null,
    'https://example.com/radio/ban-tin-sang.m3u8',
    current_date,
    '06:00',
    '06:30',
    'DAILY',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Tiếp sóng thông báo huyện',
    'RTSP',
    'NORMAL',
    null,
    null,
    null,
    'rtsp://stream.example.com/huyen',
    current_date,
    '17:30',
    '18:00',
    'DAILY',
    true
  )
on conflict (schedule_id) do nothing;

insert into device_schedule_assignments (device_id, schedule_id, sync_status, last_synced_at, sync_message)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SYNCED', now() - interval '1 hour', 'Da tai lich xuong thiet bi demo.'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'FAILED', null, 'Thiet bi dang mat ket noi.')
on conflict (device_id) do nothing;
