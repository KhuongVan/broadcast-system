export type EmergencySourceRecord = {
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
