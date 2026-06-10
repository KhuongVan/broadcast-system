import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { adminApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Device, LiveBroadcastSession, LiveBroadcastTargetType, ScheduleStatus } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

type AdminStatus = {
  status: string;
  type: string;
  streamVersion?: number;
};

type MicOption = {
  deviceId: string;
  label: string;
};

const defaultMic: MicOption = { deviceId: 'default', label: 'Micro mặc định' };

export function BroadcastView() {
  const [sessions, setSessions] = useState<LiveBroadcastSession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>({ activeSchedule: null, pausedSchedule: null });
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetType, setTargetType] = useState<LiveBroadcastTargetType>('DEVICE');
  const [targetArea, setTargetArea] = useState('');
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [micOptions, setMicOptions] = useState<MicOption[]>([defaultMic]);
  const [micDeviceId, setMicDeviceId] = useState(defaultMic.deviceId);
  const socketRef = useRef<Socket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const areas = useMemo(() => {
    const names = devices.map((device) => device.area).filter((value): value is string => Boolean(value?.trim()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [devices]);

  const activeSession = useMemo(() => sessions.find((session) => session.status === 'STARTED') || null, [sessions]);
  const visibleSessions = useMemo(() => sessions, [sessions]);

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
      const message = payload.message || 'Socket báo lỗi.';
      setError(message);
      setBusy(false);
      void failActiveSession(message);
    });
    socket.on('SCHEDULE_STATUS', (payload: ScheduleStatus) => setScheduleStatus(payload));

    return () => {
      stopRecorder();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    void load();
    void loadMicrophones();
  }, []);

  useEffect(() => {
    if (!targetArea && areas[0]) setTargetArea(areas[0]);
  }, [areas, targetArea]);

  useEffect(() => {
    if (!targetDeviceId && devices[0]) setTargetDeviceId(devices[0].deviceId);
  }, [devices, targetDeviceId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionData, deviceData] = await Promise.all([adminApi.listLiveBroadcasts(), adminApi.listDevices()]);
      setSessions(sessionData.sessions);
      setDevices(deviceData.devices);
      activeSessionIdRef.current = sessionData.sessions.find((session) => session.status === 'STARTED')?.sessionId || null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu phát trực tiếp.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      // Xin quyền mic trước — trình duyệt chỉ trả tên thật sau khi có quyền
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (tempStream) {
        tempStream.getTracks().forEach((track) => track.stop()); // dừng ngay, chỉ cần để mở khoá tên
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({ deviceId: device.deviceId || 'default', label: device.label || `Micro ${index + 1}` }));
      if (audioInputs.length) {
        setMicOptions(audioInputs);
        setMicDeviceId(audioInputs[0].deviceId);
      }
    } catch {
      setMicOptions([defaultMic]);
      setMicDeviceId(defaultMic.deviceId);
    }
  }

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

  async function startLive(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;

    const target = getTarget();
    if (!target) {
      setError(targetType === 'DEVICE' ? 'Vui lòng chọn thiết bị phát.' : 'Vui lòng chọn địa bàn phát.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const constraints: MediaStreamConstraints = {
        audio: micDeviceId && micDeviceId !== 'default' ? { deviceId: { exact: micDeviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const micLabel = micOptions.find((option) => option.deviceId === micDeviceId)?.label || defaultMic.label;
      const data = await adminApi.createLiveBroadcast({
        title: title.trim(),
        targetType,
        targetArea: targetType === 'AREA' ? target.id : null,
        targetDeviceIds: targetType === 'DEVICE' ? [target.id] : [],
        targetLabel: target.label,
        micLabel,
        startedBy: 'Admin',
      });

      activeSessionIdRef.current = data.session.sessionId;
      setSessions((current) => [data.session, ...current.filter((session) => session.sessionId !== data.session.sessionId)]);
      setModalOpen(false);
      setTitle('');
      streamRef.current = stream;

      if (!emit('admin_play_live', {
        targetType,
        targetArea: targetType === 'AREA' ? target.id : null,
        targetDeviceIds: targetType === 'DEVICE' ? [target.id] : [],
      })) {
        stopTracks();
        await failActiveSession('Socket chưa kết nối.');
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorderRef.current = recorder;
      recorder.ondataavailable = async (chunkEvent) => {
        if (chunkEvent.data.size && socketRef.current?.connected) {
          socketRef.current.emit('admin_mic_chunk', await chunkEvent.data.arrayBuffer());
        }
      };
      recorder.onstop = stopTracks;
      recorder.start(500);
      void loadMicrophones();
    } catch (err) {
      stopTracks();
      const message = err instanceof Error ? err.message : 'Không bắt đầu được phát trực tiếp.';
      setError(message);
      await failActiveSession(message);
      setBusy(false);
    }
  }

  async function stopLive() {
    stopRecorder();
    emit('admin_stop');
    await finishActiveSession();
  }

  function closeModal() {
    setModalOpen(false);
    setTitle('');
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stopTracks();
    }
    recorderRef.current = null;
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function finishActiveSession() {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      const data = await adminApi.finishLiveBroadcast(sessionId, 'Kết thúc phát trực tiếp.');
      replaceSession(data.session);
      activeSessionIdRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được phiên phát.');
    }
  }

  async function failActiveSession(message: string) {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      const data = await adminApi.failLiveBroadcast(sessionId, message);
      replaceSession(data.session);
      activeSessionIdRef.current = null;
    } catch {
      activeSessionIdRef.current = null;
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm('Xóa phiên phát này khỏi danh sách?')) return;
    setBusy(true);
    setError('');
    try {
      const data = await adminApi.deleteLiveBroadcast(sessionId);
      replaceSession(data.session);
      if (activeSessionIdRef.current === sessionId) activeSessionIdRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được phiên phát.');
    } finally {
      setBusy(false);
    }
  }

  function replaceSession(session: LiveBroadcastSession) {
    setSessions((current) => current.map((item) => (item.sessionId === session.sessionId ? session : item)));
  }

  function getTarget() {
    if (targetType === 'AREA') {
      const area = targetArea || areas[0];
      return area ? { id: area, label: area } : null;
    }

    const device = devices.find((item) => item.deviceId === targetDeviceId);
    return device ? { id: device.deviceId, label: device.name } : null;
  }

  function exportCsv() {
    const rows = [
      ['Tiêu đề', 'Phạm vi', 'Phát lúc', 'Kết thúc', 'Thời gian phát', 'Trạng thái', 'Phát bởi'],
      ...sessions.map((session) => [
        session.title,
        session.targetLabel,
        formatDateTime(session.startedAt),
        formatDateTime(session.endedAt),
        formatDuration(session),
        statusLabel(session.status),
        session.startedBy || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'phat-truc-tiep.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      title="Phát trực tiếp"
      description="Quản lý phiên live mic và lịch sử phát trực tiếp."
      actions={
        <div className="live-toolbar">
          <button className="ghost icon-btn" disabled={loading} onClick={() => void load()} title="Tải lại" type="button">
            ↻
          </button>
          <button className="primary" disabled={!sessions.length} onClick={exportCsv} type="button">
            Xuất dữ liệu
          </button>
          <button className="primary" disabled={Boolean(activeSession)} onClick={() => setModalOpen(true)} type="button">
            + Thêm mới
          </button>
        </div>
      }
    >
      <DataState loading={loading} error={error} empty={!sessions.length} emptyText="Chưa có phiên phát trực tiếp." />
      {!loading ? (
        <div className="live-page">
          <div className={activeSession ? 'live-status active' : 'live-status'}>
            <div>
              <StatusBadge tone={connected ? 'ok' : 'danger'}>{connected ? 'Socket kết nối' : 'Socket mất kết nối'}</StatusBadge>
              {activeSession ? <strong>Đang phát trực tiếp: {activeSession.title}</strong> : <strong>Không có phiên live đang phát</strong>}
            </div>
            <div>
              {status ? <span>{status.type}: {status.status}{status.streamVersion ? ` #${status.streamVersion}` : ''}</span> : null}
              <span>Lịch đang phát: {scheduleStatus.activeSchedule?.name || 'Không có'}</span>
            </div>
          </div>

          <div className="table-wrap live-table">
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tiêu đề</th>
                  <th>Địa bàn/Thiết bị phát</th>
                  <th>Phát lúc</th>
                  <th>Thời gian phát</th>
                  <th>Trạng thái</th>
                  <th>Phát bởi</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((session, index) => (
                  <tr key={session.sessionId}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{session.title}</strong>
                      {session.micLabel ? <div className="subtext">{session.micLabel}</div> : null}
                    </td>
                    <td>{session.targetLabel}</td>
                    <td>{formatDateTime(session.startedAt)}</td>
                    <td>{formatDuration(session)}</td>
                    <td>
                      <StatusBadge tone={statusTone(session.status)}>{statusLabel(session.status)}</StatusBadge>
                    </td>
                    <td>
                      <span className="live-broadcaster" title={session.startedBy || 'Admin'}>{session.startedBy || 'Admin'}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {session.status === 'STARTED' ? (
                          <button className="ghost" disabled={busy} onClick={() => void stopLive()} title="Dừng phát" type="button">
                            Dừng
                          </button>
                        ) : null}
                        <button className="danger" disabled={busy || session.status === 'DELETED'} onClick={() => void deleteSession(session.sessionId)} title="Xóa phiên phát" type="button">
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="live-table-footer">
              <span>Tổng: {visibleSessions.length} bản ghi</span>
            </div>
          </div>

          {modalOpen ? (
            <Modal
              title="Phát trực tiếp"
              onClose={closeModal}
            >
              <form className="form-panel live-modal-form" onSubmit={startLive}>
                <label>
                  Tiêu đề <span className="required">*</span>
                  <input placeholder="Tiêu đề" value={title} onChange={(event) => setTitle(event.target.value)} required />
                </label>

                <div className="radio-row">
                  <label className="radio-option">
                    <input checked={targetType === 'AREA'} onChange={() => setTargetType('AREA')} type="radio" />
                    Địa bàn phát
                  </label>
                  <label className="radio-option">
                    <input checked={targetType === 'DEVICE'} onChange={() => setTargetType('DEVICE')} type="radio" />
                    Thiết bị phát
                  </label>
                </div>

                {targetType === 'AREA' ? (
                  <select value={targetArea} onChange={(event) => setTargetArea(event.target.value)} required>
                    <option value="">Chọn địa bàn phát</option>
                    {areas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={targetDeviceId} onChange={(event) => setTargetDeviceId(event.target.value)} required>
                    <option value="">Chọn thiết bị phát</option>
                    {devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.name} - {device.area || 'Chưa phân khu'}
                      </option>
                    ))}
                  </select>
                )}

                <label>
                  Chọn Mic <span className="required">*</span>
                  <select value={micDeviceId} onChange={(event) => setMicDeviceId(event.target.value)}>
                    {micOptions.map((option) => (
                      <option key={option.deviceId} value={option.deviceId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} type="button">
                    Hủy bỏ
                  </button>
                  <button className="primary" disabled={busy || !title.trim()} type="submit">
                    Bắt đầu phát
                  </button>
                </div>
              </form>
            </Modal>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function pickMimeType() {
  const preferred = 'audio/webm;codecs=opus';
  return MediaRecorder.isTypeSupported(preferred) ? preferred : 'audio/webm';
}

function statusLabel(status: LiveBroadcastSession['status']) {
  return {
    STARTED: 'Đang phát',
    FINISHED: 'Kết thúc',
    FAILED: 'Lỗi',
    DELETED: 'Đã xóa',
  }[status];
}

function statusTone(status: LiveBroadcastSession['status']) {
  if (status === 'STARTED') return 'ok';
  if (status === 'FAILED') return 'danger';
  if (status === 'DELETED') return 'warn';
  return 'neutral';
}

function formatDuration(session: LiveBroadcastSession) {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const start = new Date(session.startedAt).getTime();
  const totalSeconds = Math.max(Math.floor((end - start) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes && seconds) return `${minutes} phút ${seconds} giây`;
  if (minutes) return `${minutes} phút`;
  return `${seconds} giây`;
}
