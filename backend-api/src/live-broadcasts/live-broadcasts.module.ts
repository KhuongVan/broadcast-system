import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { LiveBroadcastsController } from './live-broadcasts.controller';
import { LiveBroadcastsService } from './live-broadcasts.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [LiveBroadcastsController],
  providers: [LiveBroadcastsService],
})
export class LiveBroadcastsModule {}
