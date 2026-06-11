import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BroadcastGateway } from '../broadcast/broadcast.gateway';
import { config } from '../config';
import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { EmergencyBroadcastStartInput } from './emergency-broadcast.types';

@Injectable()
export class EmergencyBroadcastsService {
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

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
    const validDurations = [15, 30, 60];

    if (!sourceId) throw new BadRequestException('Vui lòng chọn nguồn phát.');
    if (!deviceIds.length) throw new BadRequestException('Vui lòng chọn ít nhất 1 thiết bị.');
    if (!validDurations.includes(durationMinutes)) {
      throw new BadRequestException('Thời lượng phải là 15, 30 hoặc 60 phút.');
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
      this.gateway.prepareForEmergencyPlayback();
      const stream = await this.media.startRtspUrl(source.url, (info) => {
        this.handleEmergencyStreamStopped(session.sessionId, info.version).catch((error) =>
          console.error(`Emergency stream stop error: ${error.message}`),
        );
      });

      const payload = {
        sessionId: session.sessionId,
        streamVersion: stream.version,
        durationMinutes,
        sourceName: source.name,
        hlsUrl: this.getPublicHlsUrl(stream.version),
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

  private async handleEmergencyStreamStopped(sessionId: string, streamVersion: number) {
    if (!this.gateway.isActiveEmergencySession(sessionId)) return;

    console.log(`EMERGENCY_STREAM_STOPPED sessionId=${sessionId} streamVersion=${streamVersion}`);
    this.clearAutoFinishTimer();
    const session = await this.storage.finishEmergencyBroadcastSession(sessionId, 'FINISHED');
    this.gateway.clearActiveEmergency(sessionId);
    if (session) {
      this.gateway.stopEmergencyOnDevices(session.targetDeviceIds);
      await this.storage.createEmergencyCommandsForDevices(session.targetDeviceIds, 'STOP_EMERGENCY', {
        sessionId,
      });
    }
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

  private getPublicHlsUrl(streamVersion: number) {
    const baseUrl = config.publicHlsBaseUrl || `http://localhost:8888`;
    return `${baseUrl.replace(/\/+$/, '')}/${config.streamPath}/index.m3u8?v=${encodeURIComponent(streamVersion)}`;
  }
}
