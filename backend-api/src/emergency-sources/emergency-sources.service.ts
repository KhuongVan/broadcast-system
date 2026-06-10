import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { EmergencySourceInput } from './emergency-source.types';

@Injectable()
export class EmergencySourcesService {
  constructor(private readonly storage: StorageService) {}

  listSources() {
    return this.storage.listEmergencySources();
  }

  async createSource(input: Partial<EmergencySourceInput>) {
    const name = (input.name || '').trim();
    const url = (input.url || '').trim();
    if (!name) throw new BadRequestException('Tên nguồn không được để trống.');
    if (!url) throw new BadRequestException('URL không được để trống.');
    return this.storage.createEmergencySource({ name, url, sortOrder: input.sortOrder ?? 0 });
  }

  async updateSource(sourceId: string, input: Partial<EmergencySourceInput>) {
    const name = (input.name || '').trim();
    const url = (input.url || '').trim();
    if (!name) throw new BadRequestException('Tên nguồn không được để trống.');
    if (!url) throw new BadRequestException('URL không được để trống.');
    const record = await this.storage.updateEmergencySource(sourceId, { name, url, sortOrder: input.sortOrder ?? 0 });
    if (!record) throw new NotFoundException('Không tìm thấy nguồn phát.');
    return record;
  }

  async deleteSource(sourceId: string) {
    await this.storage.deleteEmergencySource(sourceId);
  }
}
