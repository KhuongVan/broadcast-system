export type Session = {
  authenticated: boolean;
  username: string | null;
  expiresAt: string | null;
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
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleInput = {
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
  enabled: boolean;
};

export type DeviceInput = {
  name: string;
  macAddress: string;
  area: string;
  connectionType: 'LAN' | '4G';
  latitude: number | null;
  longitude: number | null;
};

export type Device = {
  deviceId: string;
  name: string;
  macAddress: string;
  androidId: string | null;
  area: string;
  connectionType: 'LAN' | '4G';
  online: boolean;
  lastSeenAt: string | null;
  playAllowed: boolean;
  activeSchedule: Schedule | null;
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
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
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
