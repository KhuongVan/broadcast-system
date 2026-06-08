import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AudioFilesController } from './audio-files.controller';
import { AudioFilesService } from './audio-files.service';

@Module({
  imports: [AuthModule, StorageModule, MulterModule.register({})],
  controllers: [AudioFilesController],
  providers: [AudioFilesService],
  exports: [AudioFilesService],
})
export class AudioFilesModule {}
