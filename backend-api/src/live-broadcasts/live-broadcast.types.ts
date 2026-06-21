export type LiveBroadcastTargetType = 'AREA' | 'DEVICE';
export type LiveBroadcastStatus = 'STARTED' | 'FINISHED' | 'FAILED' | 'DELETED';

export type LiveBroadcastRecord = {
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
  communeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveBroadcastCreateInput = {
  title: string;
  targetType: LiveBroadcastTargetType;
  targetArea?: string | null;
  targetDeviceIds?: string[];
  targetLabel: string;
  micLabel?: string | null;
  startedBy?: string | null;
};
