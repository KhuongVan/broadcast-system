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
