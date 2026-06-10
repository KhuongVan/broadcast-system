import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { EmergencySourcesController } from './emergency-sources.controller';
import { EmergencySourcesService } from './emergency-sources.service';

@Module({
  imports: [StorageModule],
  controllers: [EmergencySourcesController],
  providers: [EmergencySourcesService],
})
export class EmergencySourcesModule {}
