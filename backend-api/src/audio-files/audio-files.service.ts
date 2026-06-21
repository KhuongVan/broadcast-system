import { Injectable } from '@nestjs/common';
import { CurrentUser, getUserCommuneScope } from '../auth/auth.types';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AudioFilesService {
  constructor(private readonly storage: StorageService) {}

  registerUpload(file: Express.Multer.File, user?: CurrentUser) {
    return this.storage.uploadAudioFile(file, user ? getUserCommuneScope(user) : null);
  }

  getFile(fileId: string) {
    return this.storage.getFile(fileId);
  }

  listFiles(user?: CurrentUser) {
    return this.storage.listFiles(user ? getUserCommuneScope(user) : null);
  }

  async getSignedUrl(fileId: string) {
    const record = await this.getFile(fileId);
    return record ? this.storage.createSignedUrl(record.storagePath) : null;
  }
}
