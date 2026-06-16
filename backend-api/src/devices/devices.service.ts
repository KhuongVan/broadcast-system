import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BroadcastScheduleRecord } from '../schedules/schedule.types';
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

  async createDevice(input: Partial<DeviceInput>) {
    const normalized = this.normalizeInput(input);
    await this.ensureMacAddressAvailable(normalized.macAddress);
    return this.storage.createDevice(normalized);
  }

  async updateDevice(deviceId: string, input: Partial<DeviceInput>) {
    const normalized = this.normalizeInput(input);
    await this.ensureMacAddressAvailable(normalized.macAddress, deviceId);
    return this.storage.updateDevice(deviceId, normalized);
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
    await this.ensureScheduleDoesNotConflict(device.deviceId, schedule);
    await this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
      syncStatus: device.online ? 'SYNCED' : 'FAILED',
      syncMessage: device.online ? 'Da gan lich cho thiet bi de phat ngay.' : 'Da gan lich, thiet bi se nhan lenh khi ket noi lai.',
    });
    await this.storage.updateDevicePlayAllowed(device.deviceId, true);
    await this.storage.createDevicePlaybackCommand(device.deviceId, 'PLAY_SCHEDULE', {
      scheduleId: schedule.scheduleId,
      sourceType: schedule.sourceType,
    });

    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'PLAYING',
      currentScheduleId: schedule.scheduleId,
      playbackMessage: 'Dang cho thiet bi nhan lenh phat.',
    });
  }

  async stop(deviceId: string) {
    const device = await this.getDevice(deviceId);
    await this.storage.updateDevicePlayAllowed(device.deviceId, false);
    await this.storage.createDevicePlaybackCommand(device.deviceId, 'STOP_PLAYBACK');
    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'STOPPED',
      currentScheduleId: null,
      playbackMessage: 'Dang cho thiet bi nhan lenh dung.',
    });
  }

  async syncScheduleToDevice(deviceId: string, scheduleId: string) {
    const device = await this.getDevice(deviceId);
    const schedule = await this.storage.getSchedule(scheduleId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    await this.ensureScheduleDoesNotConflict(device.deviceId, schedule);

    return this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
      syncStatus: device.online ? 'SYNCED' : 'FAILED',
      syncMessage: device.online ? 'Da gan lich cho thiet bi.' : 'Thiet bi dang mat ket noi.',
    });
  }

  async removeScheduleFromDevice(deviceId: string, scheduleId: string) {
    await this.getDevice(deviceId);
    const schedule = await this.storage.getSchedule(scheduleId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    return this.storage.removeDeviceSchedule(deviceId, schedule.scheduleId);
  }

  private async ensureScheduleDoesNotConflict(deviceId: string, schedule: BroadcastScheduleRecord) {
    if (!schedule.enabled) return;
    const assignments = await this.storage.listDeviceScheduleAssignments(deviceId);
    const conflict = assignments
      .map((assignment) => assignment.schedule)
      .find((assignedSchedule) =>
        assignedSchedule.scheduleId !== schedule.scheduleId &&
        assignedSchedule.enabled &&
        this.schedulesConflict(schedule, assignedSchedule),
      );

    if (conflict) {
      throw new ConflictException(`Lịch "${schedule.name}" bị trùng thời gian với "${conflict.name}" trên thiết bị này.`);
    }
  }

  private schedulesConflict(a: BroadcastScheduleRecord, b: BroadcastScheduleRecord) {
    if (!this.timeWindowsOverlap(a, b)) return false;
    if (a.repeatType === 'DAILY' || b.repeatType === 'DAILY') return true;
    if (a.repeatType === 'WEEKLY' && b.repeatType === 'MONTHLY') return true;
    if (a.repeatType === 'MONTHLY' && b.repeatType === 'WEEKLY') return true;
    if (a.repeatType === 'ONCE' && b.repeatType === 'ONCE') return a.startDate === b.startDate;
    if (a.repeatType === 'WEEKLY' && b.repeatType === 'WEEKLY') return this.getWeekday(a.startDate) === this.getWeekday(b.startDate);
    if (a.repeatType === 'MONTHLY' && b.repeatType === 'MONTHLY') return this.getMonthDay(a.startDate) === this.getMonthDay(b.startDate);
    if (a.repeatType === 'ONCE' && b.repeatType === 'WEEKLY') return this.getWeekday(a.startDate) === this.getWeekday(b.startDate);
    if (a.repeatType === 'WEEKLY' && b.repeatType === 'ONCE') return this.getWeekday(a.startDate) === this.getWeekday(b.startDate);
    if (a.repeatType === 'ONCE' && b.repeatType === 'MONTHLY') return this.getMonthDay(a.startDate) === this.getMonthDay(b.startDate);
    if (a.repeatType === 'MONTHLY' && b.repeatType === 'ONCE') return this.getMonthDay(a.startDate) === this.getMonthDay(b.startDate);
    return false;
  }

  private timeWindowsOverlap(a: BroadcastScheduleRecord, b: BroadcastScheduleRecord) {
    return a.startTime < b.endTime && b.startTime < a.endTime;
  }

  private getWeekday(date: string) {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }

  private getMonthDay(date: string) {
    return Number(date.slice(8, 10));
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

  private async ensureMacAddressAvailable(macAddress: string, currentDeviceId?: string) {
    const existing = await this.storage.findDeviceForClientRegistration({ macAddress });
    if (existing && existing.deviceId !== currentDeviceId) {
      throw new ConflictException(`Địa chỉ MAC ${macAddress} đã tồn tại. Vui lòng nhập MAC khác.`);
    }
  }

  private markStaleDevicesOffline() {
    const staleBeforeIso = new Date(Date.now() - DEVICE_OFFLINE_AFTER_MS).toISOString();
    return this.storage.markStaleDevicesOffline(staleBeforeIso);
  }
}
