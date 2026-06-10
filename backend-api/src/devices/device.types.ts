import { BroadcastScheduleRecord } from '../schedules/schedule.types';

export type DeviceConnectionType = 'LAN' | '4G';
export type DeviceSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export type DevicePlayStatus = 'IDLE' | 'PLAYING' | 'STOPPED' | 'ERROR';

export type DeviceRecord = {
  deviceId: string;
  name: string;
  macAddress: string;
  simNumber: string | null;
  androidId: string | null;
  area: string;
  connectionType: DeviceConnectionType;
  online: boolean;
  lastSeenAt: string | null;
  playAllowed: boolean;
  activeSchedule: BroadcastScheduleRecord | null;
  currentSchedule: BroadcastScheduleRecord | null;
  playStatus: DevicePlayStatus;
  syncStatus: DeviceSyncStatus | null;
  lastSyncedAt: string | null;
  syncMessage: string | null;
  appVersion: string | null;
  networkType: string | null;
  batteryLevel: number | null;
  playbackMessage: string | null;
  playbackPositionSeconds: number | null;
  playbackUpdatedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DeviceInput = {
  name: string;
  macAddress: string;
  simNumber: string | null;
  area: string;
  connectionType: DeviceConnectionType;
  latitude: number | null;
  longitude: number | null;
};
