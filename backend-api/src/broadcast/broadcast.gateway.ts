import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AudioFilesService } from '../audio-files/audio-files.service';
import { AuthService } from '../auth/auth.service';
import { config } from '../config';
import { MediaService, MediaStopInfo } from '../media/media.service';
import { PlaylistRecord } from '../playlists/playlist.types';
import { PlaylistsService } from '../playlists/playlists.service';
import { BroadcastScheduleRecord } from '../schedules/schedule.types';
import { SchedulesService } from '../schedules/schedules.service';
import { StorageService } from '../storage/storage.service';

type PlayCachedPayload = {
  fileId: string;
  resetPosition?: boolean;
};

type PlayHlsFilePayload = {
  fileId: string;
  resetPosition?: boolean;
};

type LiveTargetPayload = {
  targetType?: 'AREA' | 'DEVICE';
  targetArea?: string | null;
  targetDeviceIds?: string[];
};

type ClientRegisterDevicePayload = {
  deviceId?: string;
  macAddress?: string;
  androidId?: string;
};

type ActiveLiveTarget = {
  targetType: 'AREA' | 'DEVICE';
  targetArea: string | null;
  targetDeviceIds: string[];
};

type ActivePlaylistSession = {
  playlist: PlaylistRecord;
  currentIndex: number;
  startedAtMs: number;
  startOffsetSeconds: number;
  pausedOffsetSeconds: number;
  isPlaying: boolean;
  scheduleId?: string;
  singleFileId?: string;
};

type EmergencyPlaybackPayload = {
  sessionId: string;
  streamVersion: number;
  durationMinutes: number;
  sourceName: string;
};

type ActiveEmergencySession = EmergencyPlaybackPayload & {
  targetDeviceIds: string[];
};

@WebSocketGateway({
  maxHttpBufferSize: 2 * 1024 * 1024,
})
export class BroadcastGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;
  private activePlaylist: ActivePlaylistSession | null = null;
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private activeScheduleId: string | null = null;
  private activeSchedulePriority: 'NORMAL' | 'EMERGENCY' | null = null;
  private activeSchedule: BroadcastScheduleRecord | null = null;
  private pausedSchedule: BroadcastScheduleRecord | null = null;
  private pausedNormalScheduleId: string | null = null;
  private scheduleStreamRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleStreamRestartAttempts = 0;
  private activeLiveTarget: ActiveLiveTarget | null = null;
  private activeEmergency: ActiveEmergencySession | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly audioFiles: AudioFilesService,
    private readonly media: MediaService,
    private readonly playlists: PlaylistsService,
    private readonly schedules: SchedulesService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.scheduleTimer = setInterval(() => {
      this.tickSchedules().catch((error) => console.error(`Schedule tick error: ${error.message}`));
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    this.clearScheduleStreamRestart();
  }

  async handleConnection(client: Socket) {
    client.use((packet, next) => {
      const eventName = String(packet[0] || '');
      if (eventName.startsWith('admin_') && !this.auth.isCookieHeaderAuthenticated(client.handshake.headers.cookie)) {
        client.emit('admin_error', { message: 'Vui long dang nhap.' });
        next(new Error('Unauthorized'));
        return;
      }

      next();
    });

    try {
      for (const file of await this.audioFiles.listFiles()) {
        client.emit('FILE_AVAILABLE', file);
      }
    } catch (error) {
      console.error(`Socket file preload error: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const active = this.media.getActiveStream();
    if (active?.hlsReady && active.type !== 'MIC' && !this.activeEmergency) {
      client.emit('client_update', {
        action: 'START',
        streamVersion: active.version,
      });
    }

    if (this.activePlaylist?.isPlaying) {
      this.emitCurrentPlaylistItem(client, false);
    }

    this.emitScheduleStatus(client);
  }

  async emitFileAvailable(fileId: string) {
    const record = await this.audioFiles.getFile(fileId);
    if (record) {
      this.server.emit('FILE_AVAILABLE', record);
    }
  }

  @SubscribeMessage('admin_file_uploaded')
  async handleFileUploaded(@MessageBody() payload: { fileId: string }) {
    await this.emitFileAvailable(payload.fileId);
  }

  @SubscribeMessage('admin_play_cached')
  async handlePlayCached(@MessageBody() payload: PlayCachedPayload, @ConnectedSocket() client: Socket) {
    const record = await this.audioFiles.getFile(payload.fileId);
    if (!record) {
      client.emit('admin_error', { message: 'Khong tim thay file cached.' });
      return;
    }

    this.media.stop('cached_play');
    this.pauseActivePlaylist();
    this.clearActiveSchedule();
    this.server.emit('PLAY_CACHED', {
      fileId: record.fileId,
      resetPosition: Boolean(payload.resetPosition),
    });
    client.emit('admin_status', { status: 'STARTED', type: 'CACHED_FILE' });
  }

  @SubscribeMessage('admin_play_hls_file')
  async handlePlayHlsFile(@MessageBody() payload: PlayHlsFilePayload, @ConnectedSocket() client: Socket) {
    try {
      client.emit('admin_status', { status: 'STARTING', type: 'FILE' });
      this.pauseActivePlaylist();
      this.clearActiveSchedule();
      const result = await this.media.startHlsFile(payload.fileId, Boolean(payload.resetPosition), () => {
        this.server.emit('client_update', { action: 'STOP' });
      });
      this.server.emit('client_update', { action: 'START', streamVersion: result.version });
      client.emit('admin_status', { status: 'STARTED', type: 'FILE', streamVersion: result.version });
    } catch (error) {
      client.emit('admin_error', { message: error instanceof Error ? error.message : 'Khong phat duoc file HLS.' });
      this.server.emit('client_update', { action: 'STOP' });
    }
  }

  @SubscribeMessage('admin_play_live')
  async handlePlayLive(@MessageBody() payload: LiveTargetPayload, @ConnectedSocket() client: Socket) {
    try {
      const target = this.normalizeLiveTarget(payload);
      client.emit('admin_status', { status: 'STARTING', type: 'MIC' });
      this.pauseActivePlaylist();
      this.clearActiveSchedule();
      this.activeLiveTarget = target;
      const result = await this.media.startLiveMic(() => {
        this.emitToLiveTarget({ action: 'STOP' });
        this.activeLiveTarget = null;
      });
      this.emitToLiveTarget({ action: 'START', streamVersion: result.version });
      client.emit('admin_status', { status: 'STARTED', type: 'MIC', streamVersion: result.version });
    } catch (error) {
      client.emit('admin_error', { message: error instanceof Error ? error.message : 'Khong phat duoc live mic.' });
      this.emitToLiveTarget({ action: 'STOP' });
      this.activeLiveTarget = null;
    }
  }

  @SubscribeMessage('admin_mic_chunk')
  handleMicChunk(@MessageBody() chunk: ArrayBuffer) {
    this.media.writeMicChunk(Buffer.from(chunk));
  }

  @SubscribeMessage('client_register_device')
  async handleClientRegisterDevice(@MessageBody() payload: ClientRegisterDevicePayload, @ConnectedSocket() client: Socket) {
    try {
      const deviceId = String(payload?.deviceId || '').trim();
      const macAddress = String(payload?.macAddress || '').trim();
      const androidId = String(payload?.androidId || '').trim();
      const legacyIdentifier = deviceId && !this.isUuid(deviceId) ? deviceId : '';

      if (!deviceId && !macAddress && !androidId) {
        client.emit('client_registration_status', {
          status: 'DEMO_GLOBAL',
          message: 'Đang chạy chế độ demo global. Thêm ?deviceId=<uuid> hoặc ?macAddress=<mac> để kiểm tra theo thiết bị.',
        });
        return;
      }

      // Thử tìm theo UUID trước, sau đó fallback sang MAC address / Android ID.
      // Không query cột UUID bằng MAC vì Postgres sẽ lỗi trước khi kịp fallback.
      let device = this.isUuid(deviceId) ? await this.storage.getDevice(deviceId) : null;
      if (!device) {
        device = await this.storage.findDeviceForClientRegistration({
          macAddress: macAddress || legacyIdentifier,
          androidId: androidId || legacyIdentifier,
        });
      }

      if (!device) {
        const attempted = this.describeClientRegistrationAttempt(deviceId, macAddress, androidId);
        client.emit('client_registration_status', {
          status: 'ERROR',
          message: `Không tìm thấy thiết bị theo ${attempted}. Kiểm tra lại Device ID/MAC address.`,
          deviceId,
          macAddress,
          androidId,
        });
        return;
      }

      await client.join(this.deviceRoom(device.deviceId));
      await client.join(this.areaRoom(device.area));
      client.emit('client_registration_status', {
        status: 'REGISTERED',
        device: {
          deviceId: device.deviceId,
          name: device.name,
          area: device.area,
        },
      });

      this.emitActiveEmergencyToSocket(client, device.deviceId);

      const active = this.media.getActiveStream();
      if (active?.hlsReady && active.type === 'MIC' && this.socketMatchesLiveTarget(device.deviceId, device.area)) {
        client.emit('client_update', {
          action: 'START',
          streamVersion: active.version,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không đăng ký được thiết bị mô phỏng.';
      console.error(`Client registration error: ${message}`);
      client.emit('client_registration_status', {
        status: 'ERROR',
        message,
        deviceId: String(payload?.deviceId || '').trim(),
        macAddress: String(payload?.macAddress || '').trim(),
        androidId: String(payload?.androidId || '').trim(),
      });
    }
  }

  @SubscribeMessage('admin_stop')
  handleStop() {
    this.pauseActivePlaylist();
    this.clearScheduleStreamRestart();
    this.clearActiveSchedule();
    const wasLiveTargeted = this.media.getActiveStream()?.type === 'MIC' && Boolean(this.activeLiveTarget);
    this.media.stop('admin_stop');
    if (wasLiveTargeted) {
      this.emitToLiveTarget({ action: 'STOP' });
      this.activeLiveTarget = null;
    } else {
      this.server.emit('STOP');
      this.server.emit('client_update', { action: 'STOP' });
    }
    this.emitScheduleStatus();
  }

  @SubscribeMessage('admin_request_schedule_status')
  handleRequestScheduleStatus(@ConnectedSocket() client: Socket) {
    this.emitScheduleStatus(client);
  }

  @SubscribeMessage('admin_pause_schedule')
  async handlePauseSchedule(@ConnectedSocket() client: Socket) {
    if (!this.activeSchedule) {
      client.emit('admin_error', { message: 'Không có lịch đang phát.' });
      this.emitScheduleStatus(client);
      return;
    }

    this.pausedSchedule = this.activeSchedule;
    this.pauseActivePlaylist();
    this.clearScheduleStreamRestart();
    this.media.stop('schedule_pause');
    this.clearActiveSchedule();
    this.server.emit('STOP');
    this.server.emit('client_update', { action: 'STOP' });
    client.emit('admin_status', { status: 'PAUSED', type: 'SCHEDULE' });
    this.emitScheduleStatus();
  }

  @SubscribeMessage('admin_resume_schedule')
  async handleResumeSchedule(@ConnectedSocket() client: Socket) {
    const schedule = this.pausedSchedule;
    if (!schedule) {
      client.emit('admin_error', { message: 'Không có lịch đang tạm dừng.' });
      this.emitScheduleStatus(client);
      return;
    }

    if (!this.schedules.isScheduleActive(schedule)) {
      this.pausedSchedule = null;
      client.emit('admin_error', { message: 'Lịch phát đã hết thời gian' });
      this.emitScheduleStatus();
      return;
    }

    if (this.activeSchedulePriority === 'EMERGENCY' && schedule.priority !== 'EMERGENCY') {
      client.emit('admin_error', { message: 'Đang có lịch khẩn cấp, chưa thể phát tiếp lịch thường.' });
      this.emitScheduleStatus(client);
      return;
    }

    this.pausedSchedule = null;
    await this.startSchedule(schedule, false);
    client.emit('admin_status', { status: 'RESUMED', type: 'SCHEDULE' });
  }

  @SubscribeMessage('client_file_ended')
  handleClientFileEnded(@MessageBody() payload: { fileId: string }) {
    if (!this.activePlaylist?.isPlaying) return;

    const currentFileId = this.getCurrentPlaylistFileId();
    if (!currentFileId || currentFileId !== payload.fileId) return;

    if (this.activePlaylist.singleFileId) {
      this.activePlaylist = null;
      this.server.emit('STOP');
      return;
    }

    this.activePlaylist.currentIndex += 1;
    if (this.activePlaylist.currentIndex >= this.activePlaylist.playlist.items.length) {
      this.activePlaylist = null;
      this.server.emit('STOP');
      return;
    }

    this.activePlaylist.startedAtMs = Date.now();
    this.activePlaylist.startOffsetSeconds = 0;
    this.activePlaylist.pausedOffsetSeconds = 0;
    this.playCurrentPlaylistItem(true);
  }

  @SubscribeMessage('client_file_ready')
  handleClientFileReady(@MessageBody() payload: { fileId: string }, @ConnectedSocket() client: Socket) {
    console.log(`Client ${client.id} ready file ${payload.fileId}`);
  }

  @SubscribeMessage('client_file_error')
  handleClientFileError(@MessageBody() payload: { fileId: string; message: string }, @ConnectedSocket() client: Socket) {
    console.log(`Client ${client.id} file error ${payload.fileId}: ${payload.message}`);
  }

  private playCurrentPlaylistItem(resetPosition: boolean) {
    if (!this.activePlaylist) return;

    const fileId = this.getCurrentPlaylistFileId();
    if (!fileId) return;

    this.activePlaylist.isPlaying = true;
    if (resetPosition) {
      this.activePlaylist.startedAtMs = Date.now();
      this.activePlaylist.startOffsetSeconds = 0;
      this.activePlaylist.pausedOffsetSeconds = 0;
    }

    this.emitCurrentPlaylistItem(this.server, resetPosition);
  }

  private emitCurrentPlaylistItem(target: Server | Socket, resetPosition: boolean) {
    if (!this.activePlaylist) return;

    const fileId = this.getCurrentPlaylistFileId();
    if (!fileId) return;

    target.emit('PLAY_CACHED', {
      fileId,
      resetPosition,
      startOffsetSeconds: this.getCurrentPlaylistOffsetSeconds(),
      serverTimeMs: Date.now(),
    });
  }

  private getCurrentPlaylistOffsetSeconds() {
    if (!this.activePlaylist) return 0;
    if (!this.activePlaylist.isPlaying) return this.activePlaylist.pausedOffsetSeconds;

    const elapsedSeconds = (Date.now() - this.activePlaylist.startedAtMs) / 1000;
    return Math.max(0, this.activePlaylist.startOffsetSeconds + elapsedSeconds);
  }

  private getCurrentPlaylistFileId() {
    if (!this.activePlaylist) return null;
    if (this.activePlaylist.singleFileId) return this.activePlaylist.singleFileId;

    const item = this.activePlaylist.playlist.items[this.activePlaylist.currentIndex];
    return item?.fileId || null;
  }

  private pauseActivePlaylist() {
    if (!this.activePlaylist?.isPlaying) return;

    this.activePlaylist.pausedOffsetSeconds = this.getCurrentPlaylistOffsetSeconds();
    this.activePlaylist.isPlaying = false;
  }

  private async tickSchedules() {
    const schedules = await this.schedules.listSchedules();
    const runnable = this.schedules.getRunnableSchedules(schedules);
    const selected = this.selectSchedule(runnable);

    if (!selected) {
      if (this.activeScheduleId) {
        await this.finishActiveSchedule('Het khung gio phat.');
      }
      return;
    }

    if (!this.activeScheduleId && this.pausedSchedule?.scheduleId === selected.scheduleId) return;

    if (this.activeScheduleId === selected.scheduleId) return;

    if (selected.priority === 'EMERGENCY' && this.activeSchedulePriority === 'NORMAL' && this.activeScheduleId) {
      this.pausedNormalScheduleId = this.activeScheduleId;
    }

    await this.startSchedule(selected, selected.scheduleId !== this.pausedNormalScheduleId);
  }

  private selectSchedule(schedules: BroadcastScheduleRecord[]) {
    return schedules
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'EMERGENCY' ? -1 : 1;
        return `${a.startDate} ${a.startTime}`.localeCompare(`${b.startDate} ${b.startTime}`);
      })[0] || null;
  }

  private async startSchedule(schedule: BroadcastScheduleRecord, resetPosition = true, isRestart = false) {
    if (!isRestart) {
      this.clearScheduleStreamRestart();
    }

    this.media.stop('schedule_replace');
    this.pauseActivePlaylist();
    this.activeScheduleId = schedule.scheduleId;
    this.activeSchedulePriority = schedule.priority;
    this.activeSchedule = schedule;

    try {
      if (schedule.sourceType === 'RTSP') {
        const result = await this.media.startRtspUrl(schedule.rtspUrl || '', (info) => {
          this.handleScheduleStreamStopped(schedule, info).catch((error) =>
            console.error(`Schedule stream restart error: ${error.message}`),
          );
        });
        this.server.emit('client_update', { action: 'START', streamVersion: result.version });
      } else {
        await this.startFileSchedule(schedule, resetPosition);
      }

      if (this.pausedNormalScheduleId === schedule.scheduleId) {
        this.pausedNormalScheduleId = null;
      }
      await this.schedules.logScheduleRun(schedule.scheduleId, 'STARTED', `Bat dau lich ${schedule.name}`);
      console.log(`SCHEDULE_STARTED id=${schedule.scheduleId} name=${schedule.name}`);
      this.emitScheduleStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong chay duoc lich phat.';
      await this.schedules.logScheduleRun(schedule.scheduleId, 'FAILED', message);
      this.clearActiveSchedule();
      this.server.emit('STOP');
      this.server.emit('client_update', { action: 'STOP' });
      this.emitScheduleStatus();
    }
  }

  private async handleScheduleStreamStopped(schedule: BroadcastScheduleRecord, info: MediaStopInfo) {
    if (this.activeScheduleId !== schedule.scheduleId || schedule.sourceType !== 'RTSP') return;

    const reason = `FFmpeg stopped type=${info.type} version=${info.version} code=${info.code} signal=${info.signal}`;
    console.log(`SCHEDULE_STREAM_STOPPED id=${schedule.scheduleId} name=${schedule.name} ${reason}`);
    this.server.emit('client_update', { action: 'STOP' });

    if (!this.schedules.isScheduleActive(schedule)) {
      await this.finishActiveSchedule('Luong tiep song dung vi lich da het khung gio.');
      return;
    }

    if (this.scheduleStreamRestartAttempts >= config.scheduleStreamRestartMaxAttempts) {
      const message = `Tiep song URL bi gian doan qua ${config.scheduleStreamRestartMaxAttempts} lan.`;
      await this.schedules.logScheduleRun(schedule.scheduleId, 'FAILED', message);
      this.clearActiveSchedule();
      this.server.emit('STOP');
      this.server.emit('admin_error', { message });
      this.emitScheduleStatus();
      return;
    }

    this.scheduleStreamRestartAttempts += 1;
    const attempt = this.scheduleStreamRestartAttempts;
    console.log(
      `SCHEDULE_STREAM_RESTART scheduleId=${schedule.scheduleId} attempt=${attempt}/${config.scheduleStreamRestartMaxAttempts} delayMs=${config.scheduleStreamRestartDelayMs} url=${schedule.rtspUrl || ''}`,
    );
    this.server.emit('admin_status', { status: 'RESTARTING', type: 'SCHEDULE_URL', attempt });
    this.emitScheduleStatus();

    this.scheduleStreamRestartTimer = setTimeout(() => {
      this.scheduleStreamRestartTimer = null;
      if (this.activeScheduleId !== schedule.scheduleId || !this.schedules.isScheduleActive(schedule)) return;
      this.startSchedule(schedule, true, true).catch((error) => {
        console.error(`Schedule stream restart failed: ${error.message}`);
      });
    }, config.scheduleStreamRestartDelayMs);
  }

  private async startFileSchedule(schedule: BroadcastScheduleRecord, resetPosition: boolean) {
    if (schedule.fileMode === 'SINGLE_FILE' && schedule.fileId) {
      const record = await this.audioFiles.getFile(schedule.fileId);
      if (!record) throw new Error('Khong tim thay file trong lich phat.');
      const shouldResume =
        !resetPosition &&
        this.activePlaylist?.scheduleId === schedule.scheduleId &&
        this.activePlaylist.singleFileId === record.fileId;
      const pausedOffsetSeconds = shouldResume ? this.activePlaylist!.pausedOffsetSeconds : 0;

      this.activePlaylist = {
        playlist: {
          playlistId: schedule.playlistId || schedule.scheduleId,
          name: schedule.name,
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
          totalFiles: 1,
          totalSize: record.size,
        items: [],
        },
        currentIndex: 0,
        startedAtMs: Date.now(),
        startOffsetSeconds: pausedOffsetSeconds,
        pausedOffsetSeconds,
        isPlaying: true,
        scheduleId: schedule.scheduleId,
        singleFileId: record.fileId,
      };
      this.server.emit('PLAY_CACHED', {
        fileId: record.fileId,
        resetPosition,
        startOffsetSeconds: pausedOffsetSeconds,
        serverTimeMs: Date.now(),
      });
      return;
    }

    if (!schedule.playlistId) throw new Error('Lich phat chua chon danh sach phat.');
    const playlist = await this.playlists.getPlaylist(schedule.playlistId);
    if (!playlist || playlist.items.length === 0) throw new Error('Danh sach phat trong lich dang rong.');

    const shouldResume =
      !resetPosition &&
      this.activePlaylist?.scheduleId === schedule.scheduleId &&
      this.activePlaylist.currentIndex < playlist.items.length;

    this.activePlaylist = {
      playlist,
      currentIndex: shouldResume ? this.activePlaylist!.currentIndex : 0,
      startedAtMs: Date.now(),
      startOffsetSeconds: shouldResume ? this.activePlaylist!.pausedOffsetSeconds : 0,
      pausedOffsetSeconds: shouldResume ? this.activePlaylist!.pausedOffsetSeconds : 0,
      isPlaying: true,
      scheduleId: schedule.scheduleId,
    };
    this.playCurrentPlaylistItem(resetPosition);
  }

  private async finishActiveSchedule(message: string) {
    const scheduleId = this.activeScheduleId;
    if (scheduleId) {
      await this.schedules.logScheduleRun(scheduleId, 'FINISHED', message);
    }

    this.clearActiveSchedule();
    this.media.stop('schedule_finished');
    this.pauseActivePlaylist();
    this.server.emit('STOP');
    this.server.emit('client_update', { action: 'STOP' });
    this.emitScheduleStatus();
  }

  private clearActiveSchedule() {
    this.activeScheduleId = null;
    this.activeSchedulePriority = null;
    this.activeSchedule = null;
  }

  private clearScheduleStreamRestart() {
    if (this.scheduleStreamRestartTimer) clearTimeout(this.scheduleStreamRestartTimer);
    this.scheduleStreamRestartTimer = null;
    this.scheduleStreamRestartAttempts = 0;
  }

  private emitScheduleStatus(target: Server | Socket = this.server) {
    target.emit('SCHEDULE_STATUS', {
      activeSchedule: this.activeSchedule,
      pausedSchedule: this.pausedSchedule,
    });
  }

  private normalizeLiveTarget(payload: LiveTargetPayload = {}): ActiveLiveTarget {
    const targetType = payload.targetType === 'AREA' ? 'AREA' : 'DEVICE';
    const targetArea = String(payload.targetArea || '').trim();
    const targetDeviceIds = Array.isArray(payload.targetDeviceIds)
      ? payload.targetDeviceIds.map((deviceId) => String(deviceId || '').trim()).filter(Boolean)
      : [];

    if (targetType === 'AREA') {
      if (!targetArea) throw new Error('Vui lòng chọn địa bàn phát.');
      return { targetType, targetArea, targetDeviceIds: [] };
    }

    if (!targetDeviceIds.length) throw new Error('Vui lòng chọn thiết bị phát.');
    return { targetType, targetArea: null, targetDeviceIds };
  }

  private emitToLiveTarget(payload: { action: 'START' | 'STOP'; streamVersion?: number }) {
    const target = this.activeLiveTarget;
    if (!target) {
      this.server.emit('client_update', payload);
      return;
    }

    if (target.targetType === 'AREA' && target.targetArea) {
      this.server.to(this.areaRoom(target.targetArea)).emit('client_update', payload);
      return;
    }

    for (const deviceId of target.targetDeviceIds) {
      this.server.to(this.deviceRoom(deviceId)).emit('client_update', payload);
    }
  }

  prepareForEmergencyPlayback() {
    this.pauseActivePlaylist();
    this.clearScheduleStreamRestart();
    this.clearActiveSchedule();
    this.activeLiveTarget = null;
    this.server.emit('STOP');
    this.server.emit('client_update', { action: 'STOP' });
    this.emitScheduleStatus();
  }

  private socketMatchesLiveTarget(deviceId: string, area: string) {
    const target = this.activeLiveTarget;
    if (!target) return false;
    if (target.targetType === 'AREA') return this.normalizeRoomPart(target.targetArea || '') === this.normalizeRoomPart(area);
    return target.targetDeviceIds.includes(deviceId);
  }

  private deviceRoom(deviceId: string) {
    return `device:${deviceId}`;
  }

  private areaRoom(area: string) {
    return `area:${this.normalizeRoomPart(area)}`;
  }

  private normalizeRoomPart(value: string) {
    return String(value || '').trim().toLowerCase();
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private describeClientRegistrationAttempt(deviceId: string, macAddress: string, androidId: string) {
    const parts: string[] = [];
    if (deviceId) parts.push(this.isUuid(deviceId) ? `Device ID ${deviceId}` : `legacy deviceId ${deviceId}`);
    if (macAddress) parts.push(`MAC ${macAddress}`);
    if (androidId) parts.push(`Android ID ${androidId}`);
    return parts.length ? parts.join(' / ') : 'thông tin rỗng';
  }

  setActiveEmergency(deviceIds: string[], payload: EmergencyPlaybackPayload) {
    this.activeEmergency = {
      ...payload,
      targetDeviceIds: deviceIds,
    };
  }

  clearActiveEmergency(sessionId?: string) {
    if (sessionId && this.activeEmergency?.sessionId !== sessionId) return;
    this.activeEmergency = null;
  }

  hasActiveEmergency() {
    return Boolean(this.activeEmergency);
  }

  isActiveEmergencySession(sessionId: string) {
    return this.activeEmergency?.sessionId === sessionId;
  }

  /** Gửi lệnh phát khẩn cấp đến các browser client đang mô phỏng thiết bị */
  emitEmergencyToDevices(deviceIds: string[], payload: EmergencyPlaybackPayload) {
    for (const deviceId of deviceIds) {
      this.server.to(this.deviceRoom(deviceId)).emit('PLAY_EMERGENCY', payload);
    }
  }

  /** Gửi lệnh dừng khẩn cấp đến các browser client đang mô phỏng thiết bị */
  stopEmergencyOnDevices(deviceIds: string[]) {
    for (const deviceId of deviceIds) {
      this.server.to(this.deviceRoom(deviceId)).emit('STOP_EMERGENCY');
    }
  }

  private emitActiveEmergencyToSocket(client: Socket, deviceId: string) {
    const emergency = this.activeEmergency;
    if (!emergency || !emergency.targetDeviceIds.includes(deviceId)) return;

    client.emit('PLAY_EMERGENCY', {
      sessionId: emergency.sessionId,
      streamVersion: emergency.streamVersion,
      durationMinutes: emergency.durationMinutes,
      sourceName: emergency.sourceName,
    });
  }
}
