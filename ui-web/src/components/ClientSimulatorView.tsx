import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AudioFile } from '../lib/types';

type ClientRegistrationStatus = {
  status: 'REGISTERED' | 'ERROR' | 'DEMO_GLOBAL';
  message?: string;
  deviceId?: string;
  macAddress?: string;
  androidId?: string;
  device?: {
    deviceId: string;
    name: string;
    area: string;
  };
};

type DeviceClientRegisterResponse = {
  device: {
    deviceId: string;
    name: string;
    area: string;
  };
  deviceToken: string;
  heartbeatIntervalSeconds: number;
};

type DeviceClientHeartbeatResponse = {
  heartbeatIntervalSeconds: number;
};

type ClientUpdatePayload = {
  action: 'START' | 'STOP';
  streamVersion?: number;
  hlsUrl?: string;
  recordingProof?: RecordingProofPayload;
};

type EmergencyPayload = {
  sessionId?: string;
  streamVersion?: number;
  durationMinutes?: number;
  sourceName?: string;
  hlsUrl?: string;
  recordingProof?: RecordingProofPayload;
};

type CachedPlaybackPayload = {
  fileId?: string;
  resetPosition?: boolean;
  startOffsetSeconds?: number;
  serverTimeMs?: number;
  recordingProof?: RecordingProofPayload;
};

type CachedRecord = AudioFile & {
  blob: Blob;
  cachedAt: string;
};

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
};

type HlsConstructor = {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
  Events: {
    MANIFEST_LOADED: string;
    MANIFEST_PARSED: string;
    ERROR: string;
  };
};

type PlaybackRecordingMetadata = {
  label: string;
  fileId?: string;
  recordingProof?: RecordingProofPayload;
};

type PlaybackRecordingState = {
  recorder: MediaRecorder;
  startedAt: string;
  currentSegmentStartedAt: string;
  segmentIndex: number;
  segmentSeconds: number;
  stoppingFinal: boolean;
  stream: MediaStream;
  metadata: PlaybackRecordingMetadata;
};

type RecordingProofPayload = {
  enabled?: boolean;
  sourceType?: 'SCHEDULE' | 'LIVE' | 'EMERGENCY';
  scheduleId?: string | null;
  sessionId?: string | null;
  segmentSeconds?: number;
  paddingBeforeSeconds?: number;
  paddingAfterSeconds?: number;
  audioProfile?: string;
};

declare global {
  interface Window {
    Hls?: HlsConstructor;
  }
}

const DB_NAME = 'broadcast-cache';
const STORE_NAME = 'audio-files';
const POSITION_KEY = 'broadcast-file-positions';
const STREAM_PATH = 'loacuaxa';
const HLS_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
const SIMULATOR_APP_VERSION = 'browser-simulator';

let hlsScriptPromise: Promise<HlsConstructor> | null = null;

export function ClientSimulatorView() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const registrationPayload = useMemo(
    () => ({
      deviceId: (params.get('deviceId') || '').trim(),
      macAddress: (params.get('macAddress') || '').trim(),
      androidId: (params.get('androidId') || '').trim(),
    }),
    [params],
  );
  const registrationLabel = useMemo(() => getRegistrationLabel(registrationPayload), [registrationPayload]);

  const [status, setStatus] = useState('CHỜ PHÁT THANH...');
  const [currentName, setCurrentName] = useState('Chưa có bản tin');
  const [deviceInfo, setDeviceInfo] = useState(
    registrationLabel
      ? `Đang kết nối WebSocket để đăng ký thiết bị bằng ${registrationLabel}`
      : 'Chế độ demo global. Mở /client?deviceId=<uuid> hoặc /client?macAddress=<mac> để kiểm tra theo thiết bị.',
  );
  const [showPlayButton, setShowPlayButton] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const dbRef = useRef<Promise<IDBDatabase> | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const registrationTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const deviceTokenRef = useRef<string | null>(null);
  const emergencyTimerRef = useRef<number | null>(null);
  const currentStreamVersionRef = useRef<number | string | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const currentLocalFileIdRef = useRef<string | null>(null);
  const playbackRecordingRef = useRef<PlaybackRecordingState | null>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    loadStoredPositions(positionsRef.current);
    void registerDeviceClient();
    const socket = io('/', { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => registerSimulatedDevice(socket));
    socket.on('connect_error', () => {
      clearRegistrationTimer();
      setDeviceInfo('Không kết nối được WebSocket. Kiểm tra reverse proxy /socket.io hoặc backend.');
    });
    socket.on('disconnect', () => {
      clearRegistrationTimer();
      setDeviceInfo('Socket mất kết nối. Đang chờ kết nối lại...');
    });
    socket.on('client_registration_status', handleRegistrationStatus);
    socket.on('FILE_AVAILABLE', (file: AudioFile) => {
      ensureCached(file).catch((error) => {
        socket.emit('client_file_error', { fileId: file.fileId, message: getErrorMessage(error) });
        setStatus('LỖI TẢI FILE');
      });
    });
    socket.on('PLAY_CACHED', (data: CachedPlaybackPayload) => {
      void playCached(data, Date.now());
    });
    socket.on('STOP', stopPlayback);
    socket.on('client_update', (data: ClientUpdatePayload) => {
      if (data.action === 'START') void startHlsPlayer(data.streamVersion, 'Phát trực tiếp', data.hlsUrl, data.recordingProof);
      if (data.action === 'STOP') stopPlayback();
    });
    socket.on('PLAY_EMERGENCY', (data: EmergencyPayload) => {
      startEmergencyPlayer(data);
    });
    socket.on('STOP_EMERGENCY', stopEmergencyPlayer);

    return () => {
      clearRegistrationTimer();
      clearHeartbeatTimer();
      clearEmergencyTimer();
      stopPlayback();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [registrationLabel, registrationPayload]);

  async function registerDeviceClient() {
    if (!registrationLabel) return;

    try {
      const response = await fetch('/api/device-client/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...registrationPayload,
          appVersion: SIMULATOR_APP_VERSION,
          connectionType: inferBrowserConnectionType(),
        }),
      });
      if (!response.ok) throw new Error(await readResponseMessage(response));

      const payload = (await response.json()) as DeviceClientRegisterResponse;
      deviceTokenRef.current = payload.deviceToken;
      localStorage.setItem(getDeviceTokenStorageKey(registrationPayload), payload.deviceToken);
      setDeviceInfo(`Thiết bị mô phỏng: ${payload.device.name} | Địa bàn: ${payload.device.area} | ID: ${payload.device.deviceId}`);
      scheduleHeartbeat(payload.heartbeatIntervalSeconds);
    } catch (error) {
      deviceTokenRef.current = localStorage.getItem(getDeviceTokenStorageKey(registrationPayload));
      if (deviceTokenRef.current) {
        setDeviceInfo(`Không đăng ký REST được, đang thử heartbeat bằng token đã lưu. Lỗi: ${getErrorMessage(error)}`);
        scheduleHeartbeat(30);
        return;
      }
      setDeviceInfo(`Không đăng ký REST thiết bị mô phỏng: ${getErrorMessage(error)}`);
    }
  }

  async function sendHeartbeat() {
    if (!deviceTokenRef.current) return;

    const response = await fetch('/api/device-client/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenRef.current}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appVersion: SIMULATOR_APP_VERSION,
        connectionType: inferBrowserConnectionType(),
        networkType: getBrowserNetworkType(),
      }),
    });
    if (!response.ok) throw new Error(await readResponseMessage(response));

    const payload = (await response.json()) as DeviceClientHeartbeatResponse;
    scheduleHeartbeat(payload.heartbeatIntervalSeconds);
  }

  function scheduleHeartbeat(intervalSeconds: number) {
    clearHeartbeatTimer();
    const delayMs = Math.max(5, intervalSeconds || 30) * 1000;
    heartbeatTimerRef.current = window.setTimeout(() => {
      sendHeartbeat().catch((error) => {
        setDeviceInfo(`Heartbeat thiết bị mô phỏng lỗi: ${getErrorMessage(error)}`);
        scheduleHeartbeat(intervalSeconds);
      });
    }, delayMs);
  }

  function registerSimulatedDevice(socket: Socket) {
    clearRegistrationTimer();
    if (registrationLabel) {
      setDeviceInfo(`Socket đã kết nối. Đang đăng ký thiết bị mô phỏng bằng ${registrationLabel}`);
    } else {
      setDeviceInfo('Socket đã kết nối. Chế độ demo global. Mở /client?deviceId=<uuid> hoặc /client?macAddress=<mac> để kiểm tra theo thiết bị.');
    }

    socket.emit('client_register_device', registrationPayload);
    registrationTimerRef.current = window.setTimeout(() => {
      setDeviceInfo('Không nhận được phản hồi đăng ký thiết bị. Kiểm tra WebSocket/proxy hoặc backend.');
    }, 5000);
  }

  function handleRegistrationStatus(payload: ClientRegistrationStatus) {
    clearRegistrationTimer();
    if (payload.status === 'REGISTERED' && payload.device) {
      setDeviceInfo(`Thiết bị mô phỏng: ${payload.device.name} | Địa bàn: ${payload.device.area} | ID: ${payload.device.deviceId}`);
      return;
    }

    if (payload.status === 'ERROR') {
      const failedLabel = registrationLabel || payload.deviceId || payload.macAddress || payload.androidId || 'trống';
      setDeviceInfo(`${payload.message || 'Không đăng ký được thiết bị mô phỏng.'} | Thông tin: ${failedLabel}`);
      return;
    }

    setDeviceInfo(payload.message || 'Chế độ demo global: không kiểm tra được target thiết bị/địa bàn.');
  }

  async function openDb() {
    if (dbRef.current) return dbRef.current;
    dbRef.current = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbRef.current;
  }

  async function getCachedFile(fileId: string): Promise<CachedRecord | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(fileId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function putCachedFile(record: CachedRecord) {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function ensureCached(file: AudioFile) {
    const existing = await getCachedFile(file.fileId);
    if (existing && existing.size === file.size) {
      socketRef.current?.emit('client_file_ready', { fileId: file.fileId });
      return existing;
    }

    setStatus(`ĐANG TẢI FILE: ${file.originalName}`);
    setCurrentName(file.originalName);
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Không tải được file ${file.originalName}`);
    const blob = await response.blob();
    const record: CachedRecord = { ...file, blob, cachedAt: new Date().toISOString() };
    await putCachedFile(record);
    socketRef.current?.emit('client_file_ready', { fileId: file.fileId });
    setStatus('SẴN SÀNG PHÁT THANH');
    return record;
  }

  async function playCached(data: CachedPlaybackPayload, receivedAtMs: number) {
    const fileId = data.fileId || '';
    if (!fileId) return;

    cleanupHls();
    let record = await getCachedFile(fileId);
    if (!record) {
      const file = await findFileInCatalog(fileId);
      if (!file) {
        setStatus('CHƯA CÓ FILE TRONG CACHE...');
        setCurrentName('Chưa có bản tin');
        return;
      }
      record = await ensureCached(file);
    }

    cleanupLocalAudio();
    setCurrentName(record.originalName);
    currentLocalFileIdRef.current = fileId;
    currentObjectUrlRef.current = URL.createObjectURL(record.blob);
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = currentObjectUrlRef.current;

    const startPosition = getSyncedStartPosition(fileId, data, receivedAtMs);
    setLocalPosition(fileId, startPosition);
    let shouldPlay = true;
    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && startPosition >= Math.max(0, audio.duration - 0.25)) {
          shouldPlay = false;
          setLocalPosition(fileId, 0);
          currentLocalFileIdRef.current = null;
          socketRef.current?.emit('client_file_ended', { fileId });
          resolve();
          return;
        }

        if (startPosition > 0) audio.currentTime = startPosition;
        resolve();
      };
      audio.onerror = () => resolve();
      audio.load();
    });

    if (!shouldPlay) {
      cleanupLocalAudio();
      setStatus('ĐANG CHUYỂN BẢN TIN...');
      return;
    }

    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.ontimeupdate = () => setLocalPosition(fileId, audio.currentTime);
    audio.onended = () => {
      setLocalPosition(fileId, 0);
      currentLocalFileIdRef.current = null;
      stopPlaybackRecording();
      socketRef.current?.emit('client_file_ended', { fileId });
    };

    void playAudio('ĐANG PHÁT THANH...', record.originalName, { label: record.originalName, fileId, recordingProof: data.recordingProof });
  }

  async function findFileInCatalog(fileId: string) {
    const response = await fetch('/api/files');
    if (!response.ok) return null;
    const data = (await response.json()) as { files?: AudioFile[] };
    return (data.files || []).find((file) => file.fileId === fileId) || null;
  }

  async function startHlsPlayer(version?: string | number, label = 'Phát trực tiếp', hlsUrl?: string, recordingProof?: RecordingProofPayload) {
    cleanupLocalAudio();
    cleanupHls();
    currentStreamVersionRef.current = version || Date.now();
    setStatus('ĐANG KẾT NỐI LOA...');
    setCurrentName(label);

    const audio = audioRef.current;
    if (!audio) return;

    const streamUrl = resolveHlsUrl(hlsUrl, currentStreamVersionRef.current);
    const manifestCheck = await checkHlsManifest(streamUrl);
    if (!manifestCheck.ok) {
      setStatus(`LỖI KẾT NỐI HLS: ${manifestCheck.message}`);
      setCurrentName(label);
      const retryVersion = currentStreamVersionRef.current;
      retryTimerRef.current = window.setTimeout(() => {
        if (retryVersion === currentStreamVersionRef.current) void startHlsPlayer(retryVersion || undefined, label, hlsUrl, recordingProof);
      }, 1000);
      return;
    }

    const Hls = await loadHls();
    if (!Hls.isSupported()) {
      if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = streamUrl;
        await playAudio('ĐANG PHÁT THANH...', label, { label, recordingProof });
        return;
      }
      setStatus('TRÌNH DUYỆT KHÔNG HỖ TRỢ HLS');
      return;
    }

    const hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 0,
      fetchSetup: (_context: unknown, initParams: RequestInit) => ({
        ...initParams,
        cache: 'no-store',
      }),
    });
    hlsRef.current = hls;
    hls.loadSource(streamUrl);
    hls.attachMedia(audio);

    const startVersion = currentStreamVersionRef.current;
    connectTimerRef.current = window.setTimeout(() => {
      if (startVersion === currentStreamVersionRef.current) void startHlsPlayer(startVersion, label, hlsUrl, recordingProof);
    }, 5000);

    hls.on(Hls.Events.MANIFEST_LOADED, () => {
      setStatus('ĐÃ NHẬN DANH SÁCH PHÁT...');
      setCurrentName(label);
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      clearConnectTimer();
      void playAudio('ĐANG PHÁT THANH...', label, { label, recordingProof });
    });
    hls.on(Hls.Events.ERROR, (_event: unknown, errorData: { fatal?: boolean; details?: string; type?: string }) => {
      if (!errorData.fatal) return;
      const retryVersion = currentStreamVersionRef.current;
      const detail = errorData.details || errorData.type || 'không rõ lỗi';
      setStatus(`LỖI KẾT NỐI HLS: ${detail}`);
      setCurrentName(label);
      cleanupHls();
      retryTimerRef.current = window.setTimeout(() => {
        if (retryVersion === currentStreamVersionRef.current) void startHlsPlayer(retryVersion || undefined, label, hlsUrl, recordingProof);
      }, 1000);
    });
  }

  async function playAudio(successStatus: string, label: string, recordingMetadata?: PlaybackRecordingMetadata) {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setShowPlayButton(false);
      setStatus(successStatus);
      setCurrentName(label);
      void startPlaybackRecording(recordingMetadata || { label });
    } catch {
      setShowPlayButton(true);
      setStatus('NHẤN ĐỂ KẾT NỐI LOA');
      setCurrentName(label);
    }
  }

  async function startPlaybackRecording(metadata: PlaybackRecordingMetadata) {
    const recordingProof = metadata.recordingProof;
    if (!recordingProof?.enabled || !recordingProof.sourceType) return;
    if (!deviceTokenRef.current || playbackRecordingRef.current || typeof MediaRecorder === 'undefined') return;

    try {
      const stream = await getPlaybackRecordingStream();
      if (!stream) return;

      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const startedAt = new Date().toISOString();
      const segmentSeconds = Math.max(10, Number(recordingProof.segmentSeconds) || 900);
      const state: PlaybackRecordingState = {
        recorder,
        startedAt,
        currentSegmentStartedAt: startedAt,
        segmentIndex: 0,
        segmentSeconds,
        stoppingFinal: false,
        stream,
        metadata,
      };

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const endedAt = new Date().toISOString();
        const segmentStartedAt = state.currentSegmentStartedAt;
        const segmentIndex = state.segmentIndex;
        const isFinalSegment = state.stoppingFinal || recorder.state === 'inactive';
        state.currentSegmentStartedAt = endedAt;
        state.segmentIndex += 1;
        uploadRecordingSegment(state, event.data, segmentStartedAt, endedAt, segmentIndex, isFinalSegment).catch((error) =>
          console.warn(`Recording segment upload failed: ${getErrorMessage(error)}`),
        );
      };
      recorder.onstop = () => {
        state.stream.getTracks().forEach((track) => track.stop());
        if (playbackRecordingRef.current === state) playbackRecordingRef.current = null;
      };

      playbackRecordingRef.current = state;
      recorder.start(segmentSeconds * 1000);
    } catch (error) {
      console.warn(`Playback recording skipped: ${getErrorMessage(error)}`);
    }
  }

  async function getPlaybackRecordingStream() {
    const audio = audioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    const captured = audio?.captureStream?.() || audio?.mozCaptureStream?.();
    if (captured?.getAudioTracks().length) return captured;

    if (!navigator.mediaDevices?.getUserMedia) return null;
    return navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  }

  function stopPlaybackRecording() {
    const state = playbackRecordingRef.current;
    if (!state) return;
    state.stoppingFinal = true;
    if (state.recorder.state !== 'inactive') {
      state.recorder.stop();
      return;
    }
    playbackRecordingRef.current = null;
  }

  async function uploadRecordingSegment(
    state: PlaybackRecordingState,
    blob: Blob,
    startedAt: string,
    endedAt: string,
    segmentIndex: number,
    isFinalSegment: boolean,
  ) {
    if (!deviceTokenRef.current || !state.metadata.recordingProof?.sourceType) return;
    if (!blob.size) return;

    const extension = getRecordingExtension(blob.type);
    const fileName = `${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}-${state.metadata.label.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'recording'}-seg-${segmentIndex}${extension}`;
    const durationSeconds = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    const formData = new FormData();
    formData.append('audio', blob, fileName);
    formData.append('sourceType', state.metadata.recordingProof.sourceType);
    formData.append('startedAt', startedAt);
    formData.append('endedAt', endedAt);
    formData.append('durationSeconds', String(durationSeconds));
    formData.append('segmentIndex', String(segmentIndex));
    formData.append('isFinalSegment', String(isFinalSegment));
    formData.append('message', `Browser simulator ghi bằng chứng phát: ${state.metadata.label}`);
    if (state.metadata.recordingProof.scheduleId) formData.append('scheduleId', state.metadata.recordingProof.scheduleId);
    if (state.metadata.recordingProof.sessionId) formData.append('sessionId', state.metadata.recordingProof.sessionId);

    const response = await fetch('/api/device-client/recording-segment-upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceTokenRef.current}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await readResponseMessage(response));
    }
  }

  function startEmergencyPlayer(data: EmergencyPayload) {
    stopEmergencyPlayer();
    setStatus('PHÁT KHẨN CẤP...');
    void startHlsPlayer(data.streamVersion, `Phát khẩn cấp: ${data.sourceName || 'Nguồn khẩn cấp'}`, data.hlsUrl, data.recordingProof);
    if (data.durationMinutes && data.durationMinutes > 0) {
      emergencyTimerRef.current = window.setTimeout(stopEmergencyPlayer, data.durationMinutes * 60 * 1000);
    }
  }

  function stopEmergencyPlayer() {
    clearEmergencyTimer();
    stopPlayback();
  }

  function stopPlayback() {
    stopPlaybackRecording();
    cleanupHls();
    cleanupLocalAudio();
    currentStreamVersionRef.current = null;
    setStatus('CHỜ PHÁT THANH...');
    setCurrentName('Chưa có bản tin');
  }

  function cleanupHls() {
    clearRetryTimer();
    clearConnectTimer();
    hlsRef.current?.destroy();
    hlsRef.current = null;
  }

  function cleanupLocalAudio() {
    rememberCurrentPosition();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.onended = null;
      audio.removeAttribute('src');
      audio.load();
    }
    if (currentObjectUrlRef.current) URL.revokeObjectURL(currentObjectUrlRef.current);
    currentObjectUrlRef.current = null;
    currentLocalFileIdRef.current = null;
    setShowPlayButton(false);
  }

  function rememberCurrentPosition() {
    const fileId = currentLocalFileIdRef.current;
    const audio = audioRef.current;
    if (!fileId || !audio || audio.ended || !Number.isFinite(audio.currentTime)) return;
    setLocalPosition(fileId, audio.currentTime);
  }

  function setLocalPosition(fileId: string, seconds: number) {
    if (!fileId || !Number.isFinite(seconds) || seconds < 0) return;
    positionsRef.current.set(fileId, seconds);
    saveStoredPositions(positionsRef.current);
  }

  function getSyncedStartPosition(fileId: string, data: CachedPlaybackPayload, receivedAtMs: number) {
    const offset = Number(data.startOffsetSeconds);
    const serverTime = Number(data.serverTimeMs);
    if (Number.isFinite(offset) && (Number.isFinite(receivedAtMs) || Number.isFinite(serverTime))) {
      const elapsedSeconds = Math.max(0, (Date.now() - receivedAtMs) / 1000);
      return Math.max(0, offset + elapsedSeconds);
    }

    return data.resetPosition ? 0 : positionsRef.current.get(fileId) || 0;
  }

  function getStreamUrl(version: string | number | null) {
    const cacheVersion = encodeURIComponent(String(version || Date.now()));
    return `/hls/${STREAM_PATH}/index.m3u8?cookieCheck=1&v=${cacheVersion}`;
  }

  function resolveHlsUrl(hlsUrl: string | undefined, version: string | number | null) {
    const fallback = getStreamUrl(version);
    const value = String(hlsUrl || '').trim();
    if (!value) return fallback;

    try {
      const url = new URL(value, window.location.origin);
      const isInternalHost = ['localhost', '127.0.0.1', '0.0.0.0', 'mediamtx'].includes(url.hostname);
      if (isInternalHost && url.origin !== window.location.origin) return fallback;
      if (!url.pathname.includes('/index.m3u8')) return fallback;
      url.searchParams.set('cookieCheck', '1');
      return url.pathname.startsWith('/hls/') ? `${url.pathname}${url.search}` : url.toString();
    } catch {
      return fallback;
    }
  }

  async function checkHlsManifest(streamUrl: string) {
    try {
      const response = await fetch(streamUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*' },
      });
      const body = await response.text();
      const contentType = response.headers.get('content-type') || 'unknown';

      if (!response.ok) {
        return {
          ok: false,
          message: `manifest HTTP ${response.status} (${streamUrl})`,
        };
      }

      if (!body.includes('#EXTM3U')) {
        const snippet = body.replace(/\s+/g, ' ').slice(0, 80) || 'empty body';
        return {
          ok: false,
          message: `manifest không hợp lệ (${contentType}): ${snippet}`,
        };
      }

      return { ok: true, message: 'OK' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'không tải được manifest',
      };
    }
  }

  function clearRegistrationTimer() {
    if (registrationTimerRef.current) window.clearTimeout(registrationTimerRef.current);
    registrationTimerRef.current = null;
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimerRef.current) window.clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
  }

  function clearRetryTimer() {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }

  function clearConnectTimer() {
    if (connectTimerRef.current) window.clearTimeout(connectTimerRef.current);
    connectTimerRef.current = null;
  }

  function clearEmergencyTimer() {
    if (emergencyTimerRef.current) window.clearTimeout(emergencyTimerRef.current);
    emergencyTimerRef.current = null;
  }

  return (
    <main className="client-simulator">
      <section className="client-receiver-panel">
        <h1>{status}</h1>
        <div className="client-now-playing">
          <span>Bản tin đang phát</span>
          <strong>{currentName}</strong>
        </div>
        <div className="client-device-card">{deviceInfo}</div>
        {showPlayButton ? (
          <button className="client-play-button" onClick={() => void audioRef.current?.play().then(() => setShowPlayButton(false))} type="button">
            NHẤN ĐỂ KẾT NỐI LOA
          </button>
        ) : null}
      </section>
      <audio ref={audioRef} />
    </main>
  );
}

function getRegistrationLabel(payload: { deviceId: string; macAddress: string; androidId: string }) {
  if (payload.deviceId && payload.macAddress) return `Device ID: ${payload.deviceId} | MAC fallback: ${payload.macAddress}`;
  if (payload.deviceId) return `Device ID: ${payload.deviceId}`;
  if (payload.macAddress) return `MAC: ${payload.macAddress}`;
  if (payload.androidId) return `Android ID: ${payload.androidId}`;
  return '';
}

function getDeviceTokenStorageKey(payload: { deviceId: string; macAddress: string; androidId: string }) {
  return `device-token:${payload.deviceId || payload.macAddress || payload.androidId}`;
}

function getBrowserNetworkType() {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string } }).connection;
  return connection?.type || connection?.effectiveType || 'BROWSER';
}

function inferBrowserConnectionType() {
  const networkType = getBrowserNetworkType().toLowerCase();
  if (['wifi', 'ethernet', 'lan'].some((keyword) => networkType.includes(keyword))) return 'LAN';
  if (['cellular', 'mobile', '4g', 'lte', '5g'].some((keyword) => networkType.includes(keyword))) return '4G';
  return 'UNKNOWN';
}

function getRecordingMimeType() {
  const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function getRecordingExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return '.m4a';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  return '.webm';
}

async function readResponseMessage(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return payload?.message || payload?.error || `HTTP ${response.status}`;
  }
  return response.text().catch(() => `HTTP ${response.status}`);
}

function loadStoredPositions(target: Map<string, number>) {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || '{}') as Record<string, unknown>;
    Object.entries(parsed).forEach(([fileId, seconds]) => {
      const value = Number(seconds);
      if (Number.isFinite(value) && value >= 0) target.set(fileId, value);
    });
  } catch {
    target.clear();
  }
}

function saveStoredPositions(positions: Map<string, number>) {
  const payload: Record<string, number> = {};
  positions.forEach((seconds, fileId) => {
    payload[fileId] = seconds;
  });
  localStorage.setItem(POSITION_KEY, JSON.stringify(payload));
}

function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsScriptPromise) return hlsScriptPromise;

  hlsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HLS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Hls) resolve(window.Hls);
      else reject(new Error('Không tải được HLS.js.'));
    };
    script.onerror = () => reject(new Error('Không tải được HLS.js.'));
    document.head.appendChild(script);
  });
  return hlsScriptPromise;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định';
}
