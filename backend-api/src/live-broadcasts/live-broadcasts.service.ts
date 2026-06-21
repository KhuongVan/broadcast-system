import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUser, getUserCommuneScope } from '../auth/auth.types';
import { StorageService } from '../storage/storage.service';
import { LiveBroadcastCreateInput } from './live-broadcast.types';

@Injectable()
export class LiveBroadcastsService {
  constructor(private readonly storage: StorageService) {}

  listSessions(user: CurrentUser) {
    return this.storage.listLiveBroadcastSessions(getUserCommuneScope(user));
  }

  async createSession(input: Partial<LiveBroadcastCreateInput>, user: CurrentUser) {
    const communeId = getUserCommuneScope(user);
    const title = (input.title || '').trim();
    const targetType = input.targetType;
    const targetArea = (input.targetArea || '').trim();
    const targetDeviceIds = Array.isArray(input.targetDeviceIds) ? input.targetDeviceIds.filter(Boolean) : [];
    const targetLabel = (input.targetLabel || '').trim();

    if (!title) throw new BadRequestException('Tiêu đề không được để trống.');
    if (targetType !== 'AREA' && targetType !== 'DEVICE') throw new BadRequestException('Phạm vi phát không hợp lệ.');
    if (targetType === 'AREA' && !targetArea) throw new BadRequestException('Vui lòng chọn địa bàn phát.');
    if (targetType === 'DEVICE' && !targetDeviceIds.length) throw new BadRequestException('Vui lòng chọn thiết bị phát.');
    if (!targetLabel) throw new BadRequestException('Nhãn phạm vi phát không được để trống.');
    if (targetType === 'DEVICE') {
      const devices = await Promise.all(targetDeviceIds.map((deviceId) => this.storage.getDevice(deviceId, communeId)));
      if (devices.some((device) => !device)) throw new NotFoundException('Không tìm thấy thiết bị trong phạm vi xã.');
    }

    return this.storage.createLiveBroadcastSession({
      title,
      targetType,
      targetArea: targetType === 'AREA' ? targetArea : null,
      targetDeviceIds: targetType === 'DEVICE' ? targetDeviceIds : [],
      targetLabel,
      micLabel: input.micLabel || null,
      startedBy: input.startedBy || user.displayName || user.username,
    }, communeId);
  }

  async finishSession(sessionId: string, message: string | null | undefined, user: CurrentUser) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'FINISHED', message || null, getUserCommuneScope(user));
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }

  async failSession(sessionId: string, message: string | null | undefined, user: CurrentUser) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'FAILED', message || null, getUserCommuneScope(user));
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }

  async deleteSession(sessionId: string, user: CurrentUser) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'DELETED', 'Đã xóa bởi quản trị viên.', getUserCommuneScope(user));
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }
}
