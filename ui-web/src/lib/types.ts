export type Session = {
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  role: 'SYSTEM_ADMIN' | 'COMMUNE_USER' | string | null;
  communeId: string | null;
  communeName: string | null;
  expiresAt: string | null;
};

export type Commune = {
  communeId: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
};

export type AppUser = {
  userId: string;
  username: string;
  displayName: string | null;
  role: 'SYSTEM_ADMIN' | 'COMMUNE_USER' | string;
  communeId: string | null;
  communeName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AudioFile = {
  fileId: string;
  originalName: string;
  storagePath: string;
  size: number;
  mimetype: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type PlaylistItem = {
  playlistItemId: string;
  playlistId: string;
  fileId: string;
  sortOrder: number;
  createdAt: string;
  file: AudioFile;
};

export type Playlist = {
  playlistId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalFiles: number;
  totalSize: number;
  items: PlaylistItem[];
};

export type ScheduleSourceType = 'FILE' | 'RTSP';
export type SchedulePriority = 'NORMAL' | 'EMERGENCY';
export type ScheduleRepeatType = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleFileMode = 'PLAYLIST' | 'SINGLE_FILE';

export type Schedule = {
  scheduleId: string;
  scheduleGroupId: string | null;
  name: string;
  sourceType: ScheduleSourceType;
  priority: SchedulePriority;
  playlistId: string | null;
  fileId: string | null;
  fileMode: ScheduleFileMode | null;
  rtspUrl: string | null;
  startDate: string;
  startTime: string;
  endTime: string;
  repeatType: ScheduleRepeatType;
  repeatCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleGroup = {
  scheduleGroupId: string;
  name: string;
  enabled: boolean;
  communeId: string | null;
  programCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleGroupInput = {
  name: string;
  enabled: boolean;
};

export type ScheduleInput = {
  scheduleGroupId?: string | null;
  name: string;
  sourceType: ScheduleSourceType;
  priority: SchedulePriority;
  playlistId: string | null;
  fileId: string | null;
  fileMode: ScheduleFileMode | null;
  rtspUrl: string | null;
  startDate: string;
  startTime: string;
  endTime: string;
  repeatType: ScheduleRepeatType;
  repeatCount: number;
  enabled: boolean;
};

export type DeviceInput = {
  name: string;
  macAddress: string;
  simNumber: string | null;
  receiverInstalledDate: string | null;
  simRegisteredDate: string | null;
  area: string;
  communeId?: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type Device = {
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
  connectionType: 'LAN' | '4G' | 'UNKNOWN';
  online: boolean;
  lastSeenAt: string | null;
  playAllowed: boolean;
  activeSchedule: Schedule | null;
  scheduleAssignments: DeviceScheduleAssignment[];
  currentSchedule: Schedule | null;
  playStatus: 'IDLE' | 'PLAYING' | 'STOPPED' | 'ERROR';
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | null;
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
  volumeSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | null;
  volumeSyncMessage: string | null;
  volumeUpdatedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DeviceScheduleAssignment = {
  assignmentId: string;
  deviceId: string;
  scheduleId: string | null;
  scheduleGroupId: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  lastSyncedAt: string | null;
  syncMessage: string | null;
  createdAt: string;
  updatedAt: string;
  schedule: Schedule | null;
  scheduleGroup: ScheduleGroup | null;
};

export type DeviceRecordingStatus = 'REQUESTED' | 'RECORDING' | 'STOP_REQUESTED' | 'UPLOADING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export type DeviceRecordingSession = {
  recordingId: string;
  deviceId: string;
  status: DeviceRecordingStatus;
  recordingSource: 'MANUAL' | 'AUTO_PLAYBACK';
  scheduleId: string | null;
  fileId: string | null;
  playbackStartedAt: string | null;
  playbackEndedAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  uploadedAt: string | null;
  durationSeconds: number | null;
  message: string | null;
  uploadId: string | null;
  audioUrl: string | null;
  fileName: string | null;
  mimetype: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
};

export type RecordingProofSourceType = 'SCHEDULE' | 'LIVE' | 'EMERGENCY';

export type DeviceRecordingSegment = {
  segmentId: string;
  deviceId: string;
  sourceType: RecordingProofSourceType;
  scheduleId: string | null;
  sessionId: string | null;
  fileName: string;
  storagePath: string;
  mimetype: string;
  size: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number | null;
  segmentIndex: number;
  isFinalSegment: boolean;
  message: string | null;
  uploadedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  audioUrl: string | null;
};

export type TtsVoice = {
  code: string;
  label: string;
};

export type TtsVoicesResponse = {
  provider: string;
  defaultVoice: string;
  defaultSpeed: string;
  voices: TtsVoice[];
};

export type TtsGenerateInput = {
  title: string;
  text: string;
  voice: string;
  speed: string;
};

export type ScheduleStatus = {
  activeSchedule: Schedule | null;
  pausedSchedule: Schedule | null;
};

export type LiveBroadcastTargetType = 'AREA' | 'DEVICE';
export type LiveBroadcastStatus = 'STARTED' | 'FINISHED' | 'FAILED' | 'DELETED';

export type LiveBroadcastSession = {
  sessionId: string;
  title: string;
  targetType: LiveBroadcastTargetType;
  targetArea: string | null;
  targetDeviceIds: string[];
  targetLabel: string;
  micLabel: string | null;
  startedAt: string;
  endedAt: string | null;
  status: LiveBroadcastStatus;
  startedBy: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveBroadcastCreateInput = {
  title: string;
  targetType: LiveBroadcastTargetType;
  targetArea: string | null;
  targetDeviceIds: string[];
  targetLabel: string;
  micLabel: string | null;
  startedBy: string | null;
};

export type EmergencySource = {
  sourceId: string;
  name: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EmergencySourceInput = {
  name: string;
  url: string;
  sortOrder?: number;
};

export type EmergencyBroadcastStatus = 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export type EmergencyBroadcastSession = {
  sessionId: string;
  sourceId: string | null;
  sourceName: string;
  sourceUrl: string;
  targetDeviceIds: string[];
  targetLabel: string;
  durationMinutes: number;
  startedBy: string | null;
  startedAt: string;
  scheduledEndAt: string;
  endedAt: string | null;
  status: EmergencyBroadcastStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmergencyBroadcastStartInput = {
  sourceId: string;
  deviceIds: string[];
  durationMinutes: number;
  startedBy?: string | null;
};
