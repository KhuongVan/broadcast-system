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

type PlayCachedPayload = {
  fileId: string;
  resetPosition?: boolean;
};

type PlayHlsFilePayload = {
  fileId: string;
  resetPosition?: boolean;
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

  constructor(
    private readonly auth: AuthService,
    private readonly audioFiles: AudioFilesService,
    private readonly media: MediaService,
    private readonly playlists: PlaylistsService,
    private readonly schedules: SchedulesService,
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
    if (active?.hlsReady) {
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
  async handlePlayLive(@ConnectedSocket() client: Socket) {
    try {
      client.emit('admin_status', { status: 'STARTING', type: 'MIC' });
      this.pauseActivePlaylist();
      this.clearActiveSchedule();
      const result = await this.media.startLiveMic(() => {
        this.server.emit('client_update', { action: 'STOP' });
      });
      this.server.emit('client_update', { action: 'START', streamVersion: result.version });
      client.emit('admin_status', { status: 'STARTED', type: 'MIC', streamVersion: result.version });
    } catch (error) {
      client.emit('admin_error', { message: error instanceof Error ? error.message : 'Khong phat duoc live mic.' });
      this.server.emit('client_update', { action: 'STOP' });
    }
  }

  @SubscribeMessage('admin_mic_chunk')
  handleMicChunk(@MessageBody() chunk: ArrayBuffer) {
    this.media.writeMicChunk(Buffer.from(chunk));
  }

  @SubscribeMessage('admin_stop')
  handleStop() {
    this.pauseActivePlaylist();
    this.clearScheduleStreamRestart();
    this.clearActiveSchedule();
    this.media.stop('admin_stop');
    this.server.emit('STOP');
    this.server.emit('client_update', { action: 'STOP' });
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
}
