import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AudioFile, Playlist, Schedule, ScheduleInput } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Pagination, paginate, usePagination } from './Pagination';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';

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
  repeatCount: 0,
  enabled: true,
};

type SchedulesViewProps = {
  embedded?: boolean;
};

export function SchedulesView({ embedded = false }: SchedulesViewProps) {
  const { showToast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [form, setForm] = useState<ScheduleInput>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [search, setSearch] = useState('');

  const rtspSchedules = useMemo(() => schedules.filter((schedule) => schedule.sourceType === 'RTSP'), [schedules]);
  const displaySchedules = useMemo(() => [...schedules].sort(compareScheduleCreatedAtDesc), [schedules]);
  const filteredSchedules = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return displaySchedules;
    return displaySchedules.filter((schedule) => normalizeSearchText(schedule.name).includes(keyword));
  }, [displaySchedules, search]);
  const schedulePagination = usePagination(filteredSchedules.length);
  const pagedSchedules = useMemo(
    () => paginate(filteredSchedules, schedulePagination.page, schedulePagination.pageSize),
    [filteredSchedules, schedulePagination.page, schedulePagination.pageSize],
  );

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
        next.repeatCount = 0;
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
    setModalOpen(true);
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
      repeatCount: schedule.sourceType === 'FILE' ? schedule.repeatCount || 0 : 0,
      enabled: schedule.enabled,
    });
  }

  function resetForm() {
    setEditingId('');
    setTestResult('');
    setForm(emptyForm);
  }

  function openCreateModal() {
    resetForm();
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
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
      setModalOpen(false);
      await load();
    } catch (err) {
      showError(err, 'Không lưu được lịch phát.');
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
      showError(err, 'Không xóa được lịch phát.');
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
      const message = getErrorMessage(err, 'Không kiểm tra được stream URL.');
      setTestResult(message);
      showToast({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    schedulePagination.setPage(1);
  }, [schedulePagination.setPage, search]);

  function showError(error: unknown, fallback = 'Có lỗi xảy ra.') {
    const message = getErrorMessage(error, fallback);
    setError(message);
    showToast({ type: 'error', message });
  }

  return (
    <Panel
      title={embedded ? 'Lịch phát' : 'Lịch phát'}
      description="Tạo, sửa, kiểm tra URL và quản lý lịch tự động."
      actions={
        <button className="primary" onClick={openCreateModal} type="button">
          Tạo lịch phát
        </button>
      }
    >
      <DataState loading={loading} error={error} empty={!schedules.length && !playlists.length && !files.length} emptyText="Chưa có dữ liệu lịch phát." />
      {!loading ? (
        <>
          {schedules.length ? (
            <div className="section-toolbar search-only">
              <div className="toolbar-row">
                <input
                  aria-label="Tìm theo tên lịch phát"
                  placeholder="Tìm theo tên lịch phát..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          {schedules.length && !filteredSchedules.length ? <div className="state">Không tìm thấy lịch phát phù hợp.</div> : null}
          {filteredSchedules.length ? (
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
                {pagedSchedules.map((schedule) => (
                  <tr key={schedule.scheduleId}>
                    <td>
                      <strong>{schedule.name}</strong>
                    </td>
                    <td>{sourceLabel(schedule)}</td>
                    <td>
                      {schedule.startDate} {schedule.startTime.slice(0, 5)} - {schedule.endTime.slice(0, 5)}
                    </td>
                    <td>
                      {repeatLabel(schedule.repeatType)}
                      {schedule.sourceType === 'FILE' && schedule.repeatCount > 0 ? (
                        <div className="subtext">{playbackRepeatLabel(schedule.repeatCount)}</div>
                      ) : null}
                    </td>
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
            <Pagination page={schedulePagination.page} pageSize={schedulePagination.pageSize} totalItems={filteredSchedules.length} onPageChange={schedulePagination.setPage} />
          </div>
          ) : null}
          {modalOpen ? (
            <Modal title={editingId ? 'Sửa lịch phát' : 'Tạo lịch phát'} onClose={closeModal}>
              <form className="form-panel" onSubmit={save}>
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
                  {form.sourceType === 'FILE' ? (
                    <label>
                      Phát lặp lại
                      <div className="inline-fields">
                        <input
                          min={0}
                          max={30}
                          type="number"
                          value={form.repeatCount}
                          onChange={(event) => update('repeatCount', Number(event.target.value) as ScheduleInput['repeatCount'])}
                        />
                        <span>Lần</span>
                      </div>
                    </label>
                  ) : null}
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
                <div className="row-actions">
                  <button className="primary" disabled={saving || !form.name.trim()}>
                    {editingId ? 'Lưu lịch' : 'Tạo lịch'}
                  </button>
                  {form.sourceType === 'RTSP' ? (
                    <button className="ghost" disabled={saving || !form.rtspUrl?.trim()} onClick={() => void testRtsp()} type="button">
                      Test URL
                    </button>
                  ) : null}
                  <button className="ghost" onClick={closeModal} type="button">
                    Hủy
                  </button>
                </div>
                {testResult ? <div className="state compact">{testResult}</div> : null}
                {rtspSchedules.length ? <p className="subtext">Play-now và sync thiết bị chỉ dùng lịch RTSP/HLS.</p> : null}
              </form>
            </Modal>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function normalizeForm(form: ScheduleInput): ScheduleInput {
  if (form.sourceType === 'RTSP') {
    return { ...form, priority: 'NORMAL', playlistId: null, fileId: null, fileMode: null, rtspUrl: form.rtspUrl?.trim() || '', repeatCount: 0 };
  }

  return {
    ...form,
    priority: 'NORMAL',
    rtspUrl: null,
    fileMode: form.fileMode || 'PLAYLIST',
    fileId: form.fileMode === 'SINGLE_FILE' ? form.fileId : null,
    repeatCount: Math.max(0, Math.min(30, Number(form.repeatCount) || 0)),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compareScheduleCreatedAtDesc(a: Schedule, b: Schedule) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

function playbackRepeatLabel(value: number) {
  return `Phát lại ${value} lần`;
}
