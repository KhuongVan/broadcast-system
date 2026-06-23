export type ScheduleSourceType = 'FILE' | 'RTSP';
export type SchedulePriority = 'NORMAL' | 'EMERGENCY';
export type ScheduleRepeatType = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleFileMode = 'PLAYLIST' | 'SINGLE_FILE' | 'SELECTED_FILES';

export type BroadcastScheduleRecord = {
  scheduleId: string;
  scheduleGroupId: string | null;
  name: string;
  sourceType: ScheduleSourceType;
  priority: SchedulePriority;
  playlistId: string | null;
  fileId: string | null;
  fileMode: ScheduleFileMode | null;
  selectedPlaylistItemIds: string[];
  rtspUrl: string | null;
  startDate: string;
  startTime: string;
  endTime: string;
  repeatType: ScheduleRepeatType;
  repeatCount: number;
  enabled: boolean;
  communeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleGroupRecord = {
  scheduleGroupId: string;
  name: string;
  enabled: boolean;
  communeId: string | null;
  programCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleGroupInput = {
  name?: string;
  enabled?: boolean;
};

export type ScheduleRunLogRecord = {
  runLogId: string;
  scheduleId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'STARTED' | 'FINISHED' | 'FAILED' | 'SKIPPED';
  message: string | null;
};

export type ScheduleInput = {
  scheduleGroupId?: string | null;
  name?: string;
  sourceType?: ScheduleSourceType;
  priority?: SchedulePriority;
  playlistId?: string | null;
  fileId?: string | null;
  fileMode?: ScheduleFileMode | null;
  selectedPlaylistItemIds?: string[];
  rtspUrl?: string | null;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  repeatType?: ScheduleRepeatType;
  repeatCount?: number;
  enabled?: boolean;
};
