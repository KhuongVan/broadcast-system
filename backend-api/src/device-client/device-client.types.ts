import { Request } from 'express';
import { DeviceConnectionType, DeviceRecord } from '../devices/device.types';

export type DeviceClientRequest = Request & {
  deviceClient?: DeviceRecord;
};

export type DeviceClientRegisterBody = {
  androidId?: string;
  macAddress?: string;
  name?: string;
  connectionType?: DeviceConnectionType;
  appVersion?: string;
};

export type DeviceClientHeartbeatBody = {
  status?: string;
  appVersion?: string;
  connectionType?: DeviceConnectionType;
  networkType?: string;
  batteryLevel?: number;
};

export type DeviceClientPlaybackStateBody = {
  playStatus?: 'IDLE' | 'PLAYING' | 'STOPPED' | 'ERROR';
  currentScheduleId?: string | null;
  positionSeconds?: number;
  message?: string;
};

export type DeviceClientSyncResultBody = {
  scheduleId?: string;
  syncStatus?: 'SYNCED' | 'FAILED';
  syncMessage?: string;
};

export type DeviceClientMicTestUploadBody = {
  durationSeconds?: number | string;
  message?: string;
};
