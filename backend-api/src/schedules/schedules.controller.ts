import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
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
  async list() {
    return { schedules: await this.schedules.listSchedules() };
  }

  @Post()
  async create(@Body() body: ScheduleInput) {
    return { schedule: await this.schedules.createSchedule(body) };
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
  async get(@Param('scheduleId') scheduleId: string) {
    return { schedule: await this.schedules.getSchedule(scheduleId) };
  }

  @Put('/:scheduleId')
  async update(@Param('scheduleId') scheduleId: string, @Body() body: ScheduleInput) {
    return { schedule: await this.schedules.updateSchedule(scheduleId, body) };
  }

  @Delete('/:scheduleId')
  async delete(@Param('scheduleId') scheduleId: string) {
    await this.schedules.deleteSchedule(scheduleId);
    return { success: true };
  }
}
