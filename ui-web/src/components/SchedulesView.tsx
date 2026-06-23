import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AudioFile, Playlist, Schedule, ScheduleGroup, ScheduleGroupInput, ScheduleInput } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';

const today = new Date().toISOString().slice(0, 10);
const HOURS = Array.from({ length: 24 }, (_, index) => index);

const emptyGroupForm: ScheduleGroupInput = {
  name: '',
  enabled: true,
};

const emptyProgramForm: ScheduleInput = {
  scheduleGroupId: null,
  name: '',
  sourceType: 'RTSP',
  priority: 'NORMAL',
  playlistId: null,
  fileId: null,
  fileMode: null,
  selectedPlaylistItemIds: [],
  rtspUrl: '',
  startDate: today,
  startTime: '06:00',
  endTime: '06:30',
  repeatType: 'DAILY',
  repeatCount: 0,
  enabled: true,
};

type CalendarMode = 'day' | 'week' | 'month';

type SchedulesViewProps = {
  embedded?: boolean;
};

type CalendarOccurrence = {
  key: string;
  date: string;
  schedule: Schedule;
};

type ScheduleScreenMode = 'list' | 'calendar';

export function SchedulesView({ embedded = false }: SchedulesViewProps) {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [programs, setPrograms] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [screenMode, setScreenMode] = useState<ScheduleScreenMode>('list');
  const [calendarDate, setCalendarDate] = useState(today);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');
  const [groupForm, setGroupForm] = useState<ScheduleGroupInput>(emptyGroupForm);
  const [programForm, setProgramForm] = useState<ScheduleInput>(emptyProgramForm);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [editingProgramId, setEditingProgramId] = useState('');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');

  const selectedGroup = useMemo(
    () => groups.find((group) => group.scheduleGroupId === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const sortedPrograms = useMemo(
    () => [...programs].sort((a, b) => `${a.startDate} ${a.startTime}`.localeCompare(`${b.startDate} ${b.startTime}`)),
    [programs],
  );

  const calendarDays = useMemo(() => getCalendarDays(calendarDate, calendarMode), [calendarDate, calendarMode]);
  const occurrences = useMemo(() => buildOccurrences(sortedPrograms, calendarDays), [calendarDays, sortedPrograms]);
  const rtspPrograms = useMemo(() => programs.filter((schedule) => schedule.sourceType === 'RTSP'), [programs]);
  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.playlistId === programForm.playlistId) || null,
    [playlists, programForm.playlistId],
  );
  const selectedPlaylistItemIds = programForm.selectedPlaylistItemIds || [];

  async function load(preferredGroupId?: string) {
    setLoading(true);
    setError('');
    try {
      const [groupData, playlistData, fileData] = await Promise.all([
        adminApi.listScheduleGroups(),
        adminApi.listPlaylists(),
        adminApi.listFiles(),
      ]);
      setGroups(groupData.scheduleGroups);
      setPlaylists(playlistData.playlists);
      setFiles(fileData.files);
      const requestedGroupId = preferredGroupId ?? selectedGroupId;
      const nextGroupId = groupData.scheduleGroups.some((group) => group.scheduleGroupId === requestedGroupId)
        ? requestedGroupId
        : groupData.scheduleGroups[0]?.scheduleGroupId || '';
      setSelectedGroupId(nextGroupId);
      if (!nextGroupId) setPrograms([]);
    } catch (err) {
      showError(err, 'Không tải được lịch phát.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPrograms(scheduleGroupId: string) {
    const data = await adminApi.listScheduleGroupPrograms(scheduleGroupId);
    setPrograms(data.schedules);
  }

  async function selectGroup(scheduleGroupId: string) {
    setSelectedGroupId(scheduleGroupId);
    setError('');
    try {
      await loadPrograms(scheduleGroupId);
    } catch (err) {
      showError(err, 'Không tải được chương trình phát.');
    }
  }

  async function openPrograms(group: ScheduleGroup) {
    setSelectedGroupId(group.scheduleGroupId);
    setScreenMode('calendar');
    setError('');
    try {
      await loadPrograms(group.scheduleGroupId);
    } catch (err) {
      showError(err, 'Không tải được chương trình phát.');
    }
  }

  async function changeCalendarGroup(scheduleGroupId: string) {
    setSelectedGroupId(scheduleGroupId);
    setError('');
    try {
      await loadPrograms(scheduleGroupId);
    } catch (err) {
      showError(err, 'Không tải được chương trình phát.');
    }
  }

  async function toggleSelectedGroupEnabled() {
    if (!selectedGroup) return;
    setSaving(true);
    setError('');
    try {
      const nextEnabled = !selectedGroup.enabled;
      await adminApi.updateScheduleGroup(selectedGroup.scheduleGroupId, {
        name: selectedGroup.name,
        enabled: nextEnabled,
      });
      const refreshedGroups = await adminApi.listScheduleGroups();
      setGroups(refreshedGroups.scheduleGroups);
    } catch (err) {
      showError(err, 'Không cập nhật được trạng thái lịch phát.');
    } finally {
      setSaving(false);
    }
  }

  function openCreateGroup() {
    setEditingGroupId('');
    setGroupForm(emptyGroupForm);
    setGroupModalOpen(true);
  }

  function editGroup(group: ScheduleGroup) {
    setEditingGroupId(group.scheduleGroupId);
    setGroupForm({ name: group.name, enabled: group.enabled });
    setGroupModalOpen(true);
  }

  function closeGroupModal() {
    setGroupModalOpen(false);
    setEditingGroupId('');
    setGroupForm(emptyGroupForm);
  }

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      let nextGroupId = selectedGroupId;
      if (editingGroupId) {
        await adminApi.updateScheduleGroup(editingGroupId, groupForm);
      } else {
        const { scheduleGroup } = await adminApi.createScheduleGroup(groupForm);
        nextGroupId = scheduleGroup.scheduleGroupId;
      }
      closeGroupModal();
      await load(nextGroupId);
    } catch (err) {
      showError(err, 'Không lưu được lịch phát.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(group: ScheduleGroup) {
    if (!confirm(`Xóa lịch phát "${group.name}" và toàn bộ chương trình bên trong?`)) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deleteScheduleGroup(group.scheduleGroupId);
      await load('');
      if (selectedGroupId === group.scheduleGroupId) {
        setScreenMode('list');
      }
    } catch (err) {
      showError(err, 'Không xóa được lịch phát.');
    } finally {
      setSaving(false);
    }
  }

  function openCreateProgram(date = calendarDate, time = '06:00') {
    if (!selectedGroup) return;
    setEditingProgramId('');
    setTestResult('');
    setProgramForm({
      ...emptyProgramForm,
      scheduleGroupId: selectedGroup.scheduleGroupId,
      startDate: date,
      startTime: time,
      endTime: addMinutes(time, 30),
    });
    setProgramModalOpen(true);
  }

  function editProgram(schedule: Schedule) {
    const schedulePlaylist = playlists.find((playlist) => playlist.playlistId === schedule.playlistId) || null;
    const legacySingleFileItemId =
      schedule.fileMode === 'SINGLE_FILE' && schedule.fileId
        ? schedulePlaylist?.items.find((item) => item.fileId === schedule.fileId)?.playlistItemId
        : null;
    setEditingProgramId(schedule.scheduleId);
    setTestResult('');
    setProgramForm({
      scheduleGroupId: schedule.scheduleGroupId,
      name: schedule.name,
      sourceType: schedule.sourceType,
      priority: schedule.priority,
      playlistId: schedule.playlistId,
      fileId: null,
      fileMode: schedule.fileMode === 'SINGLE_FILE' ? 'SELECTED_FILES' : schedule.fileMode,
      selectedPlaylistItemIds: schedule.fileMode === 'SINGLE_FILE'
        ? legacySingleFileItemId ? [legacySingleFileItemId] : []
        : schedule.selectedPlaylistItemIds || [],
      rtspUrl: schedule.rtspUrl,
      startDate: schedule.startDate,
      startTime: schedule.startTime.slice(0, 5),
      endTime: schedule.endTime.slice(0, 5),
      repeatType: schedule.repeatType,
      repeatCount: schedule.sourceType === 'FILE' ? schedule.repeatCount || 0 : 0,
      enabled: schedule.enabled,
    });
    setProgramModalOpen(true);
  }

  function closeProgramModal() {
    setProgramModalOpen(false);
    setEditingProgramId('');
    setTestResult('');
    setProgramForm(emptyProgramForm);
  }

  function updateProgram<K extends keyof ScheduleInput>(key: K, value: ScheduleInput[K]) {
    setProgramForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'sourceType' && value === 'RTSP') {
        next.playlistId = null;
        next.fileId = null;
        next.fileMode = null;
        next.selectedPlaylistItemIds = [];
        next.repeatCount = 0;
      }
      if (key === 'sourceType' && value === 'FILE') {
        next.fileMode = next.fileMode || 'PLAYLIST';
        next.rtspUrl = null;
      }
      if (key === 'playlistId') {
        next.fileId = null;
        next.selectedPlaylistItemIds = [];
      }
      if (key === 'fileMode' && value === 'PLAYLIST') {
        next.fileId = null;
        next.selectedPlaylistItemIds = [];
      }
      return next;
    });
  }

  function toggleSelectedPlaylistItem(playlistItemId: string) {
    setProgramForm((current) => {
      const selectedIds = new Set(current.selectedPlaylistItemIds || []);
      if (selectedIds.has(playlistItemId)) {
        selectedIds.delete(playlistItemId);
      } else {
        selectedIds.add(playlistItemId);
      }
      return { ...current, selectedPlaylistItemIds: Array.from(selectedIds), fileId: null };
    });
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroup) return;
    setSaving(true);
    setError('');
    try {
      const payload = normalizeForm({ ...programForm, scheduleGroupId: selectedGroup.scheduleGroupId });
      if (editingProgramId) {
        await adminApi.updateScheduleGroupProgram(selectedGroup.scheduleGroupId, editingProgramId, payload);
      } else {
        await adminApi.createScheduleGroupProgram(selectedGroup.scheduleGroupId, payload);
      }
      closeProgramModal();
      await loadPrograms(selectedGroup.scheduleGroupId);
      const refreshedGroups = await adminApi.listScheduleGroups();
      setGroups(refreshedGroups.scheduleGroups);
    } catch (err) {
      showError(err, 'Không lưu được chương trình phát.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProgram(schedule: Schedule) {
    if (!selectedGroup || !confirm(`Xóa chương trình "${schedule.name}"?`)) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deleteScheduleGroupProgram(selectedGroup.scheduleGroupId, schedule.scheduleId);
      await loadPrograms(selectedGroup.scheduleGroupId);
      const refreshedGroups = await adminApi.listScheduleGroups();
      setGroups(refreshedGroups.scheduleGroups);
    } catch (err) {
      showError(err, 'Không xóa được chương trình phát.');
    } finally {
      setSaving(false);
    }
  }

  async function testRtsp() {
    if (!programForm.rtspUrl?.trim()) return;
    setSaving(true);
    setTestResult('');
    setError('');
    try {
      const result = await adminApi.testRtsp(programForm.rtspUrl.trim());
      setTestResult(result.message || 'Stream URL phản hồi hợp lệ.');
    } catch (err) {
      const message = getErrorMessage(err, 'Không kiểm tra được stream URL.');
      setTestResult(message);
      showToast({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  function moveCalendar(direction: -1 | 1) {
    setCalendarDate(shiftDate(calendarDate, direction * (calendarMode === 'month' ? 30 : calendarMode === 'week' ? 7 : 1)));
  }

  function showError(error: unknown, fallback = 'Có lỗi xảy ra.') {
    const message = getErrorMessage(error, fallback);
    setError(message);
    showToast({ type: 'error', message });
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel
      title={embedded ? 'Lịch phát' : 'Lịch phát'}
      description="Quản lý lịch phát bên ngoài và các chương trình phát theo ngày, tuần, tháng."
      actions={
        <button className="primary" onClick={openCreateGroup} type="button">
          Tạo lịch phát
        </button>
      }
    >
      <DataState loading={loading} error={error} empty={!groups.length && !playlists.length && !files.length} emptyText="Chưa có dữ liệu lịch phát." />
      {!loading && screenMode === 'list' ? (
        groups.length ? (
          <div className="schedule-list-view table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên lịch phát</th>
                  <th>Số chương trình</th>
                  <th>Trạng thái</th>
                  <th>Cập nhật</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.scheduleGroupId}>
                    <td>
                      <strong>{group.name}</strong>
                    </td>
                    <td>{group.programCount} chương trình</td>
                    <td>
                      <StatusBadge tone={group.enabled ? 'ok' : 'neutral'}>
                        {group.enabled ? 'Đang bật' : 'Đang tắt'}
                      </StatusBadge>
                    </td>
                    <td>{formatShortDate(group.updatedAt)}</td>
                    <td>
                      <div className="row-actions schedule-table-actions">
                        <button className="ghost" onClick={() => editGroup(group)} type="button">Sửa lịch</button>
                        <button className="primary" onClick={() => void openPrograms(group)} type="button">Xem chương trình phát</button>
                        <button className="danger" disabled={saving} onClick={() => void deleteGroup(group)} type="button">Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="state">Chưa có lịch phát.</div>
      ) : null}

      {!loading && screenMode === 'calendar' ? (
        <section className="schedule-calendar-panel full">
          {selectedGroup ? (
            <>
              <div className="calendar-titlebar detail">
                <div className="row-actions">
                  <label className="calendar-group-select">
                    <span>Chọn lịch phát</span>
                    <select value={selectedGroupId} onChange={(event) => void changeCalendarGroup(event.target.value)}>
                      {groups.map((group) => (
                        <option key={group.scheduleGroupId} value={group.scheduleGroupId}>{group.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="calendar-selected-summary">
                  <h3>{selectedGroup.name}</h3>
                  <p>{selectedGroup.programCount} chương trình phát trong lịch này</p>
                </div>
                <div className="row-actions">
                  <button
                    aria-pressed={selectedGroup.enabled}
                    className={selectedGroup.enabled ? 'schedule-enable-toggle active' : 'schedule-enable-toggle'}
                    disabled={saving}
                    onClick={() => void toggleSelectedGroupEnabled()}
                    type="button"
                  >
                    <span aria-hidden="true" />
                    {selectedGroup.enabled ? 'Đang bật' : 'Đang tắt'}
                  </button>
                  <button className="primary" onClick={() => openCreateProgram()} type="button">Tạo chương trình</button>
                </div>
              </div>

              <div className="calendar-toolbar">
                <div className="row-actions">
                  <button className="ghost icon-btn" aria-label="Lùi" onClick={() => moveCalendar(-1)} type="button">‹</button>
                  <button className="ghost" onClick={() => setCalendarDate(today)} type="button">Hôm nay</button>
                  <button className="ghost icon-btn" aria-label="Tiến" onClick={() => moveCalendar(1)} type="button">›</button>
                </div>
                <strong>{calendarTitle(calendarDate, calendarMode)}</strong>
                <div className="row-actions">
                  <select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as CalendarMode)} aria-label="Chọn kiểu xem lịch">
                    <option value="day">Ngày</option>
                    <option value="week">Tuần</option>
                    <option value="month">Tháng</option>
                  </select>
                </div>
              </div>

              <Calendar
                days={calendarDays}
                mode={calendarMode}
                occurrences={occurrences}
                onCreate={openCreateProgram}
                onEdit={editProgram}
              />

              {sortedPrograms.length ? (
                <div className="program-summary table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên chương trình</th>
                        <th>Nguồn</th>
                        <th>Thời gian</th>
                        <th>Lặp</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPrograms.map((schedule) => (
                        <tr key={schedule.scheduleId}>
                          <td><strong>{schedule.name}</strong></td>
                          <td>{sourceLabel(schedule)}</td>
                          <td>{schedule.startDate} {schedule.startTime.slice(0, 5)}-{schedule.endTime.slice(0, 5)}</td>
                          <td>{repeatLabel(schedule.repeatType)}</td>
                          <td>
                            <StatusBadge tone={selectedGroup.enabled && schedule.enabled ? 'ok' : 'neutral'}>
                              {selectedGroup.enabled && schedule.enabled ? 'Đang bật' : 'Đang tắt'}
                            </StatusBadge>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button className="ghost" onClick={() => editProgram(schedule)} type="button">Sửa</button>
                              <button className="danger" disabled={saving} onClick={() => void deleteProgram(schedule)} type="button">Xóa</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="state">Lịch phát này chưa có chương trình.</div>}
            </>
          ) : <div className="state">Chọn hoặc tạo một lịch phát để bắt đầu.</div>}
        </section>
      ) : null}

      {groupModalOpen ? (
        <Modal title={editingGroupId ? 'Sửa lịch phát' : 'Tạo lịch phát'} onClose={closeGroupModal}>
          <form className="form-panel" onSubmit={saveGroup}>
            <label>
              Tên lịch phát
              <input value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label className="check-row">
              <input checked={groupForm.enabled} onChange={(event) => setGroupForm((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
              <span>Bật lịch phát</span>
            </label>
            <div className="row-actions">
              <button className="primary" disabled={saving || !groupForm.name.trim()}>{editingGroupId ? 'Lưu lịch' : 'Tạo lịch'}</button>
              <button className="ghost" onClick={closeGroupModal} type="button">Hủy</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {programModalOpen ? (
        <Modal title={editingProgramId ? 'Sửa chương trình phát' : 'Tạo chương trình phát'} onClose={closeProgramModal}>
          <form className="form-panel" onSubmit={saveProgram}>
            <label>
              Tên chương trình
              <input value={programForm.name} onChange={(event) => updateProgram('name', event.target.value)} required />
            </label>
            <div className="form-grid">
              <label>
                Nguồn phát
                <select value={programForm.sourceType} onChange={(event) => updateProgram('sourceType', event.target.value as ScheduleInput['sourceType'])}>
                  <option value="RTSP">RTSP/HLS URL</option>
                  <option value="FILE">File/Playlist</option>
                </select>
              </label>
              {programForm.sourceType === 'FILE' ? (
                <label>
                  Phát lặp lại
                  <div className="inline-fields">
                    <input min={0} max={30} type="number" value={programForm.repeatCount} onChange={(event) => updateProgram('repeatCount', Number(event.target.value) as ScheduleInput['repeatCount'])} />
                    <span>Lần</span>
                  </div>
                </label>
              ) : null}
            </div>

            {programForm.sourceType === 'RTSP' ? (
              <label>
                Stream URL
                <input placeholder="rtsp:// hoặc https://..." value={programForm.rtspUrl || ''} onChange={(event) => updateProgram('rtspUrl', event.target.value)} required />
              </label>
            ) : (
              <>
                <label>
                  Playlist
                  <select value={programForm.playlistId || ''} onChange={(event) => updateProgram('playlistId', event.target.value || null)} required>
                    <option value="">Chọn playlist</option>
                    {playlists.map((playlist) => <option key={playlist.playlistId} value={playlist.playlistId}>{playlist.name}</option>)}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Chế độ file
                    <select value={programForm.fileMode || 'PLAYLIST'} onChange={(event) => updateProgram('fileMode', event.target.value as ScheduleInput['fileMode'])}>
                      <option value="PLAYLIST">Phát cả playlist</option>
                      <option value="SELECTED_FILES">Chọn file trong playlist</option>
                    </select>
                  </label>
                </div>
                {programForm.fileMode === 'SELECTED_FILES' ? (
                  <div className="playlist-file-list schedule-file-checklist">
                    {selectedPlaylist?.items.length ? selectedPlaylist.items.map((item) => (
                      <label className="check-row playlist-file-row" key={item.playlistItemId}>
                        <input
                          checked={selectedPlaylistItemIds.includes(item.playlistItemId)}
                          onChange={() => toggleSelectedPlaylistItem(item.playlistItemId)}
                          type="checkbox"
                        />
                        <span>{item.file.originalName}</span>
                      </label>
                    )) : (
                      <div className="state compact">{selectedPlaylist ? 'Playlist chưa có file.' : 'Vui lòng chọn playlist trước.'}</div>
                    )}
                  </div>
                ) : null}
              </>
            )}

            <div className="form-grid">
              <label>
                Ngày bắt đầu
                <input type="date" value={programForm.startDate} onChange={(event) => updateProgram('startDate', event.target.value)} required />
              </label>
              <label>
                Lặp
                <select value={programForm.repeatType} onChange={(event) => updateProgram('repeatType', event.target.value as ScheduleInput['repeatType'])}>
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
                <input type="time" value={programForm.startTime} onChange={(event) => updateProgram('startTime', event.target.value)} required />
              </label>
              <label>
                Giờ kết thúc
                <input type="time" value={programForm.endTime} onChange={(event) => updateProgram('endTime', event.target.value)} required />
              </label>
            </div>
            <label className="check-row">
              <input checked={programForm.enabled} onChange={(event) => updateProgram('enabled', event.target.checked)} type="checkbox" />
              <span>Bật chương trình</span>
            </label>
            <div className="row-actions">
              <button className="primary" disabled={saving || !programForm.name.trim() || (programForm.fileMode === 'SELECTED_FILES' && selectedPlaylistItemIds.length === 0)}>{editingProgramId ? 'Lưu chương trình' : 'Tạo chương trình'}</button>
              {programForm.sourceType === 'RTSP' ? <button className="ghost" disabled={saving || !programForm.rtspUrl?.trim()} onClick={() => void testRtsp()} type="button">Test URL</button> : null}
              <button className="ghost" onClick={closeProgramModal} type="button">Hủy</button>
            </div>
            {testResult ? <div className="state compact">{testResult}</div> : null}
            {rtspPrograms.length ? <p className="subtext">Play-now và sync thiết bị có thể dùng lịch phát chứa chương trình RTSP/HLS.</p> : null}
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

function Calendar({ days, mode, occurrences, onCreate, onEdit }: {
  days: string[];
  mode: CalendarMode;
  occurrences: CalendarOccurrence[];
  onCreate: (date: string, time?: string) => void;
  onEdit: (schedule: Schedule) => void;
}) {
  if (mode === 'month') {
    return (
      <div className="calendar-month-grid">
        {days.map((date) => {
          const dayOccurrences = occurrences.filter((occurrence) => occurrence.date === date);
          return (
            <button className={date === today ? 'calendar-month-day today' : 'calendar-month-day'} key={date} onClick={() => onCreate(date)} type="button">
              <strong>{formatDayNumber(date)}</strong>
              <span>{formatWeekday(date)}</span>
              <div>
                {dayOccurrences.slice(0, 3).map((occurrence) => (
                  <em key={occurrence.key} onClick={(event) => { event.stopPropagation(); onEdit(occurrence.schedule); }}>
                    {occurrence.schedule.startTime.slice(0, 5)} {occurrence.schedule.name}
                  </em>
                ))}
                {dayOccurrences.length > 3 ? <small>+{dayOccurrences.length - 3} chương trình</small> : null}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={mode === 'day' ? 'calendar-time-grid day' : 'calendar-time-grid week'}>
      <div className="calendar-time-axis">
        <span />
        {HOURS.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
      </div>
      {days.map((date) => (
        <div className={date === today ? 'calendar-day-column today' : 'calendar-day-column'} key={date}>
          <button className="calendar-day-head" onClick={() => onCreate(date)} type="button">
            <span>{formatWeekday(date)}</span>
            <strong>{formatDisplayDate(date)}</strong>
          </button>
          <div className="calendar-day-slots">
            {HOURS.map((hour) => (
              <button
                aria-label={`Tạo chương trình ngày ${date} lúc ${hour}:00`}
                className="calendar-hour-slot"
                key={hour}
                onClick={() => onCreate(date, `${String(hour).padStart(2, '0')}:00`)}
                type="button"
              />
            ))}
            {occurrences.filter((occurrence) => occurrence.date === date).map((occurrence) => (
              <button
                className={occurrence.schedule.enabled ? 'calendar-event' : 'calendar-event disabled'}
                key={occurrence.key}
                onClick={() => onEdit(occurrence.schedule)}
                style={eventStyle(occurrence.schedule)}
                type="button"
              >
                <strong>{occurrence.schedule.name}</strong>
                <span>{occurrence.schedule.startTime.slice(0, 5)}-{occurrence.schedule.endTime.slice(0, 5)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizeForm(form: ScheduleInput): ScheduleInput {
  if (form.sourceType === 'RTSP') {
    return { ...form, priority: 'NORMAL', playlistId: null, fileId: null, fileMode: null, selectedPlaylistItemIds: [], rtspUrl: form.rtspUrl?.trim() || '', repeatCount: 0 };
  }

  return {
    ...form,
    priority: 'NORMAL',
    rtspUrl: null,
    fileMode: form.fileMode || 'PLAYLIST',
    fileId: null,
    selectedPlaylistItemIds: form.fileMode === 'SELECTED_FILES' ? form.selectedPlaylistItemIds || [] : [],
    repeatCount: Math.max(0, Math.min(30, Number(form.repeatCount) || 0)),
  };
}

function buildOccurrences(schedules: Schedule[], days: string[]) {
  const daySet = new Set(days);
  const occurrences: CalendarOccurrence[] = [];
  for (const schedule of schedules) {
    for (const date of days) {
      if (scheduleMatchesDate(schedule, date) && daySet.has(date)) {
        occurrences.push({ key: `${schedule.scheduleId}:${date}`, date, schedule });
      }
    }
  }
  return occurrences;
}

function getCalendarDays(date: string, mode: CalendarMode) {
  if (mode === 'day') return [date];
  if (mode === 'week') {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  }
  const [year, month] = date.split('-').map(Number);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
}

function scheduleMatchesDate(schedule: Schedule, date: string) {
  if (date < schedule.startDate) return false;
  if (schedule.repeatType === 'ONCE') return date === schedule.startDate;
  if (schedule.repeatType === 'DAILY') return true;
  if (schedule.repeatType === 'WEEKLY') return dayOfWeek(date) === dayOfWeek(schedule.startDate);
  if (schedule.repeatType === 'MONTHLY') return date.slice(8, 10) === schedule.startDate.slice(8, 10);
  return false;
}

function eventStyle(schedule: Schedule) {
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  return {
    top: `${(start / 60) * 54}px`,
    minHeight: `${Math.max(34, ((end - start) / 60) * 54 - 4)}px`,
  };
}

function calendarTitle(date: string, mode: CalendarMode) {
  if (mode === 'day') return formatDisplayDate(date);
  if (mode === 'week') return `${formatDisplayDate(startOfWeek(date))} - ${formatDisplayDate(shiftDate(startOfWeek(date), 6))}`;
  const [year, month] = date.split('-').map(Number);
  return `Tháng ${month}/${year}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

function sourceLabel(schedule: Schedule) {
  if (schedule.sourceType === 'RTSP') return 'RTSP/HLS';
  if (schedule.fileMode === 'SELECTED_FILES') return 'File đã chọn';
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

function addMinutes(time: string, minutes: number) {
  const total = Math.min(23 * 60 + 59, timeToMinutes(time) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

function startOfWeek(date: string) {
  return shiftDate(date, -dayOfWeek(date));
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatWeekday(date: string) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek(date)];
}

function formatDayNumber(date: string) {
  return String(Number(date.slice(8, 10)));
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN');
}
