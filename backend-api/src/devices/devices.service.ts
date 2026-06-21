import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { CurrentUser, getUserCommuneScope } from '../auth/auth.types';
import { config } from '../config';
import { BroadcastScheduleRecord } from '../schedules/schedule.types';
import { StorageService } from '../storage/storage.service';
import { DeviceInput } from './device.types';

const RECORDING_MAX_DURATION_SECONDS = 60;
const DEVICE_OFFLINE_AFTER_MS = 90_000;
const DEVICE_OFFLINE_SCAN_INTERVAL_MS = 30_000;
const RECORDING_SEGMENT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PROVISIONING_TOKEN_TTL_DAYS = 7;

@Injectable()
export class DevicesService implements OnModuleInit, OnModuleDestroy {
  private offlineScanTimer: ReturnType<typeof setInterval> | null = null;
  private recordingCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    this.markStaleDevicesOffline().catch((error) => console.error(`Device offline scan error: ${error.message}`));
    this.offlineScanTimer = setInterval(() => {
      this.markStaleDevicesOffline().catch((error) => console.error(`Device offline scan error: ${error.message}`));
    }, DEVICE_OFFLINE_SCAN_INTERVAL_MS);
    this.cleanupExpiredRecordingSegments().catch((error) => console.error(`Recording cleanup error: ${error.message}`));
    this.recordingCleanupTimer = setInterval(() => {
      this.cleanupExpiredRecordingSegments().catch((error) => console.error(`Recording cleanup error: ${error.message}`));
    }, RECORDING_SEGMENT_CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.offlineScanTimer) clearInterval(this.offlineScanTimer);
    if (this.recordingCleanupTimer) clearInterval(this.recordingCleanupTimer);
  }

  listDevices(user: CurrentUser) {
    return this.storage.listDevices(getUserCommuneScope(user));
  }

  async getDevice(deviceId: string, user?: CurrentUser) {
    const device = await this.storage.getDevice(deviceId, user ? getUserCommuneScope(user) : null);
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

  async updatePlayAllowed(deviceId: string, playAllowed: boolean, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    return this.storage.updateDevicePlayAllowed(deviceId, playAllowed);
  }

  async updateVolume(deviceId: string, volumeLevel: unknown, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    return this.storage.updateDeviceVolume(deviceId, this.normalizeVolumeLevel(volumeLevel));
  }

  async listRecordings(deviceId: string, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    return this.storage.listDeviceRecordings(deviceId);
  }

  async listRecordingSegments(deviceId: string, query: { date?: string; sourceType?: string }, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    const date = this.normalizeSegmentDate(query.date);
    const sourceType = this.normalizeSegmentSourceType(query.sourceType);
    return this.storage.listDeviceRecordingSegments(deviceId, date, sourceType);
  }

  async startRecording(deviceId: string, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    return this.storage.startDeviceRecording(deviceId, RECORDING_MAX_DURATION_SECONDS);
  }

  async stopRecording(deviceId: string, recordingId: string, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    const normalizedRecordingId = String(recordingId || '').trim();
    if (!normalizedRecordingId) throw new BadRequestException('Vui long gui recordingId.');
    return this.storage.stopDeviceRecording(deviceId, normalizedRecordingId);
  }

  async playNow(deviceId: string, scheduleId: string, user: CurrentUser) {
    const device = await this.getDevice(deviceId, user);
    const communeId = getUserCommuneScope(user);
    const group = await this.storage.getScheduleGroup(scheduleId, communeId);
    const schedule = group
      ? this.pickScheduleForPlayNow(await this.storage.listSchedules(communeId, { scheduleGroupId: group.scheduleGroupId }))
      : await this.storage.getSchedule(scheduleId, communeId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    await this.ensureScheduleDoesNotConflict(device.deviceId, schedule);
    if (group) {
      await this.storage.syncDeviceScheduleGroup(device.deviceId, group.scheduleGroupId, {
        syncStatus: device.online ? 'SYNCED' : 'FAILED',
        syncMessage: device.online ? 'Da gan lich cho thiet bi de phat ngay.' : 'Da gan lich, thiet bi se nhan lenh khi ket noi lai.',
      });
    } else {
      await this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
        syncStatus: device.online ? 'SYNCED' : 'FAILED',
        syncMessage: device.online ? 'Da gan lich cho thiet bi de phat ngay.' : 'Da gan lich, thiet bi se nhan lenh khi ket noi lai.',
      });
    }
    await this.storage.updateDevicePlayAllowed(device.deviceId, true);
    await this.storage.createDevicePlaybackCommand(device.deviceId, 'PLAY_SCHEDULE', {
      scheduleId: schedule.scheduleId,
      sourceType: schedule.sourceType,
      recordingProof: {
        enabled: config.recordingProofEnabled,
        sourceType: 'SCHEDULE',
        scheduleId: schedule.scheduleId,
        segmentSeconds: config.recordingProofSegmentSeconds,
        paddingBeforeSeconds: config.recordingProofPaddingBeforeSeconds,
        paddingAfterSeconds: config.recordingProofPaddingAfterSeconds,
        audioProfile: config.recordingProofAudioProfile,
      },
    });

    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'PLAYING',
      currentScheduleId: schedule.scheduleId,
      playbackMessage: 'Dang cho thiet bi nhan lenh phat.',
    });
  }

  async stop(deviceId: string, user: CurrentUser) {
    const device = await this.getDevice(deviceId, user);
    await this.storage.updateDevicePlayAllowed(device.deviceId, false);
    await this.storage.createDevicePlaybackCommand(device.deviceId, 'STOP_PLAYBACK');
    return this.storage.updateDevicePlayback(device.deviceId, {
      playStatus: 'STOPPED',
      currentScheduleId: null,
      playbackMessage: 'Dang cho thiet bi nhan lenh dung.',
    });
  }

  async syncScheduleToDevice(deviceId: string, scheduleOrGroupId: string, user: CurrentUser) {
    const device = await this.getDevice(deviceId, user);
    const communeId = getUserCommuneScope(user);
    const group = await this.storage.getScheduleGroup(scheduleOrGroupId, communeId);
    if (group) {
      const programs = await this.storage.listSchedules(communeId, { scheduleGroupId: group.scheduleGroupId });
      if (!programs.length) throw new NotFoundException('Lich phat chua co chuong trinh.');
      await this.ensureScheduleGroupDoesNotConflict(device.deviceId, programs);
      return this.storage.syncDeviceScheduleGroup(device.deviceId, group.scheduleGroupId, {
        syncStatus: device.online ? 'SYNCED' : 'FAILED',
        syncMessage: device.online ? 'Da gan lich cho thiet bi.' : 'Thiet bi dang mat ket noi.',
      });
    }

    const schedule = await this.storage.getSchedule(scheduleOrGroupId, communeId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    await this.ensureScheduleDoesNotConflict(device.deviceId, schedule);
    return this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
      syncStatus: device.online ? 'SYNCED' : 'FAILED',
      syncMessage: device.online ? 'Da gan lich cho thiet bi.' : 'Thiet bi dang mat ket noi.',
    });
  }

  async removeScheduleFromDevice(deviceId: string, scheduleOrGroupId: string, user: CurrentUser) {
    await this.getDevice(deviceId, user);
    const communeId = getUserCommuneScope(user);
    const group = await this.storage.getScheduleGroup(scheduleOrGroupId, communeId);
    if (group) return this.storage.removeDeviceScheduleGroup(deviceId, group.scheduleGroupId);

    const schedule = await this.storage.getSchedule(scheduleOrGroupId, communeId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    return this.storage.removeDeviceSchedule(deviceId, schedule.scheduleId);
  }

  async createProvisioningToken(deviceId: string) {
    await this.getDevice(deviceId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PROVISIONING_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const device = await this.storage.saveDeviceProvisioningToken(deviceId, this.hashToken(token), expiresAt);
    return { device, provisioningToken: token, expiresAt };
  }

  private async ensureScheduleDoesNotConflict(deviceId: string, schedule: BroadcastScheduleRecord) {
    if (!schedule.enabled) return;
    const assignments = await this.storage.listDeviceScheduleAssignments(deviceId);
    const assignedSchedules: BroadcastScheduleRecord[] = [];
    for (const assignment of assignments) {
      if (assignment.scheduleGroupId) {
        assignedSchedules.push(...await this.storage.listSchedules(null, { scheduleGroupId: assignment.scheduleGroupId }));
      } else if (assignment.schedule) {
        assignedSchedules.push(assignment.schedule);
      }
    }
    const conflict = assignedSchedules.find((assignedSchedule) =>
        assignedSchedule.scheduleId !== schedule.scheduleId &&
        assignedSchedule.enabled &&
        this.schedulesConflict(schedule, assignedSchedule),
    );

    if (conflict) {
      throw new ConflictException(`Lịch "${schedule.name}" bị trùng thời gian với "${conflict.name}" trên thiết bị này.`);
    }
  }

  private pickScheduleForPlayNow(schedules: BroadcastScheduleRecord[]) {
    const enabled = schedules.filter((schedule) => schedule.enabled);
    return enabled.find((schedule) => this.isScheduleActiveNow(schedule)) || enabled[0] || schedules[0] || null;
  }

  private isScheduleActiveNow(schedule: BroadcastScheduleRecord) {
    const now = new Date();
    const date = now.toLocaleDateString('en-CA', { timeZone: config.timeZone });
    const time = now.toLocaleTimeString('en-GB', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
    if (date < schedule.startDate) return false;
    if (time < schedule.startTime || time >= schedule.endTime) return false;
    if (schedule.repeatType === 'ONCE') return date === schedule.startDate;
    if (schedule.repeatType === 'DAILY') return true;
    if (schedule.repeatType === 'WEEKLY') return this.getWeekday(date) === this.getWeekday(schedule.startDate);
    if (schedule.repeatType === 'MONTHLY') return this.getMonthDay(date) === this.getMonthDay(schedule.startDate);
    return false;
  }

  private async ensureScheduleGroupDoesNotConflict(deviceId: string, schedules: BroadcastScheduleRecord[]) {
    for (const schedule of schedules) {
      await this.ensureScheduleDoesNotConflict(deviceId, schedule);
    }

    const selfConflict = schedules.find((schedule, index) =>
      schedules.some((other, otherIndex) =>
        otherIndex > index &&
        schedule.scheduleId !== other.scheduleId &&
        schedule.enabled &&
        other.enabled &&
        this.schedulesConflict(schedule, other),
      ),
    );
    if (selfConflict) {
      throw new ConflictException(`Lịch này có chương trình bị trùng thời gian: "${selfConflict.name}".`);
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
    const receiverInstalledDate = this.normalizeDate(input.receiverInstalledDate, 'Ngày lắp bộ thu');
    const simRegisteredDate = this.normalizeDate(input.simRegisteredDate, 'Ngày đăng ký SIM');
    const area = String(input.area || '').trim() || 'Chưa phân khu';
    const communeId = String(input.communeId || '').trim() || null;
    const connectionType =
      input.connectionType === 'LAN' || input.connectionType === '4G' || input.connectionType === 'UNKNOWN'
        ? input.connectionType
        : undefined;
    const latitude = typeof input.latitude === 'number' ? input.latitude : null;
    const longitude = typeof input.longitude === 'number' ? input.longitude : null;

    if (!name) throw new BadRequestException('Vui long nhap ten thiet bi.');
    if (!macAddress) throw new BadRequestException('Vui long nhap dia chi MAC.');

    return { name, macAddress, simNumber, receiverInstalledDate, simRegisteredDate, area, communeId, connectionType, latitude, longitude };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeDate(value: unknown, label: string) {
    const date = String(value || '').trim();
    if (!date) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(`${label} phai co dinh dang YYYY-MM-DD.`);
    }

    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException(`${label} khong hop le.`);
    }

    return date;
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

  private cleanupExpiredRecordingSegments() {
    return this.storage.cleanupExpiredRecordingSegments();
  }

  private normalizeSegmentDate(value: unknown) {
    const date = String(value || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Ngay ghi am phai co dinh dang YYYY-MM-DD.');
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Ngay ghi am khong hop le.');
    }

    return date;
  }

  private normalizeSegmentSourceType(value: unknown) {
    const sourceType = String(value || '').trim().toUpperCase();
    if (!sourceType) return null;
    if (sourceType === 'SCHEDULE' || sourceType === 'LIVE' || sourceType === 'EMERGENCY') return sourceType;
    throw new BadRequestException('Loai nguon ghi am chi ho tro SCHEDULE, LIVE hoac EMERGENCY.');
  }
}
