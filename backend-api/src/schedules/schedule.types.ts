export type ScheduleSourceType = 'FILE' | 'RTSP';
export type SchedulePriority = 'NORMAL' | 'EMERGENCY';
export type ScheduleRepeatType = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleFileMode = 'PLAYLIST' | 'SINGLE_FILE';

export type BroadcastScheduleRecord = {
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
  repeatCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  name?: string;
  sourceType?: ScheduleSourceType;
  priority?: SchedulePriority;
  playlistId?: string | null;
  fileId?: string | null;
  fileMode?: ScheduleFileMode | null;
  rtspUrl?: string | null;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  repeatType?: ScheduleRepeatType;
  repeatCount?: number;
  enabled?: boolean;
};
