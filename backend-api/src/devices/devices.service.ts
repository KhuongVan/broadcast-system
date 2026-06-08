import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { DeviceInput } from './device.types';

@Injectable()
export class DevicesService {
  constructor(private readonly storage: StorageService) {}

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
    if (schedule.sourceType !== 'RTSP') {
      throw new BadRequestException('Chi co the tai lich tiep song URL xuong thiet bi demo.');
    }

    return this.storage.syncDeviceSchedule(device.deviceId, schedule.scheduleId, {
      syncStatus: device.online ? 'SYNCED' : 'FAILED',
      syncMessage: device.online ? 'Da tai lich xuong thiet bi demo.' : 'Thiet bi dang mat ket noi.',
    });
  }

  private normalizeInput(input: Partial<DeviceInput>): DeviceInput {
    const name = String(input.name || '').trim();
    const macAddress = String(input.macAddress || '').trim().toUpperCase();
    const area = String(input.area || '').trim() || 'Chưa phân khu';
    const connectionType = input.connectionType === 'LAN' ? 'LAN' : input.connectionType === '4G' ? '4G' : null;

    if (!name) throw new BadRequestException('Vui long nhap ten thiet bi.');
    if (!macAddress) throw new BadRequestException('Vui long nhap dia chi MAC.');
    if (!connectionType) throw new BadRequestException('Dang ket noi chi ho tro LAN hoac 4G.');

    return { name, macAddress, area, connectionType };
  }
}
