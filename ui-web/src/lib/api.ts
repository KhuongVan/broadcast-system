import type {
  AudioFile,
  Device,
  DeviceInput,
  DeviceRecordingSession,
  EmergencyBroadcastSession,
  EmergencyBroadcastStartInput,
  EmergencySource,
  EmergencySourceInput,
  LiveBroadcastCreateInput,
  LiveBroadcastSession,
  Playlist,
  Schedule,
  ScheduleInput,
  Session,
  TtsGenerateInput,
  TtsVoicesResponse,
} from './types';

type ApiOptions = RequestInit & {
  json?: unknown;
};

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body;

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: 'include',
  });

  if (!response.ok) {
    const message = await readError(response);
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return payload?.message || payload?.error || '';
  }

  return response.text().catch(() => '');
}

export const adminApi = {
  me: () => api<Session>('/api/auth/me'),
  login: (username: string, password: string) =>
    api<{ authenticated: true }>('/api/auth/login', {
      method: 'POST',
      json: { username, password },
    }),
  logout: () =>
    api<{ authenticated: false }>('/api/auth/logout', {
      method: 'POST',
    }),
  listFiles: () => api<{ files: AudioFile[] }>('/api/files'),
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('mp3', file);
    return api<AudioFile & { success: true; path: string }>('/upload', {
      method: 'POST',
      body: formData,
    });
  },
  listPlaylists: () => api<{ playlists: Playlist[] }>('/api/playlists'),
  createPlaylist: (name: string) =>
    api<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      json: { name },
    }),
  getPlaylist: (playlistId: string) => api<{ playlist: Playlist }>(`/api/playlists/${playlistId}`),
  updatePlaylist: (playlistId: string, name: string) =>
    api<{ playlist: Playlist }>(`/api/playlists/${playlistId}`, {
      method: 'PUT',
      json: { name },
    }),
  deletePlaylist: (playlistId: string) =>
    api<{ success: true }>(`/api/playlists/${playlistId}`, {
      method: 'DELETE',
    }),
  addPlaylistItem: (playlistId: string, fileId: string) =>
    api<{ playlist: Playlist }>(`/api/playlists/${playlistId}/items`, {
      method: 'POST',
      json: { fileId },
    }),
  deletePlaylistItem: (playlistId: string, playlistItemId: string) =>
    api<{ success: true }>(`/api/playlists/${playlistId}/items/${playlistItemId}`, {
      method: 'DELETE',
    }),
  listSchedules: () => api<{ schedules: Schedule[] }>('/api/schedules'),
  createSchedule: (schedule: ScheduleInput) =>
    api<{ schedule: Schedule }>('/api/schedules', {
      method: 'POST',
      json: schedule,
    }),
  updateSchedule: (scheduleId: string, schedule: ScheduleInput) =>
    api<{ schedule: Schedule }>(`/api/schedules/${scheduleId}`, {
      method: 'PUT',
      json: schedule,
    }),
  deleteSchedule: (scheduleId: string) =>
    api<{ success: true }>(`/api/schedules/${scheduleId}`, {
      method: 'DELETE',
    }),
  testRtsp: (rtspUrl: string) =>
    api<{ ok?: boolean; success?: boolean; message?: string; url?: string }>('/api/schedules/test-rtsp', {
      method: 'POST',
      json: { rtspUrl },
    }),
  listDevices: () => api<{ devices: Device[] }>('/api/devices'),
  createDevice: (device: DeviceInput) =>
    api<{ device: Device }>('/api/devices', {
      method: 'POST',
      json: device,
    }),
  updateDevice: (deviceId: string, device: DeviceInput) =>
    api<{ device: Device }>(`/api/devices/${deviceId}`, {
      method: 'PUT',
      json: device,
    }),
  deleteDevice: (deviceId: string) =>
    api<{ device: Device }>(`/api/devices/${deviceId}`, {
      method: 'DELETE',
    }),
  updateDevicePlayAllowed: (deviceId: string, playAllowed: boolean) =>
    api<{ device: Device }>(`/api/devices/${deviceId}/play-allowed`, {
      method: 'PUT',
      json: { playAllowed },
    }),
  updateDeviceVolume: (deviceId: string, volumeLevel: number) =>
    api<{ device: Device }>(`/api/devices/${deviceId}/volume`, {
      method: 'PUT',
      json: { volumeLevel },
    }),
  listDeviceRecordings: (deviceId: string) => api<{ recordings: DeviceRecordingSession[] }>(`/api/devices/${deviceId}/recordings`),
  startDeviceRecording: (deviceId: string) =>
    api<{ recording: DeviceRecordingSession }>(`/api/devices/${deviceId}/recordings/start`, {
      method: 'POST',
    }),
  stopDeviceRecording: (deviceId: string, recordingId: string) =>
    api<{ recording: DeviceRecordingSession }>(`/api/devices/${deviceId}/recordings/${recordingId}/stop`, {
      method: 'POST',
    }),
  playDeviceNow: (deviceId: string, scheduleId: string) =>
    api<{ device: Device }>(`/api/devices/${deviceId}/play-now`, {
      method: 'POST',
      json: { scheduleId },
    }),
  stopDevice: (deviceId: string) =>
    api<{ device: Device }>(`/api/devices/${deviceId}/stop`, {
      method: 'POST',
    }),
  syncDeviceSchedule: (deviceId: string, scheduleId: string) =>
    api<{ device: Device }>(`/api/devices/${deviceId}/sync-schedule`, {
      method: 'POST',
      json: { scheduleId },
    }),
  listLiveBroadcasts: () => api<{ sessions: LiveBroadcastSession[] }>('/api/live-broadcasts'),
  createLiveBroadcast: (input: LiveBroadcastCreateInput) =>
    api<{ session: LiveBroadcastSession }>('/api/live-broadcasts', {
      method: 'POST',
      json: input,
    }),
  finishLiveBroadcast: (sessionId: string, message?: string) =>
    api<{ session: LiveBroadcastSession }>(`/api/live-broadcasts/${sessionId}/finish`, {
      method: 'PUT',
      json: { message },
    }),
  failLiveBroadcast: (sessionId: string, message?: string) =>
    api<{ session: LiveBroadcastSession }>(`/api/live-broadcasts/${sessionId}/fail`, {
      method: 'PUT',
      json: { message },
    }),
  deleteLiveBroadcast: (sessionId: string) =>
    api<{ session: LiveBroadcastSession }>(`/api/live-broadcasts/${sessionId}`, {
      method: 'DELETE',
    }),
  listTtsVoices: () => api<TtsVoicesResponse>('/api/tts/voices'),
  generateTts: (input: TtsGenerateInput) =>
    api<{ file: AudioFile; voice: string; speed: string; characters: number }>('/api/tts/generate', {
      method: 'POST',
      json: input,
    }),
  // Emergency Sources
  listEmergencySources: () => api<{ sources: EmergencySource[] }>('/api/emergency-sources'),
  createEmergencySource: (input: EmergencySourceInput) =>
    api<{ source: EmergencySource }>('/api/emergency-sources', {
      method: 'POST',
      json: input,
    }),
  updateEmergencySource: (sourceId: string, input: EmergencySourceInput) =>
    api<{ source: EmergencySource }>(`/api/emergency-sources/${sourceId}`, {
      method: 'PUT',
      json: input,
    }),
  deleteEmergencySource: (sourceId: string) =>
    api<{ success: true }>(`/api/emergency-sources/${sourceId}`, {
      method: 'DELETE',
    }),
  // Emergency Broadcasts
  listEmergencyBroadcasts: () => api<{ sessions: EmergencyBroadcastSession[] }>('/api/emergency-broadcasts'),
  startEmergencyBroadcast: (input: EmergencyBroadcastStartInput) =>
    api<{ session: EmergencyBroadcastSession }>('/api/emergency-broadcasts/start', {
      method: 'POST',
      json: input,
    }),
  stopEmergencyBroadcast: (sessionId: string) =>
    api<{ session: EmergencyBroadcastSession }>(`/api/emergency-broadcasts/${sessionId}/stop`, {
      method: 'POST',
    }),
};
