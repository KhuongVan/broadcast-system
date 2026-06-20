import { ConflictException, Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import WebSocket from 'ws';
import { AudioFileRecord } from '../audio-files/audio-file.types';
import { config } from '../config';
import {
  DeviceConnectionType,
  DeviceInput,
  DevicePlayStatus,
  DeviceScheduleAssignmentRecord,
  DeviceRecord,
  DeviceSyncStatus,
  DeviceVolumeSyncStatus,
} from '../devices/device.types';
import { EmergencyBroadcastRecord, EmergencyBroadcastStatus, EmergencyBroadcastStartInput } from '../emergency-broadcasts/emergency-broadcast.types';
import { EmergencySourceInput, EmergencySourceRecord } from '../emergency-sources/emergency-source.types';
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
  repeat_count: number | null;
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
  receiver_installed_date: string | null;
  sim_registered_date: string | null;
  android_id: string | null;
  device_token_hash: string | null;
  area: string;
  connection_type: DeviceConnectionType;
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
  volume_level: number | null;
  desired_volume_level: number | null;
  volume_sync_status: DeviceVolumeSyncStatus | null;
  volume_sync_message: string | null;
  volume_updated_at: string | null;
  latitude: number | null;
  longitude: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type DeviceCommandStatus = 'PENDING' | 'DELIVERED' | 'SUCCEEDED' | 'FAILED' | 'SUPERSEDED';
type DeviceCommandType =
  | 'SET_VOLUME'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PLAY_SCHEDULE'
  | 'STOP_PLAYBACK'
  | 'PLAY_EMERGENCY'
  | 'STOP_EMERGENCY';
type DeviceRecordingStatus = 'REQUESTED' | 'RECORDING' | 'STOP_REQUESTED' | 'UPLOADING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

type DeviceCommandRow = {
  command_id: string;
  device_id: string;
  type: DeviceCommandType;
  payload: Record<string, unknown>;
  status: DeviceCommandStatus;
  message: string | null;
  last_delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeviceCommandRecord = {
  commandId: string;
  deviceId: string;
  type: DeviceCommandType;
  payload: Record<string, unknown>;
  status: DeviceCommandStatus;
  message: string | null;
  lastDeliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

type DeviceRecordingSessionRow = {
  recording_id: string;
  device_id: string;
  status: DeviceRecordingStatus;
  recording_source?: 'MANUAL' | 'AUTO_PLAYBACK';
  schedule_id?: string | null;
  file_id?: string | null;
  playback_started_at?: string | null;
  playback_ended_at?: string | null;
  started_at: string | null;
  stopped_at: string | null;
  uploaded_at: string | null;
  duration_seconds: number | null;
  message: string | null;
  upload_id: string | null;
  created_at: string;
  updated_at: string;
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

type EmergencySourceRow = {
  source_id: string;
  name: string;
  url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type EmergencyBroadcastSessionRow = {
  session_id: string;
  source_id: string | null;
  source_name: string;
  source_url: string;
  target_device_ids: string[] | null;
  target_label: string;
  duration_minutes: number;
  started_by: string | null;
  started_at: string;
  scheduled_end_at: string;
  ended_at: string | null;
  status: EmergencyBroadcastStatus;
  created_at: string;
  updated_at: string;
};

export type DeviceClientSchedulePayload = {
  assignments: Array<{
    assignmentId: string;
    scheduleId: string;
    syncStatus: DeviceSyncStatus;
    lastSyncedAt: string | null;
    syncMessage: string | null;
  }>;
  schedules: BroadcastScheduleRecord[];
  playlistsByScheduleId: Record<string, PlaylistRecord | null>;
  filesByScheduleId: Record<string, AudioFileRecord | null>;
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

export type DeviceRecordingSessionRecord = {
  recordingId: string;
  deviceId: string;
  status: DeviceRecordingStatus;
  recordingSource: 'MANUAL' | 'AUTO_PLAYBACK';
  scheduleId: string | null;
  fileId: string | null;
  playbackStartedAt: string | null;
  playbackEndedAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  uploadedAt: string | null;
  durationSeconds: number | null;
  message: string | null;
  uploadId: string | null;
  audioUrl: string | null;
  fileName: string | null;
  mimetype: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
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
    recordingId?: string | null;
  }) {
    if (input.recordingId) {
      const recording = await this.getDeviceRecordingRow(input.deviceId, input.recordingId);
      if (!recording) throw new Error('Khong tim thay phien ghi am de upload file.');
    }

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

    if (input.recordingId) {
      await this.completeDeviceRecording(input.deviceId, input.recordingId, uploadId, input.durationSeconds, input.message);
    }

    return this.toDeviceMicTestUploadRecord(row);
  }

  async uploadDevicePlaybackRecording(input: {
    deviceId: string;
    file: Express.Multer.File;
    fileName: string;
    extension: string;
    durationSeconds: number | null;
    message: string | null;
    scheduleId: string | null;
    fileId: string | null;
    playbackStartedAt: string | null;
    playbackEndedAt: string | null;
  }) {
    if (!input.file.buffer) {
      throw new Error('Upload phai dung memory storage de gui len Supabase.');
    }

    const uploadId = randomUUID();
    const recordingId = randomUUID();
    const extension = input.extension.startsWith('.') ? input.extension : `.${input.extension}`;
    const dateFolder = new Date().toISOString().slice(0, 10);
    const safeBaseName = input.fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || uploadId;
    const storagePath = `recordings/${input.deviceId}/${dateFolder}/${safeBaseName}-${uploadId}${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, input.file.buffer, {
        contentType: input.file.mimetype || 'application/octet-stream',
        cacheControl: '86400',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Khong upload duoc file ghi am tu dong: ${uploadError.message}`);
    }

    const now = new Date().toISOString();
    const uploadRow: DeviceMicTestUploadRow = {
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

    const { error: uploadInsertError } = await this.supabase.from('device_mic_test_uploads').insert(uploadRow);

    if (uploadInsertError) {
      await this.supabase.storage.from(this.bucket).remove([storagePath]);
      throw new Error(`Khong ghi metadata file ghi am tu dong: ${uploadInsertError.message}`);
    }

    const recordingRow = {
      recording_id: recordingId,
      device_id: input.deviceId,
      status: 'COMPLETED',
      recording_source: 'AUTO_PLAYBACK',
      schedule_id: input.scheduleId,
      file_id: input.fileId,
      playback_started_at: input.playbackStartedAt,
      playback_ended_at: input.playbackEndedAt,
      started_at: input.playbackStartedAt || now,
      stopped_at: input.playbackEndedAt || now,
      uploaded_at: now,
      duration_seconds: input.durationSeconds,
      message: input.message || 'Thiet bi da tu dong upload file ghi am phat thanh.',
      upload_id: uploadId,
      updated_at: now,
    };

    const { data, error: recordingInsertError } = await this.supabase
      .from('device_recording_sessions')
      .insert(recordingRow)
      .select('*')
      .maybeSingle();

    if (recordingInsertError) {
      await this.supabase.storage.from(this.bucket).remove([storagePath]);
      throw new Error(`Khong ghi phien ghi am tu dong: ${recordingInsertError.message}`);
    }

    if (!data) throw new Error('Khong tao duoc phien ghi am tu dong.');
    return this.toDeviceRecordingSessionRecord(data as DeviceRecordingSessionRow);
  }

  async startDeviceRecording(deviceId: string, maxDurationSeconds: number) {
    await this.expireStaleDeviceRecordings(deviceId, maxDurationSeconds);
    const active = await this.getActiveDeviceRecording(deviceId);
    if (active) {
      throw new Error('Thiet bi dang co phien ghi am chua hoan tat.');
    }

    const now = new Date().toISOString();
    const recordingId = randomUUID();
    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .insert({
        recording_id: recordingId,
        device_id: deviceId,
        status: 'REQUESTED',
        message: 'Dang cho thiet bi bat dau ghi am.',
        updated_at: now,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong tao duoc phien ghi am: ${error.message}`);
    }

    const { error: commandError } = await this.supabase.from('device_commands').insert({
      device_id: deviceId,
      type: 'START_RECORDING',
      payload: { recordingId, maxDurationSeconds },
      status: 'PENDING',
      updated_at: now,
    });

    if (commandError) {
      throw new Error(`Khong tao duoc lenh ghi am: ${commandError.message}`);
    }

    if (!data) throw new Error('Khong tao duoc phien ghi am.');
    return this.toDeviceRecordingSessionRecord(data as DeviceRecordingSessionRow);
  }

  async stopDeviceRecording(deviceId: string, recordingId: string) {
    const now = new Date().toISOString();
    const recording = await this.getDeviceRecordingRow(deviceId, recordingId);
    if (!recording) throw new Error('Khong tim thay phien ghi am.');
    if (!['REQUESTED', 'RECORDING', 'STOP_REQUESTED', 'UPLOADING'].includes(recording.status)) {
      return this.toDeviceRecordingSessionRecord(recording);
    }

    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .update({
        status: recording.status === 'UPLOADING' ? 'UPLOADING' : 'STOP_REQUESTED',
        stopped_at: recording.stopped_at || now,
        message: recording.status === 'UPLOADING' ? recording.message : 'Dang yeu cau thiet bi dung ghi am.',
        updated_at: now,
      })
      .eq('recording_id', recordingId)
      .eq('device_id', deviceId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong dung duoc phien ghi am: ${error.message}`);
    }

    if (recording.status !== 'UPLOADING') {
      const { error: supersedeStartError } = await this.supabase
        .from('device_commands')
        .update({
          status: 'SUPERSEDED',
          message: 'Admin da yeu cau dung ghi am truoc khi lenh bat dau duoc xu ly.',
          completed_at: now,
          updated_at: now,
        })
        .eq('device_id', deviceId)
        .eq('type', 'START_RECORDING')
        .eq('status', 'PENDING')
        .contains('payload', { recordingId });

      if (supersedeStartError) {
        throw new Error(`Khong huy duoc lenh bat dau ghi am: ${supersedeStartError.message}`);
      }

      const { error: commandError } = await this.supabase.from('device_commands').insert({
        device_id: deviceId,
        type: 'STOP_RECORDING',
        payload: { recordingId },
        status: 'PENDING',
        updated_at: now,
      });

      if (commandError) {
        throw new Error(`Khong tao duoc lenh dung ghi am: ${commandError.message}`);
      }
    }

    if (!data) throw new Error('Khong tim thay phien ghi am.');
    return this.toDeviceRecordingSessionRecord(data as DeviceRecordingSessionRow);
  }

  async listDeviceRecordings(deviceId: string, limit = 10) {
    await this.expireStaleDeviceRecordings(deviceId);
    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Khong doc duoc danh sach ghi am: ${error.message}`);
    }

    return Promise.all(((data || []) as DeviceRecordingSessionRow[]).map((row) => this.toDeviceRecordingSessionRecord(row)));
  }

  async updateDeviceRecordingStatus(
    deviceId: string,
    recordingId: string,
    status: 'RECORDING' | 'UPLOADING' | 'FAILED',
    message: string | null,
  ) {
    const now = new Date().toISOString();
    const recording = await this.getDeviceRecordingRow(deviceId, recordingId);
    if (!recording) throw new Error('Khong tim thay phien ghi am.');

    const update: Record<string, unknown> = {
      status,
      message:
        message ||
        (status === 'RECORDING'
          ? 'Thiet bi dang ghi am.'
          : status === 'UPLOADING'
            ? 'Thiet bi dang upload file ghi am.'
            : 'Thiet bi ghi am that bai.'),
      updated_at: now,
    };

    if (status === 'RECORDING') update.started_at = recording.started_at || now;
    if (status === 'UPLOADING') update.stopped_at = recording.stopped_at || now;
    if (status === 'FAILED') update.stopped_at = recording.stopped_at || now;

    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .update(update)
      .eq('recording_id', recordingId)
      .eq('device_id', deviceId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc trang thai ghi am: ${error.message}`);
    }

    if (status === 'RECORDING') {
      await this.completeDeviceCommandByRecording(deviceId, recordingId, 'START_RECORDING', 'SUCCEEDED', message);
    }
    if (status === 'FAILED') {
      await this.completeDeviceCommandByRecording(deviceId, recordingId, 'START_RECORDING', 'FAILED', message);
    }
    if (status === 'UPLOADING' || status === 'FAILED') {
      await this.completeDeviceCommandByRecording(deviceId, recordingId, 'STOP_RECORDING', status === 'FAILED' ? 'FAILED' : 'SUCCEEDED', message);
    }

    if (!data) throw new Error('Khong tim thay phien ghi am.');
    return this.toDeviceRecordingSessionRecord(data as DeviceRecordingSessionRow);
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

  private async toDeviceRecordingSessionRecord(row: DeviceRecordingSessionRow): Promise<DeviceRecordingSessionRecord> {
    const upload = row.upload_id ? await this.getDeviceMicTestUploadRow(row.upload_id) : null;
    return {
      recordingId: row.recording_id,
      deviceId: row.device_id,
      status: row.status,
      recordingSource: row.recording_source || 'MANUAL',
      scheduleId: row.schedule_id || null,
      fileId: row.file_id || null,
      playbackStartedAt: row.playback_started_at || null,
      playbackEndedAt: row.playback_ended_at || null,
      startedAt: row.started_at,
      stoppedAt: row.stopped_at,
      uploadedAt: row.uploaded_at,
      durationSeconds: row.duration_seconds,
      message: row.message,
      uploadId: row.upload_id,
      audioUrl: upload ? await this.createSignedUrl(upload.storage_path) : null,
      fileName: upload?.file_name || null,
      mimetype: upload?.mimetype || null,
      size: upload ? Number(upload.size) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async getDeviceMicTestUploadRow(uploadId: string) {
    const { data, error } = await this.supabase
      .from('device_mic_test_uploads')
      .select('*')
      .eq('upload_id', uploadId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc file ghi am: ${error.message}`);
    }

    return data ? (data as DeviceMicTestUploadRow) : null;
  }

  private async getDeviceRecordingRow(deviceId: string, recordingId: string) {
    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .select('*')
      .eq('recording_id', recordingId)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc phien ghi am: ${error.message}`);
    }

    return data ? (data as DeviceRecordingSessionRow) : null;
  }

  private async getActiveDeviceRecording(deviceId: string) {
    const { data, error } = await this.supabase
      .from('device_recording_sessions')
      .select('*')
      .eq('device_id', deviceId)
      .in('status', ['REQUESTED', 'RECORDING', 'STOP_REQUESTED', 'UPLOADING'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc phien ghi am dang chay: ${error.message}`);
    }

    return data ? (data as DeviceRecordingSessionRow) : null;
  }

  private async expireStaleDeviceRecordings(deviceId: string, maxDurationSeconds = 60) {
    const expiresBefore = new Date(Date.now() - maxDurationSeconds * 1000).toISOString();
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('device_recording_sessions')
      .update({
        status: 'EXPIRED',
        stopped_at: now,
        message: 'Phien ghi am da tu dong het han.',
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .in('status', ['REQUESTED', 'RECORDING', 'STOP_REQUESTED'])
      .lt('created_at', expiresBefore);

    if (error) {
      throw new Error(`Khong cap nhat duoc phien ghi am het han: ${error.message}`);
    }
  }

  private async completeDeviceRecording(
    deviceId: string,
    recordingId: string,
    uploadId: string,
    durationSeconds: number | null,
    message: string | null,
  ) {
    const now = new Date().toISOString();
    const recording = await this.getDeviceRecordingRow(deviceId, recordingId);
    if (!recording) throw new Error('Khong tim thay phien ghi am de gan file.');

    const { error } = await this.supabase
      .from('device_recording_sessions')
      .update({
        status: 'COMPLETED',
        stopped_at: recording.stopped_at || now,
        uploaded_at: now,
        duration_seconds: durationSeconds,
        message: message || 'Da upload file ghi am.',
        upload_id: uploadId,
        updated_at: now,
      })
      .eq('recording_id', recordingId)
      .eq('device_id', deviceId);

    if (error) {
      throw new Error(`Khong hoan tat duoc phien ghi am: ${error.message}`);
    }

    await this.completeDeviceCommandByRecording(deviceId, recordingId, 'START_RECORDING', 'SUCCEEDED', message);
    await this.completeDeviceCommandByRecording(deviceId, recordingId, 'STOP_RECORDING', 'SUCCEEDED', message);
  }

  private async completeDeviceCommandByRecording(
    deviceId: string,
    recordingId: string,
    type: Extract<DeviceCommandType, 'START_RECORDING' | 'STOP_RECORDING'>,
    status: 'SUCCEEDED' | 'FAILED',
    message: string | null,
  ) {
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('device_commands')
      .update({
        status,
        message,
        completed_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('type', type)
      .in('status', ['PENDING', 'DELIVERED'])
      .contains('payload', { recordingId });

    if (error) {
      throw new Error(`Khong cap nhat duoc lenh ghi am: ${error.message}`);
    }
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

  async listScheduleAssignedDeviceIds(scheduleId: string) {
    const { data: assignments, error: assignmentError } = await this.supabase
      .from('device_schedule_assignments')
      .select('device_id')
      .eq('schedule_id', scheduleId);

    if (assignmentError) {
      throw new Error(`Khong doc duoc thiet bi duoc gan lich: ${assignmentError.message}`);
    }

    const deviceIds = ((assignments || []) as Pick<DeviceScheduleAssignmentRow, 'device_id'>[])
      .map((assignment) => assignment.device_id)
      .filter(Boolean);
    if (!deviceIds.length) return [];

    const { data: devices, error: deviceError } = await this.supabase
      .from('devices')
      .select('device_id')
      .in('device_id', deviceIds)
      .eq('play_allowed', true)
      .is('deleted_at', null);

    if (deviceError) {
      throw new Error(`Khong loc duoc thiet bi duoc phep phat: ${deviceError.message}`);
    }

    return ((devices || []) as Pick<DeviceRow, 'device_id'>[]).map((device) => device.device_id);
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
        receiver_installed_date: input.receiverInstalledDate,
        sim_registered_date: input.simRegisteredDate,
        area: input.area,
        connection_type: input.connectionType || 'UNKNOWN',
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
      if (this.isDuplicateDeviceMacError(error)) {
        throw new ConflictException(`Địa chỉ MAC ${input.macAddress} đã tồn tại. Vui lòng nhập MAC khác.`);
      }
      throw new Error(`Khong tao duoc thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tao duoc thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async createDeviceClient(input: {
    androidId: string | null;
    macAddress: string;
    name: string;
    connectionType: DeviceConnectionType;
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
      if (this.isDuplicateDeviceMacError(error)) {
        throw new ConflictException(`Địa chỉ MAC ${input.macAddress} đã tồn tại. Vui lòng nhập MAC khác.`);
      }
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
    input: { androidId?: string | null; appVersion?: string | null; connectionType?: DeviceConnectionType },
  ) {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      online: true,
      last_seen_at: now,
      updated_at: now,
    };

    if (input.androidId) update.android_id = input.androidId;
    if (input.appVersion !== undefined) update.app_version = input.appVersion;
    if (input.connectionType !== undefined) update.connection_type = input.connectionType;

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
        receiver_installed_date: input.receiverInstalledDate,
        sim_registered_date: input.simRegisteredDate,
        area: input.area,
        latitude: input.latitude,
        longitude: input.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      if (this.isDuplicateDeviceMacError(error)) {
        throw new ConflictException(`Địa chỉ MAC ${input.macAddress} đã tồn tại. Vui lòng nhập MAC khác.`);
      }
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

  async updateDeviceVolume(deviceId: string, volumeLevel: number) {
    const now = new Date().toISOString();

    const { error: supersedeError } = await this.supabase
      .from('device_commands')
      .update({
        status: 'SUPERSEDED',
        message: 'Da co lenh am luong moi hon.',
        completed_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('type', 'SET_VOLUME')
      .in('status', ['PENDING', 'DELIVERED']);

    if (supersedeError) {
      throw new Error(`Khong huy duoc lenh am luong cu: ${supersedeError.message}`);
    }

    const { error: commandError } = await this.supabase.from('device_commands').insert({
      device_id: deviceId,
      type: 'SET_VOLUME',
      payload: { volumeLevel },
      status: 'PENDING',
      updated_at: now,
    });

    if (commandError) {
      throw new Error(`Khong tao duoc lenh am luong: ${commandError.message}`);
    }

    const { data, error } = await this.supabase
      .from('devices')
      .update({
        desired_volume_level: volumeLevel,
        volume_sync_status: 'PENDING',
        volume_sync_message: 'Dang cho thiet bi nhan lenh am luong.',
        volume_updated_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc am luong thiet bi: ${error.message}`);
    }

    if (!data) throw new Error('Khong tim thay thiet bi.');
    return this.toDeviceRecord(data as DeviceRow);
  }

  async createDevicePlaybackCommand(deviceId: string, type: 'PLAY_SCHEDULE' | 'STOP_PLAYBACK', payload: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    const { error: supersedeError } = await this.supabase
      .from('device_commands')
      .update({
        status: 'SUPERSEDED',
        message: 'Da co lenh phat/dung moi hon.',
        completed_at: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .in('type', ['PLAY_SCHEDULE', 'STOP_PLAYBACK'])
      .in('status', ['PENDING', 'DELIVERED']);

    if (supersedeError) {
      throw new Error(`Khong huy duoc lenh phat/dung cu: ${supersedeError.message}`);
    }

    const { error } = await this.supabase.from('device_commands').insert({
      device_id: deviceId,
      type,
      payload,
      status: 'PENDING',
      updated_at: now,
    });

    if (error) {
      throw new Error(`Khong tao duoc lenh phat/dung: ${error.message}`);
    }
  }

  async getPendingDeviceCommand(deviceId: string) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('device_commands')
      .select('*')
      .eq('device_id', deviceId)
      .in('status', ['PENDING', 'DELIVERED'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc lenh thiet bi: ${error.message}`);
    }

    if (!data) return null;

    const command = data as DeviceCommandRow;
    if (command.status === 'PENDING') {
      const { data: delivered, error: updateError } = await this.supabase
        .from('device_commands')
        .update({ status: 'DELIVERED', last_delivered_at: now, updated_at: now })
        .eq('command_id', command.command_id)
        .select('*')
        .maybeSingle();

      if (updateError) {
        throw new Error(`Khong cap nhat duoc trang thai lenh thiet bi: ${updateError.message}`);
      }

      return delivered ? this.toDeviceCommandRecord(delivered as DeviceCommandRow) : this.toDeviceCommandRecord(command);
    }

    const { data: redelivered, error: redeliverError } = await this.supabase
      .from('device_commands')
      .update({ last_delivered_at: now, updated_at: now })
      .eq('command_id', command.command_id)
      .select('*')
      .maybeSingle();

    if (redeliverError) {
      throw new Error(`Khong cap nhat duoc thoi diem giao lenh: ${redeliverError.message}`);
    }

    return redelivered ? this.toDeviceCommandRecord(redelivered as DeviceCommandRow) : this.toDeviceCommandRecord(command);
  }

  async updateDeviceCommandResult(
    deviceId: string,
    commandId: string,
    result: { status: 'SUCCEEDED' | 'FAILED'; appliedVolumeLevel: number | null; message: string | null },
  ) {
    const now = new Date().toISOString();
    const { data: commandData, error: commandReadError } = await this.supabase
      .from('device_commands')
      .select('*')
      .eq('command_id', commandId)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (commandReadError) {
      throw new Error(`Khong doc duoc lenh thiet bi: ${commandReadError.message}`);
    }

    if (!commandData) throw new Error('Khong tim thay lenh thiet bi.');
    const command = commandData as DeviceCommandRow;
    if (command.status !== 'PENDING' && command.status !== 'DELIVERED') {
      const device = await this.getDevice(deviceId);
      if (!device) throw new Error('Khong tim thay thiet bi.');
      return device;
    }

    if (command.type !== 'SET_VOLUME') {
      const { error: commandUpdateError } = await this.supabase
        .from('device_commands')
        .update({
          status: result.status,
          message: result.message,
          completed_at: now,
          updated_at: now,
        })
        .eq('command_id', commandId);

      if (commandUpdateError) {
        throw new Error(`Khong cap nhat duoc ket qua lenh thiet bi: ${commandUpdateError.message}`);
      }

      const device = await this.getDevice(deviceId);
      if (!device) throw new Error('Khong tim thay thiet bi.');
      return device;
    }

    const requestedVolumeLevel = this.getCommandVolumeLevel(command);
    const synced = result.status === 'SUCCEEDED' && result.appliedVolumeLevel === requestedVolumeLevel;

    const { error: commandUpdateError } = await this.supabase
      .from('device_commands')
      .update({
        status: synced ? 'SUCCEEDED' : 'FAILED',
        message: result.message,
        completed_at: now,
        updated_at: now,
      })
      .eq('command_id', commandId);

    if (commandUpdateError) {
      throw new Error(`Khong cap nhat duoc ket qua lenh thiet bi: ${commandUpdateError.message}`);
    }

    const update: Record<string, unknown> = {
      volume_sync_status: synced ? 'SYNCED' : 'FAILED',
      volume_sync_message: result.message || (synced ? 'Thiet bi da ap dung am luong.' : 'Thiet bi ap dung am luong that bai.'),
      volume_updated_at: now,
      updated_at: now,
    };

    if (result.appliedVolumeLevel !== null) update.volume_level = result.appliedVolumeLevel;

    const { data, error } = await this.supabase
      .from('devices')
      .update(update)
      .eq('device_id', deviceId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new Error(`Khong cap nhat duoc ket qua am luong thiet bi: ${error.message}`);
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
      connectionType?: DeviceConnectionType;
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
    if (input.connectionType !== undefined) update.connection_type = input.connectionType;
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

  async markStaleDevicesOffline(staleBeforeIso: string) {
    const { error } = await this.supabase
      .from('devices')
      .update({ online: false, updated_at: new Date().toISOString() })
      .eq('online', true)
      .lt('last_seen_at', staleBeforeIso)
      .is('deleted_at', null);

    if (error) throw new Error(`Khong cap nhat duoc thiet bi mat ket noi: ${error.message}`);
  }

  async syncDeviceSchedule(
    deviceId: string,
    scheduleId: string,
    result: { syncStatus: DeviceSyncStatus; syncMessage: string },
  ) {
    const existing = await this.getDeviceAssignment(deviceId, scheduleId);
    if (existing) {
      const device = await this.getDevice(deviceId);
      if (!device) throw new Error('Khong tim thay thiet bi sau khi dong bo.');
      return device;
    }

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
      { onConflict: 'device_id,schedule_id' },
    );

    if (error) {
      throw new Error(`Khong tai lich xuong thiet bi: ${error.message}`);
    }

    const device = await this.getDevice(deviceId);
    if (!device) throw new Error('Khong tim thay thiet bi sau khi dong bo.');
    return device;
  }

  async removeDeviceSchedule(deviceId: string, scheduleId: string) {
    const { error } = await this.supabase
      .from('device_schedule_assignments')
      .delete()
      .eq('device_id', deviceId)
      .eq('schedule_id', scheduleId);

    if (error) {
      throw new Error(`Khong go duoc lich khoi thiet bi: ${error.message}`);
    }

    const device = await this.getDevice(deviceId);
    if (!device) throw new Error('Khong tim thay thiet bi sau khi go lich.');
    return device;
  }

  async updateDeviceScheduleSyncResult(
    deviceId: string,
    scheduleId: string,
    result: { syncStatus: DeviceSyncStatus; syncMessage: string },
  ) {
    const existing = await this.getDeviceAssignment(deviceId, scheduleId);
    if (!existing) {
      throw new Error('Khong tim thay lich da gan cho thiet bi.');
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('device_schedule_assignments')
      .update({
        sync_status: result.syncStatus,
        sync_message: result.syncMessage,
        last_synced_at: result.syncStatus === 'SYNCED' ? now : null,
        updated_at: now,
      })
      .eq('device_id', deviceId)
      .eq('schedule_id', scheduleId);

    if (error) {
      throw new Error(`Khong cap nhat duoc ket qua dong bo lich: ${error.message}`);
    }

    const device = await this.getDevice(deviceId);
    if (!device) throw new Error('Khong tim thay thiet bi sau khi cap nhat dong bo.');
    return device;
  }

  async getDeviceClientSchedule(deviceId: string): Promise<DeviceClientSchedulePayload> {
    const assignmentRecords = await this.listDeviceScheduleAssignments(deviceId);
    const schedules = assignmentRecords.map((assignment) => assignment.schedule);
    const playlistsByScheduleId: Record<string, PlaylistRecord | null> = {};
    const filesByScheduleId: Record<string, AudioFileRecord | null> = {};

    for (const schedule of schedules) {
      playlistsByScheduleId[schedule.scheduleId] = schedule.sourceType === 'FILE' && schedule.playlistId
        ? await this.getPlaylist(schedule.playlistId)
        : null;
      filesByScheduleId[schedule.scheduleId] = schedule.sourceType === 'FILE' && schedule.fileId
        ? await this.getFile(schedule.fileId)
        : null;
    }

    return {
      assignments: assignmentRecords.map((assignment) => ({
        assignmentId: assignment.assignmentId,
        scheduleId: assignment.scheduleId,
        syncStatus: assignment.syncStatus,
        lastSyncedAt: assignment.lastSyncedAt,
        syncMessage: assignment.syncMessage,
      })),
      schedules,
      playlistsByScheduleId,
      filesByScheduleId,
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
      repeat_count: input.repeatCount,
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
      repeatCount: row.repeat_count ?? 0,
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
    const scheduleAssignments = await this.listDeviceScheduleAssignments(row.device_id);
    const activeAssignment = scheduleAssignments[0] || null;
    const activeSchedule = activeAssignment?.schedule || null;
    const currentSchedule = row.current_schedule_id ? await this.getSchedule(row.current_schedule_id) : null;

    return {
      deviceId: row.device_id,
      name: row.name,
      macAddress: row.mac_address,
      simNumber: row.sim_number || null,
      receiverInstalledDate: row.receiver_installed_date || null,
      simRegisteredDate: row.sim_registered_date || null,
      androidId: row.android_id || null,
      area: row.area,
      connectionType: row.connection_type,
      online: row.online,
      lastSeenAt: row.last_seen_at,
      playAllowed: row.play_allowed,
      activeSchedule,
      scheduleAssignments,
      currentSchedule,
      playStatus: row.play_status || 'IDLE',
      syncStatus: activeAssignment?.syncStatus || null,
      lastSyncedAt: activeAssignment?.lastSyncedAt || null,
      syncMessage: activeAssignment?.syncMessage || null,
      appVersion: row.app_version || null,
      networkType: row.network_type || null,
      batteryLevel: row.battery_level ?? null,
      playbackMessage: row.playback_message || null,
      playbackPositionSeconds: row.playback_position_seconds ?? null,
      playbackUpdatedAt: row.playback_updated_at || null,
      volumeLevel: row.volume_level ?? null,
      desiredVolumeLevel: row.desired_volume_level ?? null,
      volumeSyncStatus: row.volume_sync_status || null,
      volumeSyncMessage: row.volume_sync_message || null,
      volumeUpdatedAt: row.volume_updated_at || null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listDeviceScheduleAssignments(deviceId: string): Promise<DeviceScheduleAssignmentRecord[]> {
    const { data, error } = await this.supabase
      .from('device_schedule_assignments')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Khong doc duoc device_schedule_assignments: ${error.message}`);
    }

    const assignments = (data || []) as DeviceScheduleAssignmentRow[];
    const records = await Promise.all(assignments.map((row) => this.toDeviceScheduleAssignmentRecord(row)));
    return records.filter((record): record is DeviceScheduleAssignmentRecord => Boolean(record));
  }

  private async getDeviceAssignment(deviceId: string, scheduleId: string) {
    const { data, error } = await this.supabase
      .from('device_schedule_assignments')
      .select('*')
      .eq('device_id', deviceId)
      .eq('schedule_id', scheduleId)
      .maybeSingle();

    if (error) {
      throw new Error(`Khong doc duoc device_schedule_assignments: ${error.message}`);
    }

    return data ? (data as DeviceScheduleAssignmentRow) : null;
  }

  private async toDeviceScheduleAssignmentRecord(row: DeviceScheduleAssignmentRow): Promise<DeviceScheduleAssignmentRecord | null> {
    const schedule = await this.getSchedule(row.schedule_id);
    if (!schedule) return null;
    return {
      assignmentId: row.assignment_id,
      deviceId: row.device_id,
      scheduleId: row.schedule_id,
      syncStatus: row.sync_status,
      lastSyncedAt: row.last_synced_at,
      syncMessage: row.sync_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      schedule,
    };
  }

  private isDuplicateDeviceMacError(error: { code?: string; message?: string; details?: string }) {
    const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return (
      error.code === '23505' &&
      (text.includes('mac_address') || text.includes('idx_devices_mac_address_active_unique') || text.includes('devices_mac_address_key'))
    );
  }

  private toDeviceCommandRecord(row: DeviceCommandRow): DeviceCommandRecord {
    return {
      commandId: row.command_id,
      deviceId: row.device_id,
      type: row.type,
      payload: row.payload || {},
      status: row.status,
      message: row.message,
      lastDeliveredAt: row.last_delivered_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private getCommandVolumeLevel(command: DeviceCommandRow) {
    const value = command.payload?.volumeLevel;
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }

  // ─── Emergency Sources ───────────────────────────────────────────────────────

  async listEmergencySources(): Promise<EmergencySourceRecord[]> {
    const { data, error } = await this.supabase
      .from('emergency_sources')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Khong doc duoc emergency_sources: ${error.message}`);
    return ((data || []) as EmergencySourceRow[]).map((row) => this.toEmergencySourceRecord(row));
  }

  async getEmergencySource(sourceId: string): Promise<EmergencySourceRecord | null> {
    const { data, error } = await this.supabase
      .from('emergency_sources')
      .select('*')
      .eq('source_id', sourceId)
      .maybeSingle();

    if (error) throw new Error(`Khong doc duoc emergency source: ${error.message}`);
    return data ? this.toEmergencySourceRecord(data as EmergencySourceRow) : null;
  }

  async createEmergencySource(input: Required<EmergencySourceInput>): Promise<EmergencySourceRecord> {
    const { data, error } = await this.supabase
      .from('emergency_sources')
      .insert({ name: input.name, url: input.url, sort_order: input.sortOrder })
      .select('*')
      .single();

    if (error) throw new Error(`Khong tao duoc emergency source: ${error.message}`);
    return this.toEmergencySourceRecord(data as EmergencySourceRow);
  }

  async updateEmergencySource(sourceId: string, input: Required<EmergencySourceInput>): Promise<EmergencySourceRecord | null> {
    const { data, error } = await this.supabase
      .from('emergency_sources')
      .update({ name: input.name, url: input.url, sort_order: input.sortOrder, updated_at: new Date().toISOString() })
      .eq('source_id', sourceId)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Khong cap nhat duoc emergency source: ${error.message}`);
    return data ? this.toEmergencySourceRecord(data as EmergencySourceRow) : null;
  }

  async deleteEmergencySource(sourceId: string): Promise<void> {
    const { error } = await this.supabase.from('emergency_sources').delete().eq('source_id', sourceId);
    if (error) throw new Error(`Khong xoa duoc emergency source: ${error.message}`);
  }

  private toEmergencySourceRecord(row: EmergencySourceRow): EmergencySourceRecord {
    return {
      sourceId: row.source_id,
      name: row.name,
      url: row.url,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Emergency Broadcast Sessions ────────────────────────────────────────────

  async listEmergencyBroadcastSessions(): Promise<EmergencyBroadcastRecord[]> {
    const { data, error } = await this.supabase
      .from('emergency_broadcast_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Khong doc duoc emergency_broadcast_sessions: ${error.message}`);
    return ((data || []) as EmergencyBroadcastSessionRow[]).map((row) => this.toEmergencyBroadcastRecord(row));
  }

  async getEmergencyBroadcastSession(sessionId: string): Promise<EmergencyBroadcastRecord | null> {
    const { data, error } = await this.supabase
      .from('emergency_broadcast_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw new Error(`Khong doc duoc emergency session: ${error.message}`);
    return data ? this.toEmergencyBroadcastRecord(data as EmergencyBroadcastSessionRow) : null;
  }

  async getActiveEmergencySessionsByDeviceIds(deviceIds: string[]): Promise<EmergencyBroadcastRecord[]> {
    const { data, error } = await this.supabase
      .from('emergency_broadcast_sessions')
      .select('*')
      .eq('status', 'ACTIVE');

    if (error) throw new Error(`Khong kiem tra duoc conflict: ${error.message}`);
    const rows = ((data || []) as EmergencyBroadcastSessionRow[]);
    return rows
      .map((row) => this.toEmergencyBroadcastRecord(row))
      .filter((session) => session.targetDeviceIds.some((id) => deviceIds.includes(id)));
  }

  async createEmergencyBroadcastSession(
    input: Omit<EmergencyBroadcastStartInput, 'deviceIds'> & {
      sourceId: string;
      sourceName: string;
      sourceUrl: string;
      targetDeviceIds: string[];
      targetLabel: string;
    },
  ): Promise<EmergencyBroadcastRecord> {
    const startedAt = new Date();
    const scheduledEndAt = new Date(startedAt.getTime() + input.durationMinutes * 60 * 1000);

    const { data, error } = await this.supabase
      .from('emergency_broadcast_sessions')
      .insert({
        source_id: input.sourceId,
        source_name: input.sourceName,
        source_url: input.sourceUrl,
        target_device_ids: input.targetDeviceIds,
        target_label: input.targetLabel,
        duration_minutes: input.durationMinutes,
        started_by: input.startedBy || null,
        started_at: startedAt.toISOString(),
        scheduled_end_at: scheduledEndAt.toISOString(),
        status: 'ACTIVE',
      })
      .select('*')
      .single();

    if (error) throw new Error(`Khong tao duoc emergency session: ${error.message}`);
    return this.toEmergencyBroadcastRecord(data as EmergencyBroadcastSessionRow);
  }

  async finishEmergencyBroadcastSession(
    sessionId: string,
    status: 'FINISHED' | 'CANCELLED',
  ): Promise<EmergencyBroadcastRecord | null> {
    const { data, error } = await this.supabase
      .from('emergency_broadcast_sessions')
      .update({ status, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Khong cap nhat duoc emergency session: ${error.message}`);
    return data ? this.toEmergencyBroadcastRecord(data as EmergencyBroadcastSessionRow) : null;
  }

  async createEmergencyCommandsForDevices(
    deviceIds: string[],
    type: 'PLAY_EMERGENCY' | 'STOP_EMERGENCY',
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!deviceIds.length) return;
    const now = new Date().toISOString();
    const rows = deviceIds.map((deviceId) => ({
      device_id: deviceId,
      type,
      payload,
      status: 'PENDING',
      updated_at: now,
    }));

    const { error } = await this.supabase.from('device_commands').insert(rows);
    if (error) throw new Error(`Khong tao duoc emergency commands: ${error.message}`);
  }

  async getDeviceNamesByIds(deviceIds: string[]): Promise<string> {
    if (!deviceIds.length) return '';
    const { data, error } = await this.supabase
      .from('devices')
      .select('name')
      .in('device_id', deviceIds)
      .is('deleted_at', null);

    if (error) throw new Error(`Khong doc duoc ten thiet bi: ${error.message}`);
    return ((data || []) as { name: string }[]).map((d) => d.name).join(', ');
  }

  private toEmergencyBroadcastRecord(row: EmergencyBroadcastSessionRow): EmergencyBroadcastRecord {
    return {
      sessionId: row.session_id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      targetDeviceIds: Array.isArray(row.target_device_ids) ? row.target_device_ids : [],
      targetLabel: row.target_label,
      durationMinutes: row.duration_minutes,
      startedBy: row.started_by,
      startedAt: row.started_at,
      scheduledEndAt: row.scheduled_end_at,
      endedAt: row.ended_at,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

}
