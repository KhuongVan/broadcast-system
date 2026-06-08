import { Module } from '@nestjs/common';
import { AudioFilesModule } from '../audio-files/audio-files.module';
import { AuthModule } from '../auth/auth.module';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [AuthModule, AudioFilesModule],
  controllers: [TtsController],
  providers: [TtsService],
})
export class TtsModule {}
