import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../auth/auth.types';
import { SystemAdminOnly } from '../auth/roles.decorator';
import { DeviceInput } from './device.types';
import { DevicesService } from './devices.service';

@Controller()
@UseGuards(AdminAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('/api/devices')
  async listDevices(@CurrentUser() user: CurrentUserType) {
    return { devices: await this.devices.listDevices(user) };
  }

  @Get('/api/devices/:deviceId')
  async getDevice(@Param('deviceId') deviceId: string, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.getDevice(deviceId, user) };
  }

  @Post('/api/devices')
  @SystemAdminOnly()
  async createDevice(@Body() body: Partial<DeviceInput>) {
    return { device: await this.devices.createDevice(body) };
  }

  @Put('/api/devices/:deviceId')
  @SystemAdminOnly()
  async updateDevice(@Param('deviceId') deviceId: string, @Body() body: Partial<DeviceInput>) {
    return { device: await this.devices.updateDevice(deviceId, body) };
  }

  @Delete('/api/devices/:deviceId')
  @SystemAdminOnly()
  async deleteDevice(@Param('deviceId') deviceId: string) {
    return { device: await this.devices.softDeleteDevice(deviceId) };
  }

  @Post('/api/devices/:deviceId/provisioning-token')
  @SystemAdminOnly()
  async createProvisioningToken(@Param('deviceId') deviceId: string) {
    return this.devices.createProvisioningToken(deviceId);
  }

  @Put('/api/devices/:deviceId/play-allowed')
  async updatePlayAllowed(@Param('deviceId') deviceId: string, @Body() body: { playAllowed?: boolean }, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.updatePlayAllowed(deviceId, Boolean(body.playAllowed), user) };
  }

  @Put('/api/devices/:deviceId/volume')
  async updateVolume(@Param('deviceId') deviceId: string, @Body() body: { volumeLevel?: number }, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.updateVolume(deviceId, body.volumeLevel, user) };
  }

  @Delete('/api/devices/:deviceId/schedules/:scheduleId')
  async removeSchedule(@Param('deviceId') deviceId: string, @Param('scheduleId') scheduleId: string, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.removeScheduleFromDevice(deviceId, scheduleId, user) };
  }

  @Get('/api/devices/:deviceId/recordings')
  async listRecordings(@Param('deviceId') deviceId: string, @CurrentUser() user: CurrentUserType) {
    return { recordings: await this.devices.listRecordings(deviceId, user) };
  }

  @Get('/api/devices/:deviceId/recording-segments')
  async listRecordingSegments(@Param('deviceId') deviceId: string, @Query() query: { date?: string; sourceType?: string }, @CurrentUser() user: CurrentUserType) {
    return { segments: await this.devices.listRecordingSegments(deviceId, query, user) };
  }

  @Post('/api/devices/:deviceId/recordings/start')
  async startRecording(@Param('deviceId') deviceId: string, @CurrentUser() user: CurrentUserType) {
    return { recording: await this.devices.startRecording(deviceId, user) };
  }

  @Post('/api/devices/:deviceId/recordings/:recordingId/stop')
  async stopRecording(@Param('deviceId') deviceId: string, @Param('recordingId') recordingId: string, @CurrentUser() user: CurrentUserType) {
    return { recording: await this.devices.stopRecording(deviceId, recordingId, user) };
  }

  @Post('/api/devices/:deviceId/play-now')
  async playNow(@Param('deviceId') deviceId: string, @Body() body: { scheduleId?: string }, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.playNow(deviceId, body.scheduleId || '', user) };
  }

  @Post('/api/devices/:deviceId/stop')
  async stop(@Param('deviceId') deviceId: string, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.stop(deviceId, user) };
  }

  @Post('/api/devices/:deviceId/sync-schedule')
  async syncSchedule(@Param('deviceId') deviceId: string, @Body() body: { scheduleId?: string }, @CurrentUser() user: CurrentUserType) {
    return { device: await this.devices.syncScheduleToDevice(deviceId, body.scheduleId || '', user) };
  }
}
