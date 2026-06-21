import { BroadcastScheduleRecord } from '../schedules/schedule.types';

export type DeviceConnectionType = 'LAN' | '4G' | 'UNKNOWN';
export type DeviceSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export type DevicePlayStatus = 'IDLE' | 'PLAYING' | 'STOPPED' | 'ERROR';
export type DeviceVolumeSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type DeviceScheduleAssignmentRecord = {
  assignmentId: string;
  deviceId: string;
  scheduleId: string;
  syncStatus: DeviceSyncStatus;
  lastSyncedAt: string | null;
  syncMessage: string | null;
  createdAt: string;
  updatedAt: string;
  schedule: BroadcastScheduleRecord;
};

export type DeviceRecord = {
  deviceId: string;
  name: string;
  macAddress: string;
  simNumber: string | null;
  receiverInstalledDate: string | null;
  simRegisteredDate: string | null;
  androidId: string | null;
  communeId: string | null;
  provisioningExpiresAt: string | null;
  provisionedAt: string | null;
  area: string;
  connectionType: DeviceConnectionType;
  online: boolean;
  lastSeenAt: string | null;
  playAllowed: boolean;
  activeSchedule: BroadcastScheduleRecord | null;
  scheduleAssignments: DeviceScheduleAssignmentRecord[];
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
  volumeLevel: number | null;
  desiredVolumeLevel: number | null;
  volumeSyncStatus: DeviceVolumeSyncStatus | null;
  volumeSyncMessage: string | null;
  volumeUpdatedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DeviceInput = {
  name: string;
  macAddress: string;
  simNumber: string | null;
  receiverInstalledDate: string | null;
  simRegisteredDate: string | null;
  area: string;
  communeId?: string | null;
  connectionType?: DeviceConnectionType;
  latitude: number | null;
  longitude: number | null;
};
