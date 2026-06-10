import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Device, EmergencyBroadcastSession, EmergencySource, EmergencySourceInput } from '../lib/types';

const DURATION_OPTIONS = [15, 30, 60] as const;
type DurationMinutes = (typeof DURATION_OPTIONS)[number];

export function EmergencyView() {
  const [sources, setSources] = useState<EmergencySource[]>([]);
  const [sessions, setSessions] = useState<EmergencyBroadcastSession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Source form
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState('');
  const [sourceForm, setSourceForm] = useState<EmergencySourceInput>({ name: '', url: '' });

  // Broadcast control
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(15);
  const [deviceSearch, setDeviceSearch] = useState('');

  const activeSession = useMemo(() => sessions.find((s) => s.status === 'ACTIVE') || null, [sessions]);

  const filteredDevices = useMemo(
    () =>
      devices.filter(
        (d) =>
          !deviceSearch ||
          d.name.toLowerCase().includes(deviceSearch.toLowerCase()) ||
          d.area.toLowerCase().includes(deviceSearch.toLowerCase()),
      ),
    [devices, deviceSearch],
  );

  const allFilteredSelected =
    filteredDevices.length > 0 && filteredDevices.every((d) => selectedDeviceIds.has(d.deviceId));

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

  useEffect(() => { void load(); }, []);

  // ─── Source CRUD ───────────────────────────────────────────
  function openCreateSource() {
    setEditingSourceId('');
    setSourceForm({ name: '', url: '' });
    setSourceModalOpen(true);
  }
  function openEditSource(source: EmergencySource) {
    setEditingSourceId(source.sourceId);
    setSourceForm({ name: source.name, url: source.url });
    setSourceModalOpen(true);
  }
  function closeSourceModal() {
    setSourceModalOpen(false);
    setEditingSourceId('');
    setSourceForm({ name: '', url: '' });
  }
  async function saveSource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editingSourceId) await adminApi.updateEmergencySource(editingSourceId, sourceForm);
      else await adminApi.createEmergencySource(sourceForm);
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
    try {
      await adminApi.deleteEmergencySource(sourceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được nguồn phát.');
    } finally {
      setBusy(false);
    }
  }

  // ─── Device selection ──────────────────────────────────────
  function toggleDevice(deviceId: string) {
    setSelectedDeviceIds((cur) => {
      const next = new Set(cur);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }
  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedDeviceIds((cur) => {
        const next = new Set(cur);
        filteredDevices.forEach((d) => next.delete(d.deviceId));
        return next;
      });
    } else {
      setSelectedDeviceIds((cur) => {
        const next = new Set(cur);
        filteredDevices.forEach((d) => next.add(d.deviceId));
        return next;
      });
    }
  }

  // ─── Broadcast ─────────────────────────────────────────────
  async function playSource(source: EmergencySource) {
    if (!selectedDeviceIds.size) { setError('Vui lòng chọn ít nhất 1 thiết bị.'); return; }
    if (activeSession) { setError('Đang có phiên phát khẩn cấp. Vui lòng dừng trước.'); return; }
    setBusy(true);
    setError('');
    try {
      const data = await adminApi.startEmergencyBroadcast({
        sourceId: source.sourceId,
        deviceIds: [...selectedDeviceIds],
        durationMinutes,
        startedBy: 'Admin',
      });
      setSessions((cur) => [data.session, ...cur]);
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
      setSessions((cur) => cur.map((s) => (s.sessionId === data.session.sessionId ? data.session : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không dừng được phiên phát.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="em-loading">
        <div className="em-spinner" />
        <span>Đang tải...</span>
      </div>
    );
  }

  return (
    <div className="em-page">

      {/* ── Header status bar ── */}
      {activeSession ? (
        <div className="em-status-bar em-status-active">
          <div className="em-status-left">
            <span className="em-pulse-dot" />
            <div>
              <div className="em-status-title">Đang phát khẩn cấp</div>
              <div className="em-status-meta">
                <strong>{activeSession.sourceName}</strong>
                <span className="em-arrow">→</span>
                <span>{activeSession.targetLabel}</span>
                <span className="em-status-badge">{activeSession.durationMinutes} phút</span>
                <span>· Kết thúc {formatDateTime(activeSession.scheduledEndAt)}</span>
              </div>
            </div>
          </div>
          <button
            className="em-stop-btn"
            disabled={busy}
            onClick={() => void stopSession(activeSession.sessionId)}
            type="button"
          >
            <span className="em-stop-icon">■</span> Dừng ngay
          </button>
        </div>
      ) : (
        <div className="em-status-bar em-status-idle">
          <div className="em-idle-dot" />
          <span>Không có phiên khẩn cấp nào đang phát</span>
          <button className="em-reload-btn" onClick={() => void load()} title="Tải lại" type="button">↻</button>
        </div>
      )}

      {error ? <div className="em-error">{error}</div> : null}

      {/* ── Main grid ── */}
      <div className="em-grid">

        {/* LEFT: Controls */}
        <div className="em-left">

          {/* Device selector card */}
          <div className="em-card">
            <div className="em-card-head">
              <span className="em-card-icon">◉</span>
              <h3 className="em-card-title">Thiết bị nhận phát</h3>
              <span className="em-selected-count">{selectedDeviceIds.size} đã chọn</span>
            </div>

            <div className="em-device-search">
              <span className="em-search-icon">⌕</span>
              <input
                className="em-search-input"
                placeholder="Tìm thiết bị, địa bàn..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
              />
              {deviceSearch ? (
                <button className="em-search-clear" onClick={() => setDeviceSearch('')} type="button">✕</button>
              ) : null}
            </div>

            <div className="em-device-list-wrap">
              {/* Select all row */}
              <button
                className={`em-device-row em-device-all-row ${allFilteredSelected ? 'selected' : ''}`}
                onClick={toggleAll}
                type="button"
              >
                <span className={`em-checkbox ${allFilteredSelected ? 'checked' : ''}`}>
                  {allFilteredSelected ? '✓' : ''}
                </span>
                <span className="em-device-label">
                  Chọn tất cả
                  <span className="em-device-sub">{filteredDevices.length} thiết bị</span>
                </span>
              </button>

              {filteredDevices.length === 0 ? (
                <div className="em-device-empty">Không tìm thấy thiết bị nào.</div>
              ) : (
                filteredDevices.map((device) => {
                  const checked = selectedDeviceIds.has(device.deviceId);
                  return (
                    <button
                      className={`em-device-row ${checked ? 'selected' : ''}`}
                      key={device.deviceId}
                      onClick={() => toggleDevice(device.deviceId)}
                      type="button"
                    >
                      <span className={`em-checkbox ${checked ? 'checked' : ''}`}>
                        {checked ? '✓' : ''}
                      </span>
                      <span className="em-device-label">
                        {device.name}
                        <span className="em-device-sub">{device.area}</span>
                      </span>
                      <span className={`em-device-dot ${device.online ? 'online' : 'offline'}`} title={device.online ? 'Đang kết nối' : 'Mất kết nối'} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Duration card */}
          <div className="em-card em-duration-card">
            <div className="em-card-head">
              <span className="em-card-icon">⏱</span>
              <h3 className="em-card-title">Thời lượng phát</h3>
            </div>
            <div className="em-duration-group">
              {DURATION_OPTIONS.map((d) => (
                <button
                  className={`em-duration-btn ${durationMinutes === d ? 'active' : ''}`}
                  key={d}
                  onClick={() => setDurationMinutes(d)}
                  type="button"
                >
                  {d} phút
                </button>
              ))}
            </div>
            <p className="em-duration-hint">
              Thiết bị tự dừng sau <strong>{durationMinutes} phút</strong>. Có thể dừng thủ công sớm hơn.
            </p>
          </div>
        </div>

        {/* RIGHT: Sources */}
        <div className="em-right">
          <div className="em-card em-sources-card">
            <div className="em-card-head">
              <span className="em-card-icon">📡</span>
              <h3 className="em-card-title">Nguồn phát</h3>
              <button className="em-add-btn" disabled={busy} onClick={openCreateSource} type="button">
                + Thêm nguồn
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="em-sources-empty">
                <div className="em-empty-icon">📻</div>
                <p>Chưa có nguồn phát nào.</p>
                <p className="em-empty-sub">Thêm URL RTSP hoặc HLS để bắt đầu.</p>
              </div>
            ) : (
              <div className="em-source-list">
                {sources.map((source) => {
                  const canPlay = !activeSession && selectedDeviceIds.size > 0;
                  return (
                    <div className="em-source-item" key={source.sourceId}>
                      <div className="em-source-left">
                        <div className="em-source-name">{source.name}</div>
                        <div className="em-source-url" title={source.url}>{source.url}</div>
                      </div>
                      <div className="em-source-actions">
                        <button
                          className="em-action-btn edit"
                          disabled={busy}
                          onClick={() => openEditSource(source)}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="em-action-btn delete"
                          disabled={busy}
                          onClick={() => void deleteSource(source.sourceId)}
                          type="button"
                        >
                          Xóa
                        </button>
                        <button
                          className={`em-play-btn ${!canPlay ? 'em-play-disabled' : ''}`}
                          disabled={busy || !canPlay}
                          onClick={() => void playSource(source)}
                          title={
                            activeSession
                              ? 'Đang có phiên khác đang phát'
                              : !selectedDeviceIds.size
                                ? 'Chọn thiết bị trước'
                                : `Phát ${source.name} đến ${selectedDeviceIds.size} thiết bị trong ${durationMinutes} phút`
                          }
                          type="button"
                        >
                          <span>▶</span> Phát
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* History */}
          <div className="em-card em-history-card">
            <div className="em-card-head">
              <span className="em-card-icon">📋</span>
              <h3 className="em-card-title">Lịch sử phát khẩn cấp</h3>
            </div>
            {sessions.length === 0 ? (
              <div className="em-history-empty">Chưa có phiên nào.</div>
            ) : (
              <div className="em-table-wrap">
                <table className="em-table">
                  <thead>
                    <tr>
                      <th>Nguồn</th>
                      <th>Thiết bị</th>
                      <th>Thời lượng</th>
                      <th>Bắt đầu</th>
                      <th>Kết thúc dự kiến</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.sessionId}>
                        <td>
                          <div className="em-history-name">{session.sourceName}</div>
                          <div className="em-history-url">{session.sourceUrl.length > 35 ? session.sourceUrl.slice(0, 35) + '…' : session.sourceUrl}</div>
                        </td>
                        <td>{session.targetLabel}</td>
                        <td>{session.durationMinutes} phút</td>
                        <td>{formatDateTime(session.startedAt)}</td>
                        <td>{formatDateTime(session.scheduledEndAt)}</td>
                        <td>
                          <span className={`em-status-pill ${session.status === 'ACTIVE' ? 'active' : session.status === 'CANCELLED' ? 'cancelled' : 'done'}`}>
                            {session.status === 'ACTIVE' ? '● Đang phát' : session.status === 'CANCELLED' ? '✕ Đã dừng' : '✓ Hoàn thành'}
                          </span>
                        </td>
                        <td>
                          {session.status === 'ACTIVE' ? (
                            <button
                              className="em-action-btn delete"
                              disabled={busy}
                              onClick={() => void stopSession(session.sessionId)}
                              type="button"
                            >
                              Dừng
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {sourceModalOpen ? (
        <div className="em-modal-backdrop" onClick={closeSourceModal}>
          <div className="em-modal" onClick={(e) => e.stopPropagation()}>
            <div className="em-modal-head">
              <h2>{editingSourceId ? 'Sửa nguồn phát' : 'Thêm nguồn phát'}</h2>
              <button className="em-modal-close" onClick={closeSourceModal} type="button">✕</button>
            </div>
            <form className="em-modal-body" onSubmit={saveSource}>
              <label className="em-field">
                <span className="em-field-label">Tên nguồn <span className="em-req">*</span></span>
                <input
                  className="em-field-input"
                  placeholder="VD: VOV2, Đài tỉnh, TTXVN..."
                  required
                  value={sourceForm.name}
                  onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="em-field">
                <span className="em-field-label">Stream URL <span className="em-req">*</span></span>
                <input
                  className="em-field-input"
                  placeholder="http://... hoặc rtsp://..."
                  required
                  value={sourceForm.url}
                  onChange={(e) => setSourceForm((f) => ({ ...f, url: e.target.value }))}
                />
                <span className="em-field-hint">Hỗ trợ HLS (.m3u8), RTSP, HTTP stream</span>
              </label>
              <div className="em-modal-footer">
                <button className="em-cancel-btn" onClick={closeSourceModal} type="button">Hủy</button>
                <button
                  className="em-save-btn"
                  disabled={busy || !sourceForm.name.trim() || !sourceForm.url.trim()}
                  type="submit"
                >
                  {editingSourceId ? 'Lưu thay đổi' : 'Thêm nguồn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
