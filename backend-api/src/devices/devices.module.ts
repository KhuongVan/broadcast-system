import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
