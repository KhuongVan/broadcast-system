import { Body, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { config } from '../config';
import { DeviceClientAuthGuard } from './device-client-auth.guard';
import { DeviceClientService } from './device-client.service';
import {
  DeviceClientHeartbeatBody,
  DeviceClientCommandResultBody,
  DeviceClientMicTestUploadBody,
  DeviceClientPlaybackStateBody,
  DeviceClientRegisterBody,
  DeviceClientRequest,
  DeviceClientSyncResultBody,
} from './device-client.types';

@Controller('/api/device-client')
export class DeviceClientController {
  constructor(private readonly deviceClient: DeviceClientService) {}

  @Post('/register')
  register(@Body() body: DeviceClientRegisterBody) {
    return this.deviceClient.register(body);
  }

  @Post('/heartbeat')
  @UseGuards(DeviceClientAuthGuard)
  heartbeat(@Req() request: DeviceClientRequest, @Body() body: DeviceClientHeartbeatBody) {
    return this.deviceClient.heartbeat(request.deviceClient!, body);
  }

  @Get('/config')
  @UseGuards(DeviceClientAuthGuard)
  getConfig(@Req() request: DeviceClientRequest) {
    return this.deviceClient.getConfig(request.deviceClient!);
  }

  @Get('/schedule')
  @UseGuards(DeviceClientAuthGuard)
  getSchedule(@Req() request: DeviceClientRequest) {
    return this.deviceClient.getSchedule(request.deviceClient!);
  }

  @Post('/playback-state')
  @UseGuards(DeviceClientAuthGuard)
  updatePlaybackState(@Req() request: DeviceClientRequest, @Body() body: DeviceClientPlaybackStateBody) {
    return this.deviceClient.updatePlaybackState(request.deviceClient!, body);
  }

  @Post('/sync-result')
  @UseGuards(DeviceClientAuthGuard)
  updateSyncResult(@Req() request: DeviceClientRequest, @Body() body: DeviceClientSyncResultBody) {
    return this.deviceClient.updateSyncResult(request.deviceClient!, body);
  }

  @Post('/mic-test-upload')
  @UseGuards(DeviceClientAuthGuard)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: config.maxUploadSize },
    }),
  )
  uploadMicTest(
    @Req() request: DeviceClientRequest,
    @Body() body: DeviceClientMicTestUploadBody,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.deviceClient.uploadMicTest(request.deviceClient!, body, file);
  }

  @Get('/commands')
  @UseGuards(DeviceClientAuthGuard)
  getCommands(@Req() request: DeviceClientRequest) {
    return this.deviceClient.getCommands(request.deviceClient!);
  }

  @Post('/command-result')
  @UseGuards(DeviceClientAuthGuard)
  updateCommandResult(@Req() request: DeviceClientRequest, @Body() body: DeviceClientCommandResultBody) {
    return this.deviceClient.updateCommandResult(request.deviceClient!, body);
  }
}
