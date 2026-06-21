import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { MediaService } from '../media/media.service';
import { ScheduleInput } from './schedule.types';
import { SchedulesService } from './schedules.service';

@Controller('/api/schedules')
@UseGuards(AdminAuthGuard)
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly media: MediaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    return { schedules: await this.schedules.listSchedules(user) };
  }

  @Post()
  async create(@Body() body: ScheduleInput, @CurrentUser() user: CurrentUserType) {
    return { schedule: await this.schedules.createSchedule(body, user) };
  }

  @Post('/test-rtsp')
  async testRtsp(@Body() body: { rtspUrl?: string }) {
    const rtspUrl = (body.rtspUrl || '').trim();
    if (!this.isSupportedStreamUrl(rtspUrl)) {
      throw new BadRequestException('Stream URL phải bắt đầu bằng rtsp://, http:// hoặc https://');
    }

    return this.media.testRtspUrl(rtspUrl);
  }

  private isSupportedStreamUrl(url: string) {
    const value = url.toLowerCase();
    return value.startsWith('rtsp://') || value.startsWith('http://') || value.startsWith('https://');
  }

  @Get('/:scheduleId')
  async get(@Param('scheduleId') scheduleId: string, @CurrentUser() user: CurrentUserType) {
    return { schedule: await this.schedules.getSchedule(scheduleId, user) };
  }

  @Put('/:scheduleId')
  async update(@Param('scheduleId') scheduleId: string, @Body() body: ScheduleInput, @CurrentUser() user: CurrentUserType) {
    return { schedule: await this.schedules.updateSchedule(scheduleId, body, user) };
  }

  @Delete('/:scheduleId')
  async delete(@Param('scheduleId') scheduleId: string, @CurrentUser() user: CurrentUserType) {
    await this.schedules.deleteSchedule(scheduleId, user);
    return { success: true };
  }
}
