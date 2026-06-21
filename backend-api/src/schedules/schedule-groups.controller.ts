import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { ScheduleGroupInput, ScheduleInput } from './schedule.types';
import { SchedulesService } from './schedules.service';

@Controller('/api/schedule-groups')
@UseGuards(AdminAuthGuard)
export class ScheduleGroupsController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    return { scheduleGroups: await this.schedules.listScheduleGroups(user) };
  }

  @Post()
  async create(@Body() body: ScheduleGroupInput, @CurrentUser() user: CurrentUserType) {
    return { scheduleGroup: await this.schedules.createScheduleGroup(body, user) };
  }

  @Get('/:scheduleGroupId')
  async get(@Param('scheduleGroupId') scheduleGroupId: string, @CurrentUser() user: CurrentUserType) {
    return { scheduleGroup: await this.schedules.getScheduleGroup(scheduleGroupId, user) };
  }

  @Put('/:scheduleGroupId')
  async update(@Param('scheduleGroupId') scheduleGroupId: string, @Body() body: ScheduleGroupInput, @CurrentUser() user: CurrentUserType) {
    return { scheduleGroup: await this.schedules.updateScheduleGroup(scheduleGroupId, body, user) };
  }

  @Delete('/:scheduleGroupId')
  async delete(@Param('scheduleGroupId') scheduleGroupId: string, @CurrentUser() user: CurrentUserType) {
    await this.schedules.deleteScheduleGroup(scheduleGroupId, user);
    return { success: true };
  }

  @Get('/:scheduleGroupId/programs')
  async listPrograms(@Param('scheduleGroupId') scheduleGroupId: string, @CurrentUser() user: CurrentUserType) {
    return { schedules: await this.schedules.listPrograms(scheduleGroupId, user) };
  }

  @Post('/:scheduleGroupId/programs')
  async createProgram(@Param('scheduleGroupId') scheduleGroupId: string, @Body() body: ScheduleInput, @CurrentUser() user: CurrentUserType) {
    return { schedule: await this.schedules.createProgram(scheduleGroupId, body, user) };
  }

  @Put('/:scheduleGroupId/programs/:scheduleId')
  async updateProgram(
    @Param('scheduleGroupId') scheduleGroupId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() body: ScheduleInput,
    @CurrentUser() user: CurrentUserType,
  ) {
    await this.schedules.getScheduleGroup(scheduleGroupId, user);
    return { schedule: await this.schedules.updateSchedule(scheduleId, { ...body, scheduleGroupId }, user) };
  }

  @Delete('/:scheduleGroupId/programs/:scheduleId')
  async deleteProgram(
    @Param('scheduleGroupId') scheduleGroupId: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    await this.schedules.deleteProgram(scheduleGroupId, scheduleId, user);
    return { success: true };
  }
}
