export type EmergencyBroadcastStatus = 'ACTIVE' | 'FINISHED' | 'CANCELLED';

export type EmergencyBroadcastRecord = {
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
