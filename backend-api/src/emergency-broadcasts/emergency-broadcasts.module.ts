import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { EmergencyBroadcastsController } from './emergency-broadcasts.controller';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';

@Module({
  imports: [AuthModule, StorageModule, BroadcastModule, MediaModule],
  controllers: [EmergencyBroadcastsController],
  providers: [EmergencyBroadcastsService],
})
export class EmergencyBroadcastsModule {}
