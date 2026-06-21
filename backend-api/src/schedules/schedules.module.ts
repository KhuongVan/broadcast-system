import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { ScheduleGroupsController } from './schedule-groups.controller';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule, StorageModule, MediaModule],
  controllers: [SchedulesController, ScheduleGroupsController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
