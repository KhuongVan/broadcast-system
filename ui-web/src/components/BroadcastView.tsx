import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { adminApi } from '../lib/api';
import type { AudioFile, ScheduleStatus } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

type AdminStatus = {
  status: string;
  type: string;
  streamVersion?: number;
};

export function BroadcastView() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [fileId, setFileId] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>({ activeSchedule: null, pausedSchedule: null });
  const [micActive, setMicActive] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const selectedFile = useMemo(() => files.find((file) => file.fileId === fileId) || null, [files, fileId]);

  useEffect(() => {
    const socket = io('/', { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('admin_request_schedule_status');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('admin_status', (payload: AdminStatus) => {
      setStatus(payload);
      setBusy(false);
      setError('');
    });
    socket.on('admin_error', (payload: { message?: string }) => {
      setError(payload.message || 'Socket báo lỗi.');
      setBusy(false);
    });
    socket.on('SCHEDULE_STATUS', (payload: ScheduleStatus) => setScheduleStatus(payload));
    socket.on('FILE_AVAILABLE', (file: AudioFile) => {
      setFiles((current) => (current.some((item) => item.fileId === file.fileId) ? current : [file, ...current]));
    });

    return () => {
      stopRecorder();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await adminApi.listFiles();
        setFiles(data.files);
        setFileId(data.files[0]?.fileId || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không tải được kho âm thanh.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  function emit(event: string, payload?: unknown) {
    if (!socketRef.current?.connected) {
      setError('Socket chưa kết nối. Kiểm tra backend hoặc đăng nhập lại.');
      return false;
    }
    setBusy(true);
    setError('');
    socketRef.current.emit(event, payload);
    return true;
  }

  function playCached(resetPosition: boolean) {
    if (!fileId) return;
    emit('admin_play_cached', { fileId, resetPosition });
  }

  function playHlsFile(resetPosition: boolean) {
    if (!fileId) return;
    emit('admin_play_hls_file', { fileId, resetPosition });
  }

  async function startLiveMic() {
    if (!emit('admin_play_live')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = async (event) => {
        if (event.data.size && socketRef.current?.connected) {
          socketRef.current.emit('admin_mic_chunk', await event.data.arrayBuffer());
        }
      };
      recorder.onstop = stopTracks;
      recorder.start(500);
      setMicActive(true);
    } catch (err) {
      setMicActive(false);
      setBusy(false);
      emit('admin_stop');
      setError(err instanceof Error ? err.message : 'Trình duyệt không cấp quyền micro.');
    }
  }

  function stopAll() {
    stopRecorder();
    emit('admin_stop');
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stopTracks();
    }
    recorderRef.current = null;
    setMicActive(false);
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  return (
    <Panel title="Phát trực tiếp" description="Phát file, live mic và theo dõi trạng thái lịch realtime qua Socket.IO.">
      <DataState loading={loading} error="" empty={!files.length} emptyText="Chưa có file âm thanh để phát." />
      <div className="broadcast-grid">
        <div className="detail-panel form-panel">
          <h3>Trạng thái realtime</h3>
          <div className="status-line">
            <StatusBadge tone={connected ? 'ok' : 'danger'}>{connected ? 'Socket connected' : 'Socket offline'}</StatusBadge>
            {status ? <span>{status.type}: {status.status}{status.streamVersion ? ` #${status.streamVersion}` : ''}</span> : null}
          </div>
          {error ? <div className="state error compact">{error}</div> : null}
          <div className="mini-list">
            <div className="mini-list-item">
              <div>
                <strong>Lịch đang phát</strong>
                <div className="subtext">{scheduleStatus.activeSchedule?.name || 'Không có'}</div>
              </div>
              <button className="ghost" disabled={busy || !scheduleStatus.activeSchedule} onClick={() => emit('admin_pause_schedule')} type="button">
                Tạm dừng
              </button>
            </div>
            <div className="mini-list-item">
              <div>
                <strong>Lịch đang tạm dừng</strong>
                <div className="subtext">{scheduleStatus.pausedSchedule?.name || 'Không có'}</div>
              </div>
              <button className="ghost" disabled={busy || !scheduleStatus.pausedSchedule} onClick={() => emit('admin_resume_schedule')} type="button">
                Phát tiếp
              </button>
            </div>
          </div>
        </div>

        <div className="detail-panel form-panel">
          <h3>Phát file âm thanh</h3>
          <label>
            File
            <select value={fileId} onChange={(event) => setFileId(event.target.value)}>
              <option value="">Chọn file</option>
              {files.map((file) => (
                <option key={file.fileId} value={file.fileId}>
                  {file.originalName}
                </option>
              ))}
            </select>
          </label>
          {selectedFile ? <audio controls src={selectedFile.url} /> : null}
          <div className="row-actions">
            <button className="primary" disabled={busy || !fileId} onClick={() => playHlsFile(false)} type="button">
              Phát HLS
            </button>
            <button className="ghost" disabled={busy || !fileId} onClick={() => playHlsFile(true)} type="button">
              Phát từ đầu
            </button>
            <button className="ghost" disabled={busy || !fileId} onClick={() => playCached(false)} type="button">
              Phát cached
            </button>
          </div>
        </div>

        <div className="detail-panel form-panel">
          <h3>Live mic</h3>
          <p className="subtext">Live mic cần HTTPS hoặc localhost để trình duyệt cấp quyền micro.</p>
          <div className="row-actions">
            <button className="primary" disabled={busy || micActive} onClick={() => void startLiveMic()} type="button">
              Bắt đầu live
            </button>
            <button className="danger" disabled={busy && !micActive} onClick={stopAll} type="button">
              Dừng tất cả
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function pickMimeType() {
  const preferred = 'audio/webm;codecs=opus';
  return MediaRecorder.isTypeSupported(preferred) ? preferred : 'audio/webm';
}
