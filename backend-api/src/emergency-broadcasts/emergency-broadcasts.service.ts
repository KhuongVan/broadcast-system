import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BroadcastGateway } from '../broadcast/broadcast.gateway';
import { config } from '../config';
import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { EmergencyBroadcastStartInput } from './emergency-broadcast.types';

@Injectable()
export class EmergencyBroadcastsService {
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRuntime: {
    sessionId: string;
    sourceUrl: string;
    sourceName: string;
    deviceIds: string[];
    durationMinutes: number;
    startedAt: number;
    retryAttempts: number;
  } | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly gateway: BroadcastGateway,
    private readonly media: MediaService,
  ) {}

  listSessions() {
    return this.storage.listEmergencyBroadcastSessions();
  }

  async startSession(input: Partial<EmergencyBroadcastStartInput>) {
    const sourceId = (input.sourceId || '').trim();
    const deviceIds = Array.isArray(input.deviceIds) ? input.deviceIds.filter(Boolean) : [];
    const durationMinutes = Number(input.durationMinutes);

    if (!sourceId) throw new BadRequestException('Vui lòng chọn nguồn phát.');
    if (!deviceIds.length) throw new BadRequestException('Vui lòng chọn ít nhất 1 thiết bị.');
    if (!Number.isFinite(durationMinutes) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
      throw new BadRequestException('Thời lượng phải là số phút từ 1 đến 300.');
    }

    const source = await this.storage.getEmergencySource(sourceId);
    if (!source) throw new NotFoundException('Không tìm thấy nguồn phát.');
    if (this.gateway.hasActiveEmergency()) {
      throw new BadRequestException('Đang có phiên phát khẩn cấp khác đang hoạt động. Vui lòng dừng phiên đó trước.');
    }

    // Check conflict: any device already has ACTIVE session
    const conflicts = await this.storage.getActiveEmergencySessionsByDeviceIds(deviceIds);
    if (conflicts.length > 0) {
      throw new BadRequestException(
        'Một số thiết bị đang có phiên phát khẩn cấp khác đang hoạt động. Vui lòng dừng phiên đó trước.',
      );
    }

    const targetLabel = await this.storage.getDeviceNamesByIds(deviceIds);

    const session = await this.storage.createEmergencyBroadcastSession({
      sourceId: source.sourceId,
      sourceName: source.name,
      sourceUrl: source.url,
      targetDeviceIds: deviceIds,
      targetLabel,
      durationMinutes,
      startedBy: input.startedBy || 'Admin',
    });

    try {
      this.gateway.beginEmergencyStartup(session.sessionId);
      this.gateway.prepareForEmergencyPlayback();
      this.activeRuntime = {
        sessionId: session.sessionId,
        sourceUrl: source.url,
        sourceName: source.name,
        deviceIds,
        durationMinutes,
        startedAt: Date.now(),
        retryAttempts: 0,
      };
      const stream = await this.media.startRtspUrl(source.url, (info) => {
        this.handleEmergencyStreamStopped(session.sessionId, info.version, info.code, info.signal).catch((error) =>
          console.error(`Emergency stream stop error: ${error.message}`),
        );
      });

      const payload = {
        sessionId: session.sessionId,
        streamVersion: stream.version,
        durationMinutes,
        sourceName: source.name,
        hlsUrl: this.getPublicHlsUrl(stream.version),
        recordingProof: this.buildRecordingProofPayload(session.sessionId),
      };
      this.gateway.setActiveEmergency(deviceIds, payload);

      // Write PLAY_EMERGENCY command for each device (for Android polling)
      await this.storage.createEmergencyCommandsForDevices(deviceIds, 'PLAY_EMERGENCY', {
        ...payload,
      });

      // Emit real-time socket event cho browser /client simulator
      this.gateway.emitEmergencyToDevices(deviceIds, payload);
      this.scheduleAutoFinish(session.sessionId, deviceIds, durationMinutes);
    } catch (error) {
      this.clearRetryTimer();
      this.activeRuntime = null;
      await this.storage.finishEmergencyBroadcastSession(session.sessionId, 'CANCELLED').catch(() => null);
      this.media.stop('emergency_start_failed');
      this.gateway.stopEmergencyOnDevices(deviceIds);
      this.gateway.clearActiveEmergency(session.sessionId);
      throw error;
    }

    return session;
  }

  async stopSession(sessionId: string) {
    const session = await this.storage.getEmergencyBroadcastSession(sessionId);
    if (!session) throw new NotFoundException('Không tìm thấy phiên phát khẩn cấp.');
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('Phiên phát khẩn cấp đã kết thúc.');
    }

    const updated = await this.storage.finishEmergencyBroadcastSession(sessionId, 'CANCELLED');
    if (!updated) throw new NotFoundException('Không tìm thấy phiên phát khẩn cấp.');

    this.clearAutoFinishTimer();
    this.clearRetryTimer();
    this.activeRuntime = null;
    if (this.gateway.isActiveEmergencySession(sessionId)) {
      this.media.stop('emergency_stop');
      this.gateway.clearActiveEmergency(sessionId);
    }

    // Write STOP_EMERGENCY command for each device (for Android polling)
    await this.storage.createEmergencyCommandsForDevices(session.targetDeviceIds, 'STOP_EMERGENCY', {
      sessionId,
    });

    // Emit real-time socket event cho browser /client simulator
    this.gateway.stopEmergencyOnDevices(session.targetDeviceIds);

    return updated;
  }

  private async handleEmergencyStreamStopped(
    sessionId: string,
    streamVersion: number,
    code: number | null,
    signal: NodeJS.Signals | null,
  ) {
    if (!this.gateway.isActiveEmergencySession(sessionId)) return;

    const runtime = this.activeRuntime;
    console.log(
      `EMERGENCY_STREAM_STOPPED sessionId=${sessionId} streamVersion=${streamVersion} code=${code} signal=${signal} attempt=${runtime?.retryAttempts || 0}`,
    );

    if (this.gateway.isPendingEmergencySession(sessionId)) {
      console.error(
        `EMERGENCY_START_INTERRUPTED sessionId=${sessionId} streamVersion=${streamVersion} code=${code} signal=${signal}`,
      );
      return;
    }

    if (runtime && runtime.sessionId === sessionId && this.shouldRetryEmergencyStream(runtime)) {
      this.scheduleEmergencyRetry(runtime, streamVersion);
      return;
    }

    console.error(
      `EMERGENCY_STREAM_FAILED sessionId=${sessionId} streamVersion=${streamVersion} code=${code} signal=${signal} attempts=${runtime?.retryAttempts || 0}`,
    );
    this.clearAutoFinishTimer();
    this.clearRetryTimer();
    this.activeRuntime = null;
    const session = await this.storage.finishEmergencyBroadcastSession(sessionId, 'CANCELLED');
    this.gateway.clearActiveEmergency(sessionId);
    if (session) {
      this.gateway.stopEmergencyOnDevices(session.targetDeviceIds);
      await this.storage.createEmergencyCommandsForDevices(session.targetDeviceIds, 'STOP_EMERGENCY', {
        sessionId,
      });
    }
  }

  private shouldRetryEmergencyStream(runtime: NonNullable<EmergencyBroadcastsService['activeRuntime']>) {
    const elapsedMs = Date.now() - runtime.startedAt;
    const durationMs = runtime.durationMinutes * 60 * 1000;
    const remainingMs = durationMs - elapsedMs;
    return remainingMs > config.scheduleStreamRestartDelayMs && runtime.retryAttempts < config.scheduleStreamRestartMaxAttempts;
  }

  private scheduleEmergencyRetry(
    runtime: NonNullable<EmergencyBroadcastsService['activeRuntime']>,
    failedStreamVersion: number,
  ) {
    this.clearRetryTimer();
    runtime.retryAttempts += 1;
    const delayMs = config.scheduleStreamRestartDelayMs;
    console.log(
      `EMERGENCY_STREAM_RETRY_SCHEDULED sessionId=${runtime.sessionId} failedStreamVersion=${failedStreamVersion} attempt=${runtime.retryAttempts}/${config.scheduleStreamRestartMaxAttempts} delayMs=${delayMs} source=${this.redactUrlQuery(runtime.sourceUrl)}`,
    );

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.restartEmergencyStream(runtime.sessionId).catch((error) =>
        console.error(`Emergency stream retry error: ${error.message}`),
      );
    }, delayMs);
  }

  private async restartEmergencyStream(sessionId: string) {
    const runtime = this.activeRuntime;
    if (!runtime || runtime.sessionId !== sessionId || !this.gateway.isActiveEmergencySession(sessionId)) return;

    if (!this.shouldContinueEmergency(runtime)) {
      await this.finishSession(sessionId, runtime.deviceIds);
      return;
    }

    console.log(
      `EMERGENCY_STREAM_RETRY_START sessionId=${sessionId} attempt=${runtime.retryAttempts}/${config.scheduleStreamRestartMaxAttempts} source=${this.redactUrlQuery(runtime.sourceUrl)}`,
    );

    try {
      const stream = await this.media.startRtspUrl(runtime.sourceUrl, (info) => {
        this.handleEmergencyStreamStopped(sessionId, info.version, info.code, info.signal).catch((error) =>
          console.error(`Emergency stream stop error: ${error.message}`),
        );
      });

      const elapsedMinutes = Math.floor((Date.now() - runtime.startedAt) / 60000);
      const remainingMinutes = Math.max(1, runtime.durationMinutes - elapsedMinutes);
      const payload = {
        sessionId,
        streamVersion: stream.version,
        durationMinutes: remainingMinutes,
        sourceName: runtime.sourceName,
        hlsUrl: this.getPublicHlsUrl(stream.version),
        recordingProof: this.buildRecordingProofPayload(sessionId),
      };

      this.gateway.setActiveEmergency(runtime.deviceIds, payload);
      await this.storage.createEmergencyCommandsForDevices(runtime.deviceIds, 'PLAY_EMERGENCY', {
        ...payload,
      });
      this.gateway.emitEmergencyToDevices(runtime.deviceIds, payload);
      console.log(`EMERGENCY_STREAM_RETRY_STARTED sessionId=${sessionId} streamVersion=${stream.version}`);
    } catch (error) {
      console.error(
        `EMERGENCY_STREAM_RETRY_FAILED sessionId=${sessionId} attempt=${runtime.retryAttempts}/${config.scheduleStreamRestartMaxAttempts} error=${error instanceof Error ? error.message : String(error)}`,
      );

      if (this.shouldRetryEmergencyStream(runtime)) {
        this.scheduleEmergencyRetry(runtime, 0);
        return;
      }

      this.clearAutoFinishTimer();
      this.clearRetryTimer();
      this.activeRuntime = null;
      const session = await this.storage.finishEmergencyBroadcastSession(sessionId, 'CANCELLED');
      this.gateway.clearActiveEmergency(sessionId);
      const targetDeviceIds = session?.targetDeviceIds.length ? session.targetDeviceIds : runtime.deviceIds;
      this.gateway.stopEmergencyOnDevices(targetDeviceIds);
      await this.storage.createEmergencyCommandsForDevices(targetDeviceIds, 'STOP_EMERGENCY', {
        sessionId,
      });
    }
  }

  private shouldContinueEmergency(runtime: NonNullable<EmergencyBroadcastsService['activeRuntime']>) {
    return Date.now() - runtime.startedAt < runtime.durationMinutes * 60 * 1000;
  }

  private scheduleAutoFinish(sessionId: string, deviceIds: string[], durationMinutes: number) {
    this.clearAutoFinishTimer();
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      this.finishSession(sessionId, deviceIds).catch((error) =>
        console.error(`Emergency auto-finish error: ${error.message}`),
      );
    }, durationMinutes * 60 * 1000);
  }

  private async finishSession(sessionId: string, deviceIds: string[]) {
    if (!this.gateway.isActiveEmergencySession(sessionId)) return;

    this.clearRetryTimer();
    this.activeRuntime = null;
    const updated = await this.storage.finishEmergencyBroadcastSession(sessionId, 'FINISHED');
    this.media.stop('emergency_finished');
    this.gateway.clearActiveEmergency(sessionId);
    const targetDeviceIds = updated?.targetDeviceIds.length ? updated.targetDeviceIds : deviceIds;
    this.gateway.stopEmergencyOnDevices(targetDeviceIds);
    await this.storage.createEmergencyCommandsForDevices(targetDeviceIds, 'STOP_EMERGENCY', {
      sessionId,
    });
  }

  private clearAutoFinishTimer() {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
  }

  private clearRetryTimer() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private getPublicHlsUrl(streamVersion: number) {
    const baseUrl = config.publicHlsBaseUrl || '/hls';
    return `${baseUrl.replace(/\/+$/, '')}/${config.streamPath}/index.m3u8?v=${encodeURIComponent(streamVersion)}`;
  }

  private buildRecordingProofPayload(sessionId: string) {
    return {
      enabled: config.recordingProofEnabled,
      sourceType: 'EMERGENCY' as const,
      sessionId,
      segmentSeconds: config.recordingProofSegmentSeconds,
      paddingBeforeSeconds: config.recordingProofPaddingBeforeSeconds,
      paddingAfterSeconds: config.recordingProofPaddingAfterSeconds,
      audioProfile: config.recordingProofAudioProfile,
    };
  }

  private redactUrlQuery(value: string) {
    try {
      const url = new URL(value);
      if (url.search) url.search = '?...';
      return url.toString();
    } catch {
      return value;
    }
  }
}
