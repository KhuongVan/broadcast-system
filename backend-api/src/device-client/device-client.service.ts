import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { extname } from 'path';
import { config } from '../config';
import { DeviceConnectionType, DevicePlayStatus, DeviceRecord, DeviceSyncStatus } from '../devices/device.types';
import { StorageService } from '../storage/storage.service';
import {
  DeviceClientHeartbeatBody,
  DeviceClientMicTestUploadBody,
  DeviceClientPlaybackStateBody,
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
    const androidId = this.optionalText(body.androidId);
    const macAddressInput = this.optionalText(body.macAddress)?.toUpperCase() || null;

    if (!androidId && !macAddressInput) {
      throw new BadRequestException('Vui long gui androidId hoac macAddress.');
    }

    const macAddress = macAddressInput || `ANDROID:${androidId}`;
    const existing = await this.storage.findDeviceForClientRegistration({ androidId, macAddress: macAddressInput });
    const appVersion = this.optionalText(body.appVersion);
    const connectionType = this.normalizeConnectionType(body.connectionType);
    let device = existing
      ? await this.storage.updateDeviceClientRegistration(existing.deviceId, { androidId, appVersion, connectionType })
      : await this.storage.createDeviceClient({
          androidId,
          macAddress,
          name: this.normalizeDeviceName(body.name, androidId, macAddress),
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
    };
  }

  async getSchedule(device: DeviceRecord) {
    const payload = await this.storage.getDeviceClientSchedule(device.deviceId);
    return {
      serverTime: this.serverTime(),
      assignment: payload.assignment,
      schedule: payload.schedule,
      playlist: payload.playlist,
      file: payload.file,
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

    const updated = await this.storage.syncDeviceSchedule(device.deviceId, scheduleId, {
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

  getCommands(device: DeviceRecord) {
    return {
      serverTime: this.serverTime(),
      deviceId: device.deviceId,
      command: {
        commandId: 'noop',
        type: 'NOOP',
      },
    };
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

  private optionalText(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
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
      syncStatus: device.syncStatus,
      lastSyncedAt: device.lastSyncedAt,
      syncMessage: device.syncMessage,
      appVersion: device.appVersion,
      networkType: device.networkType,
      batteryLevel: device.batteryLevel,
      playbackMessage: device.playbackMessage,
      playbackPositionSeconds: device.playbackPositionSeconds,
      playbackUpdatedAt: device.playbackUpdatedAt,
      updatedAt: device.updatedAt,
    };
  }
}
