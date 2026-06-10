import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { EmergencyBroadcastsController } from './emergency-broadcasts.controller';
import { EmergencyBroadcastsService } from './emergency-broadcasts.service';

@Module({
  imports: [StorageModule],
  controllers: [EmergencyBroadcastsController],
  providers: [EmergencyBroadcastsService],
})
export class EmergencyBroadcastsModule {}
