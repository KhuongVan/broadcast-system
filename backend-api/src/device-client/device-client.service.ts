import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { extname } from 'path';
import { config } from '../config';
import { DeviceConnectionType, DevicePlayStatus, DeviceRecord, DeviceSyncStatus } from '../devices/device.types';
import { StorageService } from '../storage/storage.service';
import {
  DeviceClientCommandResultBody,
  DeviceClientEmergencyFinishedBody,
  DeviceClientHeartbeatBody,
  DeviceClientMicTestUploadBody,
  DeviceClientPlaybackRecordingUploadBody,
  DeviceClientPlaybackStateBody,
  DeviceClientRecordingStatusBody,
  DeviceClientRecordingSegmentUploadBody,
  DeviceClientRegisterBody,
  DeviceClientSyncResultBody,
} from './device-client.types';

const HEARTBEAT_INTERVAL_SECONDS = 30;
const POLL_INTERVAL_SECONDS = 10;
const MIC_TEST_ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'application/octet-stream',
]);
const MIC_TEST_ALLOWED_EXTENSIONS = new Set(['.webm', '.ogg', '.mp3', '.mp4', '.m4a', '.aac']);
const MIC_TEST_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
};

@Injectable()
export class DeviceClientService {
  constructor(private readonly storage: StorageService) {}

  async register(body: DeviceClientRegisterBody) {
    const deviceId = this.optionalText(body.deviceId);
    const androidId = this.optionalText(body.androidId);
    const macAddressInput = this.optionalText(body.macAddress)?.toUpperCase() || null;

    if (!deviceId && !androidId && !macAddressInput) {
      throw new BadRequestException('Vui long gui deviceId, androidId hoac macAddress.');
    }

    const macAddress = macAddressInput || (androidId ? `ANDROID:${androidId}` : null);
    let existing = deviceId && this.isUuid(deviceId) ? await this.storage.getDevice(deviceId) : null;
    if (!existing) {
      existing = await this.storage.findDeviceForClientRegistration({ androidId, macAddress: macAddressInput });
    }
    if (deviceId && !existing && !androidId && !macAddressInput) {
      throw new NotFoundException('Khong tim thay thiet bi theo deviceId.');
    }
    if (!existing && !macAddress) {
      throw new BadRequestException('Vui long gui androidId hoac macAddress de tao thiet bi moi.');
    }
    const appVersion = this.optionalText(body.appVersion);
    const connectionType = this.normalizeConnectionType(body.connectionType);
    const createMacAddress = macAddress || '';
    let device = existing
      ? await this.storage.updateDeviceClientRegistration(existing.deviceId, { androidId, appVersion, connectionType })
      : await this.storage.createDeviceClient({
          androidId,
          macAddress: createMacAddress,
          name: this.normalizeDeviceName(body.name, androidId, createMacAddress),
          connectionType: connectionType || 'UNKNOWN',
          appVersion,
        });

    const deviceToken = this.generateToken();
    device = await this.storage.saveDeviceClientToken(device.deviceId, this.hashToken(deviceToken));

    return {
      device: this.toClientDevice(device),
      deviceToken,
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      serverTime: this.serverTime(),
    };
  }

  async authenticateToken(token: string) {
    const device = await this.storage.getDeviceByClientTokenHash(this.hashToken(token));
    if (!device) throw new UnauthorizedException('Device token khong hop le.');
    return device;
  }

  async heartbeat(device: DeviceRecord, body: DeviceClientHeartbeatBody) {
    const batteryLevel = body.batteryLevel === undefined ? undefined : this.normalizeBatteryLevel(body.batteryLevel);
    const networkType = body.networkType === undefined ? undefined : this.optionalText(body.networkType);
    const connectionType = this.normalizeConnectionType(body.connectionType) || this.inferConnectionType(networkType);
    const updated = await this.storage.updateDeviceClientHeartbeat(device.deviceId, {
      appVersion: body.appVersion === undefined ? undefined : this.optionalText(body.appVersion),
      connectionType: connectionType || undefined,
      networkType,
      batteryLevel,
    });

    return {
      device: this.toClientDevice(updated),
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      serverTime: this.serverTime(),
    };
  }

  async getConfig(device: DeviceRecord) {
    const fresh = await this.getFreshDevice(device.deviceId);
    return {
      serverTime: this.serverTime(),
      device: this.toClientDevice(fresh),
      playAllowed: fresh.playAllowed,
      activeSchedule: fresh.activeSchedule,
      currentSchedule: fresh.currentSchedule,
      webviewUrl: '/client',
      hlsUrl: this.getPublicHlsUrl(),
      pollIntervalSeconds: POLL_INTERVAL_SECONDS,
      recordingProof: this.getRecordingProofConfig(),
    };
  }

  async getSchedule(device: DeviceRecord) {
    const payload = await this.storage.getDeviceClientSchedule(device.deviceId);
    return {
      serverTime: this.serverTime(),
      assignments: payload.assignments,
      schedules: payload.schedules,
      playlistsByScheduleId: payload.playlistsByScheduleId,
      filesByScheduleId: payload.filesByScheduleId,
    };
  }

  async updatePlaybackState(device: DeviceRecord, body: DeviceClientPlaybackStateBody) {
    const playStatus = this.normalizePlayStatus(body.playStatus);
    const currentScheduleId = this.optionalText(body.currentScheduleId || '') || null;
    const positionSeconds = this.normalizeOptionalNumber(body.positionSeconds);
    const message = this.optionalText(body.message);
    const updated = await this.storage.updateDevicePlayback(device.deviceId, {
      playStatus,
      currentScheduleId,
      playbackMessage: message,
      playbackPositionSeconds: positionSeconds,
    });

    return {
      device: this.toClientDevice(updated),
      playback: {
        playStatus,
        currentScheduleId,
        positionSeconds,
        message,
      },
      serverTime: this.serverTime(),
    };
  }

  async updateSyncResult(device: DeviceRecord, body: DeviceClientSyncResultBody) {
    const scheduleId = this.optionalText(body.scheduleId);
    const syncStatus = this.normalizeSyncStatus(body.syncStatus);
    if (!scheduleId) throw new BadRequestException('Vui long gui scheduleId.');
    const assignedSchedules = await this.storage.getDeviceClientSchedule(device.deviceId);
    if (!assignedSchedules.assignments.some((assignment) => assignment.scheduleId === scheduleId)) {
      throw new BadRequestException('Lich nay chua duoc gan cho thiet bi.');
    }

    const updated = await this.storage.updateDeviceScheduleSyncResult(device.deviceId, scheduleId, {
      syncStatus,
      syncMessage: this.optionalText(body.syncMessage) || (syncStatus === 'SYNCED' ? 'Android da dong bo lich.' : 'Android dong bo that bai.'),
    });

    return {
      device: this.toClientDevice(updated),
      serverTime: this.serverTime(),
    };
  }

  async uploadMicTest(device: DeviceRecord, body: DeviceClientMicTestUploadBody, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui long gui file audio trong field "audio".');
    this.ensureMicTestFileAllowed(file);

    const upload = await this.storage.uploadDeviceMicTest({
      deviceId: device.deviceId,
      file,
      fileName: this.safeFileName(file.originalname || `mic-test${this.getMicTestExtension(file)}`),
      extension: this.getMicTestExtension(file),
      durationSeconds: this.normalizeDurationSeconds(body.durationSeconds),
      message: this.optionalText(body.message),
      recordingId: this.optionalText(body.recordingId),
    });

    return {
      upload: {
        uploadId: upload.uploadId,
        deviceId: upload.deviceId,
        fileName: upload.fileName,
        mimetype: upload.mimetype,
        size: upload.size,
        durationSeconds: upload.durationSeconds,
        message: upload.message,
        url: upload.url,
        createdAt: upload.createdAt,
      },
      serverTime: this.serverTime(),
    };
  }

  async uploadPlaybackRecording(device: DeviceRecord, body: DeviceClientPlaybackRecordingUploadBody, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui long gui file audio trong field "audio".');
    this.ensureMicTestFileAllowed(file);

    const recording = await this.storage.uploadDevicePlaybackRecording({
      deviceId: device.deviceId,
      file,
      fileName: this.safeFileName(file.originalname || this.buildPlaybackRecordingFileName(device.deviceId, file)),
      extension: this.getMicTestExtension(file),
      durationSeconds: this.normalizeDurationSeconds(body.durationSeconds),
      message: this.optionalText(body.message) || this.buildPlaybackRecordingMessage(body.playStatus),
      scheduleId: this.optionalUuid(body.scheduleId),
      fileId: this.optionalUuid(body.fileId),
      playbackStartedAt: this.optionalIsoDate(body.startedAt),
      playbackEndedAt: this.optionalIsoDate(body.endedAt),
    });

    return {
      recording,
      serverTime: this.serverTime(),
    };
  }

  async uploadRecordingSegment(device: DeviceRecord, body: DeviceClientRecordingSegmentUploadBody, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Vui long gui file audio trong field "audio".');
    this.ensureMicTestFileAllowed(file);

    const sourceType = this.normalizeRecordingProofSourceType(body.sourceType);
    const startedAt = this.requiredIsoDate(body.startedAt, 'startedAt');
    const endedAt = this.requiredIsoDate(body.endedAt, 'endedAt');
    if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
      throw new BadRequestException('endedAt phai lon hon startedAt.');
    }

    const durationSeconds = this.normalizeDurationSeconds(body.durationSeconds);
    if (durationSeconds !== null && durationSeconds > config.recordingProofSegmentSeconds + 120) {
      throw new BadRequestException('Thoi luong segment vuot qua gioi han cho phep.');
    }

    const segmentIndex = this.normalizeSegmentIndex(body.segmentIndex);
    const segment = await this.storage.uploadDeviceRecordingSegment({
      deviceId: device.deviceId,
      file,
      fileName: this.safeFileName(file.originalname || this.buildRecordingSegmentFileName(sourceType, startedAt, segmentIndex, file)),
      extension: this.getMicTestExtension(file),
      sourceType,
      scheduleId: sourceType === 'SCHEDULE' ? this.optionalUuid(body.scheduleId) : null,
      sessionId: sourceType === 'LIVE' || sourceType === 'EMERGENCY' ? this.optionalUuid(body.sessionId) : null,
      startedAt,
      endedAt,
      durationSeconds,
      segmentIndex,
      isFinalSegment: this.normalizeBoolean(body.isFinalSegment),
      message: this.optionalText(body.message),
    });

    return {
      segment,
      serverTime: this.serverTime(),
    };
  }

  async getCommands(device: DeviceRecord) {
    const command = await this.storage.getPendingDeviceCommand(device.deviceId);
    if (command) {
      return {
        serverTime: this.serverTime(),
        deviceId: device.deviceId,
        command: {
          commandId: command.commandId,
          type: command.type,
          payload: command.payload,
        },
      };
    }

    return {
      serverTime: this.serverTime(),
      deviceId: device.deviceId,
      command: {
        commandId: 'noop',
        type: 'NOOP',
      },
    };
  }

  async updateCommandResult(device: DeviceRecord, body: DeviceClientCommandResultBody) {
    const commandId = this.optionalText(body.commandId);
    if (!commandId) throw new BadRequestException('Vui long gui commandId.');
    const status = this.normalizeCommandResultStatus(body.status);
    const appliedVolumeLevel = body.appliedVolumeLevel === undefined ? null : this.normalizeVolumeLevel(body.appliedVolumeLevel);

    const updated = await this.storage.updateDeviceCommandResult(device.deviceId, commandId, {
      status,
      appliedVolumeLevel,
      message: this.optionalText(body.message),
    });

    return {
      device: this.toClientDevice(updated),
      serverTime: this.serverTime(),
    };
  }

  async updateRecordingStatus(device: DeviceRecord, body: DeviceClientRecordingStatusBody) {
    const recordingId = this.optionalText(body.recordingId);
    if (!recordingId) throw new BadRequestException('Vui long gui recordingId.');
    const status = this.normalizeRecordingStatus(body.status);
    const recording = await this.storage.updateDeviceRecordingStatus(device.deviceId, recordingId, status, this.optionalText(body.message));

    return {
      recording,
      serverTime: this.serverTime(),
    };
  }

  /**
   * Device báo hiệu đã tự dừng phát khẩn cấp sau khi hết thời lượng.
   * Server cập nhật trạng thái session sang FINISHED nếu chưa kết thúc.
   */
  async emergencyFinished(device: DeviceRecord, body: DeviceClientEmergencyFinishedBody) {
    const sessionId = this.optionalText(body.sessionId);
    if (!sessionId) {
      return { success: true, serverTime: this.serverTime() };
    }

    const session = await this.storage.getEmergencyBroadcastSession(sessionId);
    if (session && session.status === 'ACTIVE') {
      await this.storage.finishEmergencyBroadcastSession(sessionId, 'FINISHED');
    }

    return { success: true, serverTime: this.serverTime() };
  }

  private async getFreshDevice(deviceId: string) {
    const device = await this.storage.getDevice(deviceId);
    if (!device) throw new NotFoundException('Khong tim thay thiet bi.');
    return device;
  }

  private normalizeDeviceName(name: string | undefined, androidId: string | null, macAddress: string) {
    const explicitName = this.optionalText(name);
    if (explicitName) return explicitName;
    const suffix = (androidId || macAddress).replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'device';
    return `Android Device ${suffix}`;
  }

  private normalizePlayStatus(status: string | undefined): DevicePlayStatus {
    if (status === 'IDLE' || status === 'PLAYING' || status === 'STOPPED' || status === 'ERROR') return status;
    throw new BadRequestException('playStatus khong hop le.');
  }

  private normalizeSyncStatus(status: string | undefined): DeviceSyncStatus {
    if (status === 'SYNCED' || status === 'FAILED') return status;
    throw new BadRequestException('syncStatus chi ho tro SYNCED hoac FAILED.');
  }

  private normalizeCommandResultStatus(status: string | undefined) {
    if (status === 'SUCCEEDED' || status === 'FAILED') return status;
    throw new BadRequestException('status chi ho tro SUCCEEDED hoac FAILED.');
  }

  private normalizeRecordingStatus(status: string | undefined) {
    if (status === 'RECORDING' || status === 'UPLOADING' || status === 'FAILED') return status;
    throw new BadRequestException('recording status chi ho tro RECORDING, UPLOADING hoac FAILED.');
  }

  private normalizeRecordingProofSourceType(value: unknown) {
    const sourceType = String(value || '').trim().toUpperCase();
    if (sourceType === 'SCHEDULE' || sourceType === 'LIVE' || sourceType === 'EMERGENCY') return sourceType;
    throw new BadRequestException('sourceType chi ho tro SCHEDULE, LIVE hoac EMERGENCY.');
  }

  private normalizeVolumeLevel(value: unknown) {
    const volumeLevel = Number(value);
    if (!Number.isInteger(volumeLevel) || volumeLevel < 0 || volumeLevel > 15) {
      throw new BadRequestException('Am luong phai la so nguyen tu 0 den 15.');
    }
    return volumeLevel;
  }

  private normalizeBatteryLevel(value: number) {
    const batteryLevel = Number(value);
    if (!Number.isFinite(batteryLevel)) return null;
    return Math.max(0, Math.min(100, Math.round(batteryLevel)));
  }

  private normalizeOptionalNumber(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private normalizeDurationSeconds(value: unknown) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) return null;
    return Math.round(numberValue);
  }

  private normalizeSegmentIndex(value: unknown) {
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue < 0) {
      throw new BadRequestException('segmentIndex phai la so nguyen khong am.');
    }
    return numberValue;
  }

  private normalizeBoolean(value: unknown) {
    return value === true || value === 'true' || value === '1' || value === 1;
  }

  private ensureMicTestFileAllowed(file: Express.Multer.File) {
    const mimetype = file.mimetype || 'application/octet-stream';
    const extension = this.getMicTestExtension(file);

    if (!MIC_TEST_ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException('Dinh dang file test mic khong duoc ho tro.');
    }

    if (!MIC_TEST_ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Phan mo rong file test mic khong duoc ho tro.');
    }
  }

  private getMicTestExtension(file: Express.Multer.File) {
    const extension = extname(file.originalname || '').toLowerCase();
    if (extension) return extension;
    return MIC_TEST_EXTENSION_BY_MIME[file.mimetype || ''] || '.webm';
  }

  private safeFileName(originalName: string) {
    const fileName = originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return fileName || 'mic-test.webm';
  }

  private buildPlaybackRecordingFileName(deviceId: string, file: Express.Multer.File) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'device';
    return `${timestamp}-${suffix}${this.getMicTestExtension(file)}`;
  }

  private buildRecordingSegmentFileName(sourceType: string, startedAt: string, segmentIndex: number, file: Express.Multer.File) {
    const timestamp = startedAt.replace(/[:.]/g, '-');
    return `${timestamp}-${sourceType.toLowerCase()}-seg-${segmentIndex}${this.getMicTestExtension(file)}`;
  }

  private buildPlaybackRecordingMessage(playStatus: unknown) {
    const status = this.optionalText(playStatus);
    return status ? `Thiet bi upload file ghi am bang chung phat thanh (${status}).` : 'Thiet bi upload file ghi am bang chung phat thanh.';
  }

  private optionalText(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
  }

  private optionalUuid(value: unknown) {
    const text = this.optionalText(value);
    return text && this.isUuid(text) ? text : null;
  }

  private optionalIsoDate(value: unknown) {
    const text = this.optionalText(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private requiredIsoDate(value: unknown, label: string) {
    const date = this.optionalIsoDate(value);
    if (!date) throw new BadRequestException(`${label} phai la ISO datetime hop le.`);
    return date;
  }

  private getRecordingProofConfig() {
    return {
      enabled: config.recordingProofEnabled,
      segmentSeconds: config.recordingProofSegmentSeconds,
      paddingBeforeSeconds: config.recordingProofPaddingBeforeSeconds,
      paddingAfterSeconds: config.recordingProofPaddingAfterSeconds,
      retentionDays: config.recordingProofRetentionDays,
      audioProfile: config.recordingProofAudioProfile,
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private normalizeConnectionType(value: unknown): DeviceConnectionType | undefined {
    const text = String(value || '').trim().toUpperCase();
    if (text === 'LAN' || text === '4G' || text === 'UNKNOWN') return text;
    return undefined;
  }

  private inferConnectionType(networkType: string | null | undefined): DeviceConnectionType | undefined {
    const text = String(networkType || '').trim().toLowerCase();
    if (!text) return undefined;
    if (['wifi', 'wi-fi', 'ethernet', 'lan'].some((keyword) => text.includes(keyword))) return 'LAN';
    if (['cellular', 'mobile', '4g', 'lte', '5g'].some((keyword) => text.includes(keyword))) return '4G';
    return undefined;
  }

  private generateToken() {
    return `device_${randomBytes(32).toString('base64url')}`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private serverTime() {
    return new Date().toISOString();
  }

  private getPublicHlsUrl() {
    if (!config.publicHlsBaseUrl) return null;
    return `${config.publicHlsBaseUrl}/${config.streamPath}/index.m3u8`;
  }

  private toClientDevice(device: DeviceRecord) {
    return {
      deviceId: device.deviceId,
      name: device.name,
      macAddress: device.macAddress,
      androidId: device.androidId,
      area: device.area,
      connectionType: device.connectionType,
      online: device.online,
      lastSeenAt: device.lastSeenAt,
      playAllowed: device.playAllowed,
      playStatus: device.playStatus,
      currentSchedule: device.currentSchedule,
      activeSchedule: device.activeSchedule,
      scheduleAssignments: device.scheduleAssignments,
      syncStatus: device.syncStatus,
      lastSyncedAt: device.lastSyncedAt,
      syncMessage: device.syncMessage,
      appVersion: device.appVersion,
      networkType: device.networkType,
      batteryLevel: device.batteryLevel,
      playbackMessage: device.playbackMessage,
      playbackPositionSeconds: device.playbackPositionSeconds,
      playbackUpdatedAt: device.playbackUpdatedAt,
      volumeLevel: device.volumeLevel,
      desiredVolumeLevel: device.desiredVolumeLevel,
      volumeSyncStatus: device.volumeSyncStatus,
      volumeSyncMessage: device.volumeSyncMessage,
      volumeUpdatedAt: device.volumeUpdatedAt,
      updatedAt: device.updatedAt,
    };
  }
}
