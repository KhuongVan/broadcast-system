import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { DeviceInput } from './device.types';

const RECORDING_MAX_DURATION_SECONDS = 60;
const DEVICE_OFFLINE_AFTER_MS = 90_000;
const DEVICE_OFFLINE_SCAN_INTERVAL_MS = 30_000;

@Injectable()
export class DevicesService implements OnModuleInit, OnModuleDestroy {
  private offlineScanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    this.markStaleDevicesOffline().catch((error) => console.error(`Device offline scan error: ${error.message}`));
    this.offlineScanTimer = setInterval(() => {
      this.markStaleDevicesOffline().catch((error) => console.error(`Device offline scan error: ${error.message}`));
    }, DEVICE_OFFLINE_SCAN_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.offlineScanTimer) clearInterval(this.offlineScanTimer);
  }

  listDevices() {
    return this.storage.listDevices();
  }

  async getDevice(deviceId: string) {
    const device = await this.storage.getDevice(deviceId);
    if (!device) throw new NotFoundException('Khong tim thay thiet bi.');
    return device;
  }

  createDevice(input: Partial<DeviceInput>) {
    return this.storage.createDevice(this.normalizeInput(input));
  }

  updateDevice(deviceId: string, input: Partial<DeviceInput>) {
    return this.storage.updateDevice(deviceId, this.normalizeInput(input));
  }

  softDeleteDevice(deviceId: string) {
    return this.storage.softDeleteDevice(deviceId);
  }

  updatePlayAllowed(deviceId: string, playAllowed: boolean) {
    return this.storage.updateDevicePlayAllowed(deviceId, playAllowed);
  }

  async updateVolume(deviceId: string, volumeLevel: unknown) {
    await this.getDevice(deviceId);
    return this.storage.updateDeviceVolume(deviceId, this.normalizeVolumeLevel(volumeLevel));
  }

  async listRecordings(deviceId: string) {
    await this.getDevice(deviceId);
    return this.storage.listDeviceRecordings(deviceId);
  }

  async startRecording(deviceId: string) {
    await this.getDevice(deviceId);
    return this.storage.startDeviceRecording(deviceId, RECORDING_MAX_DURATION_SECONDS);
  }

  async stopRecording(deviceId: string, recordingId: string) {
    await this.getDevice(deviceId);
    const normalizedRecordingId = String(recordingId || '').trim();
    if (!normalizedRecordingId) throw new BadRequestException('Vui long gui recordingId.');
    return this.storage.stopDeviceRecording(deviceId, normalizedRecordingId);
  }

  async playNow(deviceId: string, scheduleId: string) {
    const device = await this.getDevice(deviceId);
    const schedule = await this.storage.getSchedule(scheduleId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    if (schedule.sourceType !== 'RTSP') {
      throw new BadRequestException('Chi co the phat ngay lich tiep song URL tren thiet bi demo.');
    }

    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'PLAYING',
      currentScheduleId: schedule.scheduleId,
    });
  }

  async stop(deviceId: string) {
    const device = await this.getDevice(deviceId);
    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'STOPPED',
      currentScheduleId: null,
    });
  }

  async syncScheduleToDevice(deviceId: string, scheduleId: string) {
    const device = await this.getDevice(deviceId);
    const schedule = await this.storage.getSchedule(scheduleId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');

    return this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
      syncStatus: device.online ? 'SYNCED' : 'FAILED',
      syncMessage: device.online ? 'Da gan lich cho thiet bi.' : 'Thiet bi dang mat ket noi.',
    });
  }

  private normalizeInput(input: Partial<DeviceInput>): DeviceInput {
    const name = String(input.name || '').trim();
    const macAddress = String(input.macAddress || '').trim().toUpperCase();
    const simNumber = String(input.simNumber || '').trim() || null;
    const area = String(input.area || '').trim() || 'Chưa phân khu';
    const connectionType =
      input.connectionType === 'LAN' || input.connectionType === '4G' || input.connectionType === 'UNKNOWN'
        ? input.connectionType
        : undefined;
    const latitude = typeof input.latitude === 'number' ? input.latitude : null;
    const longitude = typeof input.longitude === 'number' ? input.longitude : null;

    if (!name) throw new BadRequestException('Vui long nhap ten thiet bi.');
    if (!macAddress) throw new BadRequestException('Vui long nhap dia chi MAC.');

    return { name, macAddress, simNumber, area, connectionType, latitude, longitude };
  }

  private normalizeVolumeLevel(value: unknown) {
    const volumeLevel = Number(value);
    if (!Number.isInteger(volumeLevel) || volumeLevel < 0 || volumeLevel > 15) {
      throw new BadRequestException('Am luong phai la so nguyen tu 0 den 15.');
    }
    return volumeLevel;
  }

  private markStaleDevicesOffline() {
    const staleBeforeIso = new Date(Date.now() - DEVICE_OFFLINE_AFTER_MS).toISOString();
    return this.storage.markStaleDevicesOffline(staleBeforeIso);
  }
}
