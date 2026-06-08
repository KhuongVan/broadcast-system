import { Module } from '@nestjs/common';
import { AudioFilesModule } from '../audio-files/audio-files.module';
import { MediaService } from './media.service';

@Module({
  imports: [AudioFilesModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
