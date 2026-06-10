import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { EmergencyBroadcastStartInput } from './emergency-broadcast.types';

@Injectable()
export class EmergencyBroadcastsService {
  constructor(private readonly storage: StorageService) {}

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

    // Write PLAY_EMERGENCY command for each device
    await this.storage.createEmergencyCommandsForDevices(deviceIds, 'PLAY_EMERGENCY', {
      url: source.url,
      durationMinutes,
      sessionId: session.sessionId,
    });

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

    // Write STOP_EMERGENCY command for each device
    await this.storage.createEmergencyCommandsForDevices(session.targetDeviceIds, 'STOP_EMERGENCY', {
      sessionId,
    });

    return updated;
  }
}
