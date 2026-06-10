import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Device, EmergencyBroadcastSession, EmergencySource, EmergencySourceInput } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

const DURATION_OPTIONS = [15, 30, 60] as const;
type DurationMinutes = (typeof DURATION_OPTIONS)[number];

export function EmergencyView() {
  const [sources, setSources] = useState<EmergencySource[]>([]);
  const [sessions, setSessions] = useState<EmergencyBroadcastSession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Source form state
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState('');
  const [sourceForm, setSourceForm] = useState<EmergencySourceInput>({ name: '', url: '' });

  // Broadcast control state
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(15);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'ACTIVE') || null,
    [sessions],
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sourceData, sessionData, deviceData] = await Promise.all([
        adminApi.listEmergencySources(),
        adminApi.listEmergencyBroadcasts(),
        adminApi.listDevices(),
      ]);
      setSources(sourceData.sources);
      setSessions(sessionData.sessions);
      setDevices(deviceData.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // ─── Source CRUD ────────────────────────────────────────────────────────────

  function openCreateSource() {
    setEditingSourceId('');
    setSourceForm({ name: '', url: '' });
    setSourceModalOpen(true);
  }

  function openEditSource(source: EmergencySource) {
    setEditingSourceId(source.sourceId);
    setSourceForm({ name: source.name, url: source.url, sortOrder: source.sortOrder });
    setSourceModalOpen(true);
  }

  function closeSourceModal() {
    setSourceModalOpen(false);
    setEditingSourceId('');
    setSourceForm({ name: '', url: '' });
  }

  async function saveSource(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editingSourceId) {
        await adminApi.updateEmergencySource(editingSourceId, sourceForm);
      } else {
        await adminApi.createEmergencySource(sourceForm);
      }
      closeSourceModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được nguồn phát.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSource(sourceId: string) {
    if (!confirm('Xóa nguồn phát này?')) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.deleteEmergencySource(sourceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được nguồn phát.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Broadcast control ──────────────────────────────────────────────────────

  function toggleDevice(deviceId: string, checked: boolean) {
    setSelectedDeviceIds((current) => {
      const next = new Set(current);
      if (checked) next.add(deviceId);
      else next.delete(deviceId);
      return next;
    });
  }

  function toggleAllDevices(checked: boolean) {
    setSelectedDeviceIds(checked ? new Set(devices.map((d) => d.deviceId)) : new Set());
  }

  async function playSource(source: EmergencySource) {
    if (!selectedDeviceIds.size) {
      setError('Vui lòng chọn ít nhất 1 thiết bị.');
      return;
    }
    if (activeSession) {
      setError('Đang có phiên phát khẩn cấp. Vui lòng dừng trước khi phát nguồn mới.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await adminApi.startEmergencyBroadcast({
        sourceId: source.sourceId,
        deviceIds: [...selectedDeviceIds],
        durationMinutes,
        startedBy: 'Admin',
      });
      setSessions((current) => [data.session, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không bắt đầu được phát khẩn cấp.');
    } finally {
      setBusy(false);
    }
  }

  async function stopSession(sessionId: string) {
    if (!confirm('Dừng phiên phát khẩn cấp này?')) return;
    setBusy(true);
    setError('');
    try {
      const data = await adminApi.stopEmergencyBroadcast(sessionId);
      setSessions((current) =>
        current.map((s) => (s.sessionId === data.session.sessionId ? data.session : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không dừng được phiên phát.');
    } finally {
      setBusy(false);
    }
  }

  const allSelected = devices.length > 0 && devices.every((d) => selectedDeviceIds.has(d.deviceId));

  return (
    <Panel
      title="Phát khẩn cấp"
      description="Phát ngay từ nguồn RTSP/HLS đến thiết bị được chọn với thời lượng giới hạn."
      actions={
        <div className="live-toolbar">
          <button className="ghost icon-btn" disabled={loading} onClick={() => void load()} title="Tải lại" type="button">
            ↻
          </button>
        </div>
      }
    >
      <DataState loading={loading} error={error} empty={false} emptyText="" />

      {!loading ? (
        <div className="emergency-page">

          {/* Active session banner */}
          {activeSession ? (
            <div className="emergency-active-banner">
              <div className="emergency-active-info">
                <span className="emergency-active-dot" />
                <strong>Đang phát khẩn cấp:</strong>
                <span>{activeSession.sourceName}</span>
                <span className="emergency-active-sep">→</span>
                <span>{activeSession.targetLabel}</span>
                <span className="emergency-active-duration">
                  ({activeSession.durationMinutes} phút · Kết thúc lúc {formatDateTime(activeSession.scheduledEndAt)})
                </span>
              </div>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void stopSession(activeSession.sessionId)}
                type="button"
              >
                ■ Dừng ngay
              </button>
            </div>
          ) : (
            <div className="emergency-idle-banner">
              <span className="emergency-idle-dot" />
              <span>Không có phiên khẩn cấp nào đang phát</span>
            </div>
          )}

          <div className="emergency-layout">
            {/* Left: device selector + source list */}
            <div className="emergency-main">

              {/* Device + Duration selector */}
              <div className="emergency-control-bar">
                <div className="emergency-control-section">
                  <h3 className="emergency-section-title">Thiết bị nhận phát</h3>
                  <div className="emergency-device-list">
                    <label className="emergency-device-item emergency-device-all">
                      <input
                        checked={allSelected}
                        onChange={(e) => toggleAllDevices(e.target.checked)}
                        type="checkbox"
                      />
                      <span>Chọn tất cả ({devices.length} thiết bị)</span>
                    </label>
                    {devices.map((device) => (
                      <label className="emergency-device-item" key={device.deviceId}>
                        <input
                          checked={selectedDeviceIds.has(device.deviceId)}
                          onChange={(e) => toggleDevice(device.deviceId, e.target.checked)}
                          type="checkbox"
                        />
                        <span className="emergency-device-name">{device.name}</span>
                        <span className={`emergency-device-status ${device.online ? 'online' : 'offline'}`}>
                          {device.online ? '● Kết nối' : '○ Mất KN'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="emergency-control-section emergency-duration-section">
                  <h3 className="emergency-section-title">Thời lượng mặc định</h3>
                  <div className="emergency-duration-options">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        className={durationMinutes === d ? 'emergency-duration-btn active' : 'emergency-duration-btn'}
                        key={d}
                        onClick={() => setDurationMinutes(d)}
                        type="button"
                      >
                        {d} phút
                      </button>
                    ))}
                  </div>
                  <p className="emergency-duration-hint">
                    Thiết bị tự dừng sau {durationMinutes} phút. Có thể dừng sớm thủ công.
                  </p>
                </div>
              </div>

              {/* Source list */}
              <div className="emergency-sources-section">
                <div className="emergency-sources-header">
                  <h3 className="emergency-section-title">Nguồn phát</h3>
                  <button className="primary" disabled={busy} onClick={openCreateSource} type="button">
                    + Thêm nguồn
                  </button>
                </div>

                {sources.length === 0 ? (
                  <div className="state compact">Chưa có nguồn phát nào. Thêm URL RTSP/HLS để bắt đầu.</div>
                ) : (
                  <div className="emergency-source-list">
                    {sources.map((source) => (
                      <div className="emergency-source-item" key={source.sourceId}>
                        <div className="emergency-source-info">
                          <strong className="emergency-source-name">{source.name}</strong>
                          <span className="emergency-source-url" title={source.url}>{source.url}</span>
                        </div>
                        <div className="emergency-source-actions">
                          <button
                            className="ghost"
                            disabled={busy}
                            onClick={() => openEditSource(source)}
                            title="Sửa nguồn"
                            type="button"
                          >
                            Sửa
                          </button>
                          <button
                            className="danger"
                            disabled={busy}
                            onClick={() => void deleteSource(source.sourceId)}
                            title="Xóa nguồn"
                            type="button"
                          >
                            Xóa
                          </button>
                          <button
                            className={activeSession ? 'emergency-play-btn disabled' : 'emergency-play-btn'}
                            disabled={busy || Boolean(activeSession)}
                            onClick={() => void playSource(source)}
                            title={activeSession ? 'Đang có phiên khác' : `Phát ${source.name}`}
                            type="button"
                          >
                            ▶ Phát
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session history */}
          <div className="emergency-history">
            <h3 className="emergency-section-title">Lịch sử phát khẩn cấp</h3>
            {sessions.length === 0 ? (
              <div className="state compact">Chưa có phiên phát khẩn cấp nào.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nguồn</th>
                      <th>URL</th>
                      <th>Thiết bị</th>
                      <th>Thời lượng</th>
                      <th>Bắt đầu</th>
                      <th>Kết thúc dự kiến</th>
                      <th>Trạng thái</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.sessionId}>
                        <td><strong>{session.sourceName}</strong></td>
                        <td>
                          <span className="emergency-source-url-cell" title={session.sourceUrl}>
                            {session.sourceUrl.length > 40 ? session.sourceUrl.slice(0, 40) + '…' : session.sourceUrl}
                          </span>
                        </td>
                        <td>{session.targetLabel}</td>
                        <td>{session.durationMinutes} phút</td>
                        <td>{formatDateTime(session.startedAt)}</td>
                        <td>{formatDateTime(session.scheduledEndAt)}</td>
                        <td>
                          <StatusBadge tone={sessionTone(session.status)}>
                            {sessionLabel(session.status)}
                          </StatusBadge>
                        </td>
                        <td>
                          {session.status === 'ACTIVE' ? (
                            <button
                              className="danger"
                              disabled={busy}
                              onClick={() => void stopSession(session.sessionId)}
                              type="button"
                            >
                              Dừng
                            </button>
                          ) : (
                            <span className="subtext">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Source modal */}
          {sourceModalOpen ? (
            <Modal
              title={editingSourceId ? 'Sửa nguồn phát' : 'Thêm nguồn phát'}
              onClose={closeSourceModal}
            >
              <form className="form-panel" onSubmit={saveSource}>
                <label>
                  Tên nguồn <span className="required">*</span>
                  <input
                    placeholder="VD: VOV2, Đài tỉnh..."
                    required
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label>
                  URL (RTSP/HLS) <span className="required">*</span>
                  <input
                    placeholder="VD: http://... hoặc rtsp://..."
                    required
                    value={sourceForm.url}
                    onChange={(e) => setSourceForm((f) => ({ ...f, url: e.target.value }))}
                  />
                </label>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeSourceModal} type="button">
                    Hủy
                  </button>
                  <button className="primary" disabled={busy || !sourceForm.name.trim() || !sourceForm.url.trim()} type="submit">
                    {editingSourceId ? 'Lưu' : 'Thêm'}
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

function sessionLabel(status: EmergencyBroadcastSession['status']) {
  if (status === 'ACTIVE') return 'Đang phát';
  if (status === 'CANCELLED') return 'Đã dừng';
  return 'Hoàn thành';
}

function sessionTone(status: EmergencyBroadcastSession['status']): 'ok' | 'warn' | 'neutral' {
  if (status === 'ACTIVE') return 'ok';
  if (status === 'CANCELLED') return 'warn';
  return 'neutral';
}
