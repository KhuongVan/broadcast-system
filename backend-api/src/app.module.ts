import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AudioFilesModule } from './audio-files/audio-files.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { DeviceClientModule } from './device-client/device-client.module';
import { DevicesModule } from './devices/devices.module';
import { LiveBroadcastsModule } from './live-broadcasts/live-broadcasts.module';
import { MediaModule } from './media/media.module';
import { PagesController } from './pages/pages.controller';
import { PlaylistsModule } from './playlists/playlists.module';
import { SchedulesModule } from './schedules/schedules.module';
import { StorageModule } from './storage/storage.module';
import { TtsModule } from './tts/tts.module';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    AudioFilesModule,
    PlaylistsModule,
    SchedulesModule,
    DevicesModule,
    LiveBroadcastsModule,
    DeviceClientModule,
    MediaModule,
    BroadcastModule,
    TtsModule,
  ],
  controllers: [PagesController],
})
export class AppModule {}
