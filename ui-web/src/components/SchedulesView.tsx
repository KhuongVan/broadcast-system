import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AudioFile, Playlist, Schedule, ScheduleInput } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

const today = new Date().toISOString().slice(0, 10);

const emptyForm: ScheduleInput = {
  name: '',
  sourceType: 'RTSP',
  priority: 'NORMAL',
  playlistId: null,
  fileId: null,
  fileMode: null,
  rtspUrl: '',
  startDate: today,
  startTime: '06:00',
  endTime: '06:30',
  repeatType: 'DAILY',
  enabled: true,
};

export function SchedulesView() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [form, setForm] = useState<ScheduleInput>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');

  const rtspSchedules = useMemo(() => schedules.filter((schedule) => schedule.sourceType === 'RTSP'), [schedules]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [scheduleData, playlistData, fileData] = await Promise.all([
        adminApi.listSchedules(),
        adminApi.listPlaylists(),
        adminApi.listFiles(),
      ]);
      setSchedules(scheduleData.schedules);
      setPlaylists(playlistData.playlists);
      setFiles(fileData.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch phát.');
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof ScheduleInput>(key: K, value: ScheduleInput[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'sourceType' && value === 'RTSP') {
        next.playlistId = null;
        next.fileId = null;
        next.fileMode = null;
      }
      if (key === 'sourceType' && value === 'FILE') {
        next.fileMode = next.fileMode || 'PLAYLIST';
        next.rtspUrl = null;
      }
      if (key === 'fileMode' && value === 'PLAYLIST') {
        next.fileId = null;
      }
      return next;
    });
  }

  function edit(schedule: Schedule) {
    setEditingId(schedule.scheduleId);
    setTestResult('');
    setForm({
      name: schedule.name,
      sourceType: schedule.sourceType,
      priority: schedule.priority,
      playlistId: schedule.playlistId,
      fileId: schedule.fileId,
      fileMode: schedule.fileMode,
      rtspUrl: schedule.rtspUrl,
      startDate: schedule.startDate,
      startTime: schedule.startTime.slice(0, 5),
      endTime: schedule.endTime.slice(0, 5),
      repeatType: schedule.repeatType,
      enabled: schedule.enabled,
    });
  }

  function resetForm() {
    setEditingId('');
    setTestResult('');
    setForm(emptyForm);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = normalizeForm(form);
      if (editingId) {
        await adminApi.updateSchedule(editingId, payload);
      } else {
        await adminApi.createSchedule(payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được lịch phát.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!confirm('Xóa lịch phát này?')) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deleteSchedule(scheduleId);
      if (editingId === scheduleId) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được lịch phát.');
    } finally {
      setSaving(false);
    }
  }

  async function testRtsp() {
    if (!form.rtspUrl?.trim()) return;
    setSaving(true);
    setTestResult('');
    setError('');
    try {
      const result = await adminApi.testRtsp(form.rtspUrl.trim());
      setTestResult(result.message || 'Stream URL phản hồi hợp lệ.');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Không kiểm tra được stream URL.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel title="Lịch phát" description="Tạo, sửa, kiểm tra URL và quản lý lịch tự động.">
      <DataState loading={loading} error={error} empty={!schedules.length && !playlists.length && !files.length} emptyText="Chưa có dữ liệu lịch phát." />
      {!loading ? (
        <div className="split-layout">
          <form className="detail-panel form-panel" onSubmit={save}>
            <h3>{editingId ? 'Sửa lịch phát' : 'Tạo lịch phát'}</h3>
            <label>
              Tên lịch
              <input value={form.name} onChange={(event) => update('name', event.target.value)} required />
            </label>
            <div className="form-grid">
              <label>
                Nguồn phát
                <select value={form.sourceType} onChange={(event) => update('sourceType', event.target.value as ScheduleInput['sourceType'])}>
                  <option value="RTSP">RTSP/HLS URL</option>
                  <option value="FILE">File/Playlist</option>
                </select>
              </label>
              <label>
                Ưu tiên
                <select value={form.priority} onChange={(event) => update('priority', event.target.value as ScheduleInput['priority'])}>
                  <option value="NORMAL">Thường</option>
                  <option value="EMERGENCY">Khẩn cấp</option>
                </select>
              </label>
            </div>

            {form.sourceType === 'RTSP' ? (
              <label>
                Stream URL
                <input
                  placeholder="rtsp:// hoặc https://..."
                  value={form.rtspUrl || ''}
                  onChange={(event) => update('rtspUrl', event.target.value)}
                  required
                />
              </label>
            ) : (
              <>
                <label>
                  Playlist
                  <select value={form.playlistId || ''} onChange={(event) => update('playlistId', event.target.value || null)} required>
                    <option value="">Chọn playlist</option>
                    {playlists.map((playlist) => (
                      <option key={playlist.playlistId} value={playlist.playlistId}>
                        {playlist.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Chế độ file
                    <select value={form.fileMode || 'PLAYLIST'} onChange={(event) => update('fileMode', event.target.value as ScheduleInput['fileMode'])}>
                      <option value="PLAYLIST">Phát cả playlist</option>
                      <option value="SINGLE_FILE">Một file trong playlist</option>
                    </select>
                  </label>
                  {form.fileMode === 'SINGLE_FILE' ? (
                    <label>
                      File
                      <select value={form.fileId || ''} onChange={(event) => update('fileId', event.target.value || null)} required>
                        <option value="">Chọn file</option>
                        {files.map((file) => (
                          <option key={file.fileId} value={file.fileId}>
                            {file.originalName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </>
            )}

            <div className="form-grid">
              <label>
                Ngày bắt đầu
                <input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} required />
              </label>
              <label>
                Lặp
                <select value={form.repeatType} onChange={(event) => update('repeatType', event.target.value as ScheduleInput['repeatType'])}>
                  <option value="ONCE">Một lần</option>
                  <option value="DAILY">Hằng ngày</option>
                  <option value="WEEKLY">Hằng tuần</option>
                  <option value="MONTHLY">Hằng tháng</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Giờ bắt đầu
                <input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} required />
              </label>
              <label>
                Giờ kết thúc
                <input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} required />
              </label>
            </div>
            <label className="check-row">
              <input checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} type="checkbox" />
              Bật lịch
            </label>
            <div className="row-actions">
              <button className="primary" disabled={saving || !form.name.trim()}>
                {editingId ? 'Lưu lịch' : 'Tạo lịch'}
              </button>
              {form.sourceType === 'RTSP' ? (
                <button className="ghost" disabled={saving || !form.rtspUrl?.trim()} onClick={() => void testRtsp()} type="button">
                  Test URL
                </button>
              ) : null}
              {editingId ? (
                <button className="ghost" onClick={resetForm} type="button">
                  Hủy sửa
                </button>
              ) : null}
            </div>
            {testResult ? <div className="state compact">{testResult}</div> : null}
            {rtspSchedules.length ? <p className="subtext">Play-now và sync thiết bị chỉ dùng lịch RTSP/HLS.</p> : null}
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên lịch</th>
                  <th>Nguồn</th>
                  <th>Thời gian</th>
                  <th>Lặp</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.scheduleId}>
                    <td>
                      <strong>{schedule.name}</strong>
                      <div className="subtext">{schedule.priority === 'EMERGENCY' ? 'Ưu tiên khẩn cấp' : 'Ưu tiên thường'}</div>
                    </td>
                    <td>{sourceLabel(schedule)}</td>
                    <td>
                      {schedule.startDate} {schedule.startTime.slice(0, 5)} - {schedule.endTime.slice(0, 5)}
                    </td>
                    <td>{repeatLabel(schedule.repeatType)}</td>
                    <td>
                      <StatusBadge tone={schedule.enabled ? 'ok' : 'neutral'}>
                        {schedule.enabled ? 'Đang bật' : 'Đang tắt'}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="ghost" onClick={() => edit(schedule)} type="button">
                          Sửa
                        </button>
                        <button className="danger" disabled={saving} onClick={() => deleteSchedule(schedule.scheduleId)} type="button">
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function normalizeForm(form: ScheduleInput): ScheduleInput {
  if (form.sourceType === 'RTSP') {
    return { ...form, playlistId: null, fileId: null, fileMode: null, rtspUrl: form.rtspUrl?.trim() || '' };
  }

  return {
    ...form,
    rtspUrl: null,
    fileMode: form.fileMode || 'PLAYLIST',
    fileId: form.fileMode === 'SINGLE_FILE' ? form.fileId : null,
  };
}

function sourceLabel(schedule: Schedule) {
  if (schedule.sourceType === 'RTSP') return 'RTSP/HLS';
  return schedule.fileMode === 'SINGLE_FILE' ? 'Một file' : 'Playlist';
}

function repeatLabel(value: Schedule['repeatType']) {
  return {
    ONCE: 'Một lần',
    DAILY: 'Hằng ngày',
    WEEKLY: 'Hằng tuần',
    MONTHLY: 'Hằng tháng',
  }[value];
}
