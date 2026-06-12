import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { DeviceInput } from './device.types';
import { DevicesService } from './devices.service';

@Controller()
@UseGuards(AdminAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get('/api/devices')
  async listDevices() {
    return { devices: await this.devices.listDevices() };
  }

  @Get('/api/devices/:deviceId')
  async getDevice(@Param('deviceId') deviceId: string) {
    return { device: await this.devices.getDevice(deviceId) };
  }

  @Post('/api/devices')
  async createDevice(@Body() body: Partial<DeviceInput>) {
    return { device: await this.devices.createDevice(body) };
  }

  @Put('/api/devices/:deviceId')
  async updateDevice(@Param('deviceId') deviceId: string, @Body() body: Partial<DeviceInput>) {
    return { device: await this.devices.updateDevice(deviceId, body) };
  }

  @Delete('/api/devices/:deviceId')
  async deleteDevice(@Param('deviceId') deviceId: string) {
    return { device: await this.devices.softDeleteDevice(deviceId) };
  }

  @Put('/api/devices/:deviceId/play-allowed')
  async updatePlayAllowed(@Param('deviceId') deviceId: string, @Body() body: { playAllowed?: boolean }) {
    return { device: await this.devices.updatePlayAllowed(deviceId, Boolean(body.playAllowed)) };
  }

  @Put('/api/devices/:deviceId/volume')
  async updateVolume(@Param('deviceId') deviceId: string, @Body() body: { volumeLevel?: number }) {
    return { device: await this.devices.updateVolume(deviceId, body.volumeLevel) };
  }

  @Delete('/api/devices/:deviceId/schedules/:scheduleId')
  async removeSchedule(@Param('deviceId') deviceId: string, @Param('scheduleId') scheduleId: string) {
    return { device: await this.devices.removeScheduleFromDevice(deviceId, scheduleId) };
  }

  @Get('/api/devices/:deviceId/recordings')
  async listRecordings(@Param('deviceId') deviceId: string) {
    return { recordings: await this.devices.listRecordings(deviceId) };
  }

  @Post('/api/devices/:deviceId/recordings/start')
  async startRecording(@Param('deviceId') deviceId: string) {
    return { recording: await this.devices.startRecording(deviceId) };
  }

  @Post('/api/devices/:deviceId/recordings/:recordingId/stop')
  async stopRecording(@Param('deviceId') deviceId: string, @Param('recordingId') recordingId: string) {
    return { recording: await this.devices.stopRecording(deviceId, recordingId) };
  }

  @Post('/api/devices/:deviceId/play-now')
  async playNow(@Param('deviceId') deviceId: string, @Body() body: { scheduleId?: string }) {
    return { device: await this.devices.playNow(deviceId, body.scheduleId || '') };
  }

  @Post('/api/devices/:deviceId/stop')
  async stop(@Param('deviceId') deviceId: string) {
    return { device: await this.devices.stop(deviceId) };
  }

  @Post('/api/devices/:deviceId/sync-schedule')
  async syncSchedule(@Param('deviceId') deviceId: string, @Body() body: { scheduleId?: string }) {
    return { device: await this.devices.syncScheduleToDevice(deviceId, body.scheduleId || '') };
  }
}
