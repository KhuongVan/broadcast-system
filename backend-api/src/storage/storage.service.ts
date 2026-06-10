import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import WebSocket from 'ws';
import { AudioFileRecord } from '../audio-files/audio-file.types';
import { config } from '../config';
import { DeviceInput, DevicePlayStatus, DeviceRecord, DeviceSyncStatus } from '../devices/device.types';
import { LiveBroadcastCreateInput, LiveBroadcastRecord, LiveBroadcastStatus } from '../live-broadcasts/live-broadcast.types';
import { PlaylistItemRecord, PlaylistRecord } from '../playlists/playlist.types';
import { BroadcastScheduleRecord, ScheduleInput, ScheduleRunLogRecord } from '../schedules/schedule.types';

type AudioFileRow = {
  file_id: string;
  original_name: string;
  storage_path: string;
  size: number;
  mimetype: string;
  created_at: string;
  updated_at: string;
};

type PlaylistRow = {
  playlist_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type PlaylistItemRow = {
  playlist_item_id: string;
  playlist_id: string;
  file_id: string;
  sort_order: number;
  created_at: string;
  audio_files: AudioFileRow | AudioFileRow[];
};

type BroadcastScheduleRow = {
  schedule_id: string;
  name: string;
  source_type: 'FILE' | 'RTSP';
  priority: 'NORMAL' | 'EMERGENCY';
  playlist_id: string | null;
  file_id: string | null;
  file_mode: 'PLAYLIST' | 'SINGLE_FILE' | null;
  rtsp_url: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  repeat_type: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ScheduleRunLogRow = {
  run_log_id: string;
  schedule_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'STARTED' | 'FINISHED' | 'FAILED' | 'SKIPPED';
  message: string | null;
};

type DeviceRow = {
  device_id: string;
  name: string;
  mac_address: string;
  sim_number: string | null;
  android_id: string | null;
  device_token_hash: string | null;
  area: string;
  connection_type: 'LAN' | '4G';
  online: boolean;
  last_seen_at: string | null;
  play_allowed: boolean;
  play_status: DevicePlayStatus;
  current_schedule_id: string | null;
  app_version: string | null;
  network_type: string | null;
  battery_level: number | null;
  playback_message: string | null;
  playback_position_seconds: number | null;
  playback_updated_at: string | null;
  latitude: number | null;
  longitude: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type DeviceScheduleAssignmentRow = {
  assignment_id: string;
  device_id: string;
  schedule_id: string;
  sync_status: DeviceSyncStatus;
  last_synced_at: string | null;
  sync_message: string | null;
  created_at: string;
  updated_at: string;
};

type DeviceMicTestUploadRow = {
  upload_id: string;
  device_id: string;
  file_name: string;
  storage_path: string;
  mimetype: string;
  size: number;
  duration_seconds: number | null;
  message: string | null;
  created_at: string;
};

type LiveBroadcastSessionRow = {
  session_id: string;
  title: string;
  target_type: 'AREA' | 'DEVICE';
  target_area: string | null;
  target_device_ids: string[] | null;
  target_label: string;
  mic_label: string | null;
  started_at: string;
  ended_at: string | null;
  status: LiveBroadcastStatus;
  started_by: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type DeviceClientSchedulePayload = {
  assignment: {
    syncStatus: DeviceSyncStatus;
    lastSyncedAt: string | null;
    syncMessage: string | null;
  } | null;
  schedule: BroadcastScheduleRecord | null;
  playlist: PlaylistRecord | null;
  file: AudioFileRecord | null;
};

export type DeviceMicTestUploadRecord = {
  uploadId: string;
  deviceId: string;
  fileName: string;
  storagePath: string;
  mimetype: string;
  size: number;
  durationSeconds: number | null;
  message: string | null;
  createdAt: string;
  url: string;
};

@Injectable()
export class StorageService {
  private readonly supabase: SupabaseClient;
  private readonly bucket = config.supabaseAudioBucket;

  constructor() {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY.');
    }

    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: WebSocket as any,
      },
    });
  }

  async listFiles() {
    const { data, error } = await this.supabase
      .from('audio_files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Khong doc duoc audio_files: ${error.message}`);
    }

    return Promise.all(((data || []) as AudioFileRow[]).map((row) => this.toRecordWithSignedUrl(row)));
  }

  async getFile(fileId: string) {
    const { data, error } = await this.supabase
      .from('audio_files')
      .select('*')
      .eq('file_id', fileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc audio file: ${error.message}`);
    }

    return data ? this.toRecordWithSignedUrl(data as AudioFileRow) : null;
  }

  async uploadAudioFile(file: Express.Multer.File) {
    if (!file.buffer) {
      throw new Error('Upload phai dung memory storage de gui len Supabase.');
    }

    const fileId = randomUUID();
    const ext = extname(file.originalname).toLowerCase() || '.mp3';
    const storagePath = `audio/${fileId}${ext}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || 'audio/mpeg',
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Khong upload duoc Supabase Storage: ${uploadError.message}`);
    }

    const now = new Date().toISOString();
    const row: AudioFileRow = {
      file_id: fileId,
      original_name: file.originalname,
      storage_path: storagePath,
      size: file.size,
      mimetype: file.mimetype || 'audio/mpeg',
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await this.supabase.from('audio_files').insert(row);

    if (insertError) {
      await this.supabase.storage.from(this.bucket).remove([storagePath]);
      throw new Error(`Khong ghi metadata audio_files: ${insertError.message}`);
    }

    return this.toRecordWithSignedUrl(row);
  }

  async uploadDeviceMicTest(input: {
    deviceId: string;
    file: Express.Multer.File;
    fileName: string;
    extension: string;
    durationSeconds: number | null;
    message: string | null;
  }) {
    if (!input.file.buffer) {
      throw new Error('Upload phai dung memory storage de gui len Supabase.');
    }

    const uploadId = randomUUID();
    const extension = input.extension.startsWith('.') ? input.extension : `.${input.extension}`;
    const storagePath = `mic-tests/${input.deviceId}/${uploadId}${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, input.file.buffer, {
        contentType: input.file.mimetype || 'application/octet-stream',
        cacheControl: '86400',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Khong upload duoc file test mic: ${uploadError.message}`);
    }

    const now = new Date().toISOString();
    const row: DeviceMicTestUploadRow = {
      upload_id: uploadId,
      device_id: input.deviceId,
      file_name: input.fileName,
      storage_path: storagePath,
      mimetype: input.file.mimetype || 'application/octet-stream',
      size: input.file.size,
      duration_seconds: input.durationSeconds,
      message: input.message,
      created_at: now,
    };

    const { error: insertError } = await this.supabase.from('device_mic_test_uploads').insert(row);

    if (insertError) {
      await this.supabase.storage.from(this.bucket).remove([storagePath]);
      throw new Error(`Khong ghi metadata test mic: ${insertError.message}`);
    }

    return this.toDeviceMicTestUploadRecord(row);
  }

  async createSignedUrl(storagePath: string) {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, config.signedUrlTtlSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Khong tao duoc signed URL: ${error?.message || 'unknown error'}`);
    }

    return data.signedUrl;
  }

  private async toDeviceMicTestUploadRecord(row: DeviceMicTestUploadRow): Promise<DeviceMicTestUploadRecord> {
    return {
      uploadId: row.upload_id,
      deviceId: row.device_id,
      fileName: row.file_name,
      storagePath: row.storage_path,
      mimetype: row.mimetype,
      size: Number(row.size),
      durationSeconds: row.duration_seconds,
      message: row.message,
      createdAt: row.created_at,
      url: await this.createSignedUrl(row.storage_path),
    };
  }

  async listPlaylists() {
    const { data, error } = await this.supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Khong doc duoc playlists: ${error.message}`);
    }

    return Promise.all(((data || []) as PlaylistRow[]).map((row) => this.toPlaylistRecord(row)));
  }

  async getPlaylist(playlistId: string) {
    const { data, error } = await this.supabase
      .from('playlists')
      .select('*')
      .eq('playlist_id', playlistId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc playlist: ${error.message}`);
    }

    return data ? this.toPlaylistRecord(data as PlaylistRow) : null;
  }

  async createPlaylist(name: string) {
    const { data, error } = await this.supabase
      .from('playlists')
      .insert({ name })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Khong tao duoc playlist: ${error.message}`);
    }

    return this.toPlaylistRecord(data as PlaylistRow);
  }

  async updatePlaylist(playlistId: string, name: string) {
    const { data, error } = await this.supabase
      .from('playlists')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('playlist_id', playlistId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc playlist: ${error.message}`);
    }

    return data ? this.toPlaylistRecord(data as PlaylistRow) : null;
  }

  async deletePlaylist(playlistId: string) {
    const { error } = await this.supabase.from('playlists').delete().eq('playlist_id', playlistId);
    if (error) {
      throw new Error(`Khong xoa duoc playlist: ${error.message}`);
    }
  }

  async addPlaylistItem(playlistId: string, fileId: string) {
    const { data: lastItems, error: lastItemError } = await this.supabase
      .from('playlist_items')
      .select('sort_order')
      .eq('playlist_id', playlistId)
      .order('sort_order', { ascending: false })
      .limit(1);

    if (lastItemError) {
      throw new Error(`Khong doc duoc thu tu playlist_items: ${lastItemError.message}`);
    }

    const lastSortOrder = Array.isArray(lastItems) && lastItems[0] ? Number(lastItems[0].sort_order) : -1;
    const { error } = await this.supabase.from('playlist_items').insert({
      playlist_id: playlistId,
      file_id: fileId,
      sort_order: lastSortOrder + 1,
    });

    if (error) {
      throw new Error(`Khong them file vao playlist: ${error.message}`);
    }

    const playlist = await this.getPlaylist(playlistId);
    if (!playlist) {
      throw new Error('Khong tim thay playlist sau khi them file.');
    }
    return playlist;
  }

  async deletePlaylistItem(playlistItemId: string) {
    const { error } = await this.supabase
      .from('playlist_items')
      .delete()
      .eq('playlist_item_id', playlistItemId);

    if (error) {
      throw new Error(`Khong xoa duoc file khoi playlist: ${error.message}`);
    }
  }

  async listSchedules() {
    const { data, error } = await this.supabase
      .from('broadcast_schedules')
      .select('*')
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      throw new Error(`Khong doc duoc broadcast_schedules: ${error.message}`);
    }

    return ((data || []) as BroadcastScheduleRow[]).map((row) => this.toScheduleRecord(row));
  }

  async getSchedule(scheduleId: string) {
    const { data, error } = await this.supabase
      .from('broadcast_schedules')
      .select('*')
      .eq('schedule_id', scheduleId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc lich phat: ${error.message}`);
    }

    return data ? this.toScheduleRecord(data as BroadcastScheduleRow) : null;
  }

  async createSchedule(input: Required<ScheduleInput>) {
    const { data, error } = await this.supabase
      .from('broadcast_schedules')
      .insert(this.toScheduleRowInput(input))
      .select('*')
      .single();

    if (error) {
      throw new Error(`Khong tao duoc lich phat: ${error.message}`);
    }

    return this.toScheduleRecord(data as BroadcastScheduleRow);
  }

  async updateSchedule(scheduleId: string, input: Required<ScheduleInput>) {
    const { data, error } = await this.supabase
      .from('broadcast_schedules')
      .update({ ...this.toScheduleRowInput(input), updated_at: new Date().toISOString() })
      .eq('schedule_id', scheduleId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc lich phat: ${error.message}`);
    }

    return data ? this.toScheduleRecord(data as BroadcastScheduleRow) : null;
  }

  async deleteSchedule(scheduleId: string) {
    const { error } = await this.supabase.from('broadcast_schedules').delete().eq('schedule_id', scheduleId);
    if (error) {
      throw new Error(`Khong xoa duoc lich phat: ${error.message}`);
    }
  }

  async createScheduleRunLog(
    scheduleId: string,
    status: 'STARTED' | 'FINISHED' | 'FAILED' | 'SKIPPED',
    message: string | null,
  ) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('schedule_run_logs')
      .insert({
        schedule_id: scheduleId,
        started_at: now,
        ended_at: status === 'STARTED' ? null : now,
        status,
        message,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Khong ghi duoc schedule_run_logs: ${error.message}`);
    }

    return this.toScheduleRunLogRecord(data as ScheduleRunLogRow);
  }

  async listLiveBroadcastSessions() {
    const { data, error } = await this.supabase
      .from('live_broadcast_sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (error) {
      throw new Error(`Khong doc duoc live_broadcast_sessions: ${error.message}`);
    }

    return ((data || []) as LiveBroadcastSessionRow[]).map((row) => this.toLiveBroadcastRecord(row));
  }

  async createLiveBroadcastSession(input: LiveBroadcastCreateInput) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('live_broadcast_sessions')
      .insert({
        title: input.title,
        target_type: input.targetType,
        target_area: input.targetArea || null,
        target_device_ids: input.targetDeviceIds || [],
        target_label: input.targetLabel,
        mic_label: input.micLabel || null,
        started_at: now,
        ended_at: null,
        status: 'STARTED',
        started_by: input.startedBy || null,
        message: null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Khong tao duoc live_broadcast_sessions: ${error.message}`);
    }

    return this.toLiveBroadcastRecord(data as LiveBroadcastSessionRow);
  }

  async finishLiveBroadcastSession(sessionId: string, status: Exclude<LiveBroadcastStatus, 'STARTED'>, message?: string | null) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('live_broadcast_sessions')
      .update({
        ended_at: now,
        status,
        message: message || null,
        updated_at: now,
      })
      .eq('session_id', sessionId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc live_broadcast_sessions: ${error.message}`);
    }

    return data ? this.toLiveBroadcastRecord(data as LiveBroadcastSessionRow) : null;
  }

  async listDevices() {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .is('deleted_at', null)
      .order('area', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Khong doc duoc devices: ${error.message}`);
    }

    return Promise.all(((data || []) as DeviceRow[]).map((row) => this.toDeviceRecord(row)));
  }

  async getDevice(deviceId: string) {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc thiet bi: ${error.message}`);
    }

    return data ? this.toDeviceRecord(data as DeviceRow) : null;
  }

  async findDeviceForClientRegistration(input: { androidId?: string | null; macAddress?: string | null }) {
    const androidId = (input.androidId || '').trim();
    const macAddress = (input.macAddress || '').trim().toUpperCase();

    if (androidId) {
      const { data, error } = await this.supabase
        .from('devices')
        .select('*')
        .eq('android_id', androidId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(`Khong doc duoc thiet bi theo Android ID: ${error.message}`);
      if (data) return this.toDeviceRecord(data as DeviceRow);
    }

    if (macAddress) {
      const { data, error } = await this.supabase
        .from('devices')
        .select('*')
        .eq('mac_address', macAddress)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(`Khong doc duoc thiet bi theo MAC: ${error.message}`);
      if (data) return this.toDeviceRecord(data as DeviceRow);
    }

    return null;
  }

  async createDevice(input: DeviceInput) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('devices')
      .insert({
        name: input.name,
        mac_address: input.macAddress,
        sim_number: input.simNumber,
        area: input.area,
        connection_type: input.connectionType,
        latitude: input.latitude,
        longitude: input.longitude,
        online: false,
        last_seen_at: null,
        play_allowed: true,
        play_status: 'IDLE',
        current_schedule_id: null,
        deleted_at: null,
        updated_at: now,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong tao duoc thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tao duoc thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async createDeviceClient(input: {
    androidId: string | null;
    macAddress: string;
    name: string;
    connectionType: 'LAN' | '4G';
    appVersion: string | null;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('devices')
      .insert({
        name: input.name,
        mac_address: input.macAddress,
        android_id: input.androidId,
        area: 'Chưa phân khu',
        connection_type: input.connectionType,
        online: true,
        last_seen_at: now,
        play_allowed: true,
        play_status: 'IDLE',
        current_schedule_id: null,
        app_version: input.appVersion,
        deleted_at: null,
        updated_at: now,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong tao duoc thiet bi Android: ${error.message}`);
    }

    if (!data) throw new Error('Khong tao duoc thiet bi Android.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async saveDeviceClientToken(deviceId: string, tokenHash: string) {
    const { data, error } = await this.supabase
      .from('devices')
      .update({ device_token_hash: tokenHash, updated_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Khong luu duoc token thiet bi: ${error.message}`);
    if (!data) throw new Error('Khong tim thay thiet bi de luu token.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async updateDeviceClientRegistration(
    deviceId: string,
    input: { androidId?: string | null; appVersion?: string | null },
  ) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      online: true,
      last_seen_at: now,
      updated_at: now,
    };

    if (input.androidId) update.android_id = input.androidId;
    if (input.appVersion !== undefined) update.app_version = input.appVersion;

    const { data, error } = await this.supabase
      .from('devices')
      .update(update)
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Khong cap nhat duoc dang ky thiet bi: ${error.message}`);
    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async getDeviceByClientTokenHash(tokenHash: string) {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .eq('device_token_hash', tokenHash)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(`Khong xac thuc duoc token thiet bi: ${error.message}`);
    return data ? this.toDeviceRecord(data as DeviceRow) : null;
  }

  async updateDevice(deviceId: string, input: DeviceInput) {
    const { data, error } = await this.supabase
      .from('devices')
      .update({
        name: input.name,
        mac_address: input.macAddress,
        sim_number: input.simNumber,
        area: input.area,
        connection_type: input.connectionType,
        latitude: input.latitude,
        longitude: input.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async softDeleteDevice(deviceId: string) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('devices')
      .update({
        deleted_at: now,
        online: false,
        play_status: 'STOPPED',
        current_schedule_id: null,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong xoa duoc thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async updateDevicePlayAllowed(deviceId: string, playAllowed: boolean) {
    const { data, error } = await this.supabase
      .from('devices')
      .update({ play_allowed: playAllowed, updated_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc quyen phat cua thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async updateDevicePlayback(
    deviceId: string,
    input: {
      playStatus: DevicePlayStatus;
      currentScheduleId: string | null;
      playbackMessage?: string | null;
      playbackPositionSeconds?: number | null;
    },
  ) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      play_status: input.playStatus,
      current_schedule_id: input.currentScheduleId,
      playback_updated_at: now,
      updated_at: now,
    };

    if (input.playbackMessage !== undefined) update.playback_message = input.playbackMessage;
    if (input.playbackPositionSeconds !== undefined) update.playback_position_seconds = input.playbackPositionSeconds;

    const { data, error } = await this.supabase
      .from('devices')
      .update(update)
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc trang thai phat cua thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async updateDeviceClientHeartbeat(
    deviceId: string,
    input: {
      appVersion?: string | null;
      networkType?: string | null;
      batteryLevel?: number | null;
    },
  ) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      online: true,
      last_seen_at: now,
      updated_at: now,
    };

    if (input.appVersion !== undefined) update.app_version = input.appVersion;
    if (input.networkType !== undefined) update.network_type = input.networkType;
    if (input.batteryLevel !== undefined) update.battery_level = input.batteryLevel;

    const { data, error } = await this.supabase
      .from('devices')
      .update(update)
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Khong cap nhat duoc heartbeat thiet bi: ${error.message}`);
    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async syncDeviceSchedule(
    deviceId: string,
    scheduleId: string,
    result: { syncStatus: DeviceSyncStatus; syncMessage: string },
  ) {
    const now = new Date().toISOString();
    const { error } = await this.supabase.from('device_schedule_assignments').upsert(
      {
        device_id: deviceId,
        schedule_id: scheduleId,
        sync_status: result.syncStatus,
        sync_message: result.syncMessage,
        last_synced_at: result.syncStatus === 'SYNCED' ? now : null,
        updated_at: now,
      },
      { onConflict: 'device_id' },
    );

    if (error) {
      throw new Error(`Khong tai lich xuong thiet bi: ${error.message}`);
    }

    const device = await this.getDevice(deviceId);
    if (!device) throw new Error('Khong tim thay thiet bi sau khi dong bo.');
    return device;
  }

  async getDeviceClientSchedule(deviceId: string): Promise<DeviceClientSchedulePayload> {
    const assignment = await this.getDeviceAssignment(deviceId);
    if (!assignment) {
      return { assignment: null, schedule: null, playlist: null, file: null };
    }

    const schedule = await this.getSchedule(assignment.schedule_id);
    if (!schedule) {
      return {
        assignment: {
          syncStatus: assignment.sync_status,
          lastSyncedAt: assignment.last_synced_at,
          syncMessage: assignment.sync_message,
        },
        schedule: null,
        playlist: null,
        file: null,
      };
    }

    const playlist = schedule.sourceType === 'FILE' && schedule.playlistId
      ? await this.getPlaylist(schedule.playlistId)
      : null;
    const file = schedule.sourceType === 'FILE' && schedule.fileId
      ? await this.getFile(schedule.fileId)
      : null;

    return {
      assignment: {
        syncStatus: assignment.sync_status,
        lastSyncedAt: assignment.last_synced_at,
        syncMessage: assignment.sync_message,
      },
      schedule,
      playlist,
      file,
    };
  }

  private async toRecordWithSignedUrl(row: AudioFileRow): Promise<AudioFileRecord> {
    return {
      fileId: row.file_id,
      originalName: row.original_name,
      storagePath: row.storage_path,
      size: Number(row.size),
      mimetype: row.mimetype,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      url: await this.createSignedUrl(row.storage_path),
    };
  }

  private async toPlaylistRecord(row: PlaylistRow): Promise<PlaylistRecord> {
    const items = await this.listPlaylistItems(row.playlist_id);
    return {
      playlistId: row.playlist_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      totalFiles: items.length,
      totalSize: items.reduce((total, item) => total + item.file.size, 0),
      items,
    };
  }

  private async listPlaylistItems(playlistId: string): Promise<PlaylistItemRecord[]> {
    const { data, error } = await this.supabase
      .from('playlist_items')
      .select('playlist_item_id, playlist_id, file_id, sort_order, created_at, audio_files(*)')
      .eq('playlist_id', playlistId)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Khong doc duoc playlist_items: ${error.message}`);
    }

    return Promise.all(
      ((data || []) as unknown as PlaylistItemRow[]).map(async (row) => {
        const fileRow = Array.isArray(row.audio_files) ? row.audio_files[0] : row.audio_files;
        return {
          playlistItemId: row.playlist_item_id,
          playlistId: row.playlist_id,
          fileId: row.file_id,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          file: await this.toRecordWithSignedUrl(fileRow),
        };
      }),
    );
  }

  private toScheduleRowInput(input: Required<ScheduleInput>) {
    return {
      name: input.name,
      source_type: input.sourceType,
      priority: input.priority,
      playlist_id: input.playlistId,
      file_id: input.fileId,
      file_mode: input.fileMode,
      rtsp_url: input.rtspUrl,
      start_date: input.startDate,
      start_time: input.startTime,
      end_time: input.endTime,
      repeat_type: input.repeatType,
      enabled: input.enabled,
    };
  }

  private toScheduleRecord(row: BroadcastScheduleRow): BroadcastScheduleRecord {
    return {
      scheduleId: row.schedule_id,
      name: row.name,
      sourceType: row.source_type,
      priority: row.priority,
      playlistId: row.playlist_id,
      fileId: row.file_id,
      fileMode: row.file_mode,
      rtspUrl: row.rtsp_url,
      startDate: row.start_date,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      repeatType: row.repeat_type,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toScheduleRunLogRecord(row: ScheduleRunLogRow): ScheduleRunLogRecord {
    return {
      runLogId: row.run_log_id,
      scheduleId: row.schedule_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      message: row.message,
    };
  }

  private toLiveBroadcastRecord(row: LiveBroadcastSessionRow): LiveBroadcastRecord {
    return {
      sessionId: row.session_id,
      title: row.title,
      targetType: row.target_type,
      targetArea: row.target_area,
      targetDeviceIds: Array.isArray(row.target_device_ids) ? row.target_device_ids : [],
      targetLabel: row.target_label,
      micLabel: row.mic_label,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      startedBy: row.started_by,
      message: row.message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async toDeviceRecord(row: DeviceRow): Promise<DeviceRecord> {
    const assignment = await this.getDeviceAssignment(row.device_id);
    const activeSchedule = assignment ? await this.getSchedule(assignment.schedule_id) : null;
    const currentSchedule = row.current_schedule_id ? await this.getSchedule(row.current_schedule_id) : null;

    return {
      deviceId: row.device_id,
      name: row.name,
      macAddress: row.mac_address,
      simNumber: row.sim_number || null,
      androidId: row.android_id || null,
      area: row.area,
      connectionType: row.connection_type,
      online: row.online,
      lastSeenAt: row.last_seen_at,
      playAllowed: row.play_allowed,
      activeSchedule,
      currentSchedule,
      playStatus: row.play_status || 'IDLE',
      syncStatus: assignment?.sync_status || null,
      lastSyncedAt: assignment?.last_synced_at || null,
      syncMessage: assignment?.sync_message || null,
      appVersion: row.app_version || null,
      networkType: row.network_type || null,
      batteryLevel: row.battery_level ?? null,
      playbackMessage: row.playback_message || null,
      playbackPositionSeconds: row.playback_position_seconds ?? null,
      playbackUpdatedAt: row.playback_updated_at || null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async getDeviceAssignment(deviceId: string) {
    const { data, error } = await this.supabase
      .from('device_schedule_assignments')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc device_schedule_assignments: ${error.message}`);
    }

    return data ? (data as DeviceScheduleAssignmentRow) : null;
  }

}
