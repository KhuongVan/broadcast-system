import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { LiveBroadcastCreateInput } from './live-broadcast.types';

@Injectable()
export class LiveBroadcastsService {
  constructor(private readonly storage: StorageService) {}

  listSessions() {
    return this.storage.listLiveBroadcastSessions();
  }

  createSession(input: Partial<LiveBroadcastCreateInput>) {
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

    return this.storage.createLiveBroadcastSession({
      title,
      targetType,
      targetArea: targetType === 'AREA' ? targetArea : null,
      targetDeviceIds: targetType === 'DEVICE' ? targetDeviceIds : [],
      targetLabel,
      micLabel: input.micLabel || null,
      startedBy: input.startedBy || null,
    });
  }

  async finishSession(sessionId: string, message?: string | null) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'FINISHED', message || null);
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }

  async failSession(sessionId: string, message?: string | null) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'FAILED', message || null);
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }

  async deleteSession(sessionId: string) {
    const record = await this.storage.finishLiveBroadcastSession(sessionId, 'DELETED', 'Đã xóa bởi quản trị viên.');
    if (!record) throw new NotFoundException('Không tìm thấy phiên phát trực tiếp.');
    return record;
  }
}
