import { Module } from '@nestjs/common';
import { AudioFilesModule } from '../audio-files/audio-files.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { PlaylistsModule } from '../playlists/playlists.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { StorageModule } from '../storage/storage.module';
import { BroadcastGateway } from './broadcast.gateway';

@Module({
  imports: [AuthModule, AudioFilesModule, MediaModule, PlaylistsModule, SchedulesModule, StorageModule],
  providers: [BroadcastGateway],
  exports: [BroadcastGateway],
})
export class BroadcastModule {}
