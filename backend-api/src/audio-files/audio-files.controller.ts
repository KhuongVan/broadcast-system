import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { config } from '../config';
import { AudioFilesService } from './audio-files.service';

const allowedMimeTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'application/octet-stream']);

function safeFileName(originalName: string) {
  return originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

@Controller()
export class AudioFilesController {
  constructor(private readonly audioFiles: AudioFilesService) {}

  @Get('/api/files')
  async listFiles() {
    return { files: await this.audioFiles.listFiles() };
  }

  @Post('/upload')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('mp3', {
      storage: memoryStorage(),
      limits: { fileSize: config.maxUploadSize },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        cb(null, ext === '.mp3' && allowedMimeTypes.has(file.mimetype));
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui long chon file MP3 hop le.');
    }

    const record = await this.audioFiles.registerUpload(file);
    return {
      success: true,
      ...record,
      path: record.storagePath,
    };
  }

  @Get('/files/:fileId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getFile(@Param('fileId') fileId: string, @Res() res: Response) {
    const signedUrl = await this.audioFiles.getSignedUrl(fileId);

    if (!signedUrl) {
      throw new NotFoundException('Khong tim thay file.');
    }

    res.redirect(signedUrl);
  }
}
