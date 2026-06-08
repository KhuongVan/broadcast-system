import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DeviceClientAuthGuard } from './device-client-auth.guard';
import { DeviceClientController } from './device-client.controller';
import { DeviceClientService } from './device-client.service';

@Module({
  imports: [StorageModule],
  controllers: [DeviceClientController],
  providers: [DeviceClientService, DeviceClientAuthGuard],
})
export class DeviceClientModule {}
