import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AudioFilesService {
  constructor(private readonly storage: StorageService) {}

  registerUpload(file: Express.Multer.File) {
    return this.storage.uploadAudioFile(file);
  }

  getFile(fileId: string) {
    return this.storage.getFile(fileId);
  }

  listFiles() {
    return this.storage.listFiles();
  }

  async getSignedUrl(fileId: string) {
    const record = await this.getFile(fileId);
    return record ? this.storage.createSignedUrl(record.storagePath) : null;
  }
}
