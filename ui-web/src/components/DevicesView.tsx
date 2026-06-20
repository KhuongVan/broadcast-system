import { ChangeEvent, FormEvent, useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { adminApi } from '../lib/api';
import { formatDateTime, formatStatus } from '../lib/format';
import type { Device, DeviceInput, DeviceRecordingSession, DeviceScheduleAssignment, Schedule } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Pagination, paginate, usePagination } from './Pagination';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';

import { DeviceMapView } from './DeviceMapView';

export type DeviceSectionKey = 'map' | 'operate' | 'settings' | 'logs';

type DevicesViewProps = {
  activeSection: DeviceSectionKey;
  onChangeSection: (section: DeviceSectionKey) => void;
  onStartEmergency: (deviceId: string) => void;
  onStartLive: (deviceId: string) => void;
};

const emptyDevice: DeviceInput = {
  name: '',
  macAddress: '',
  simNumber: '',
  receiverInstalledDate: null,
  simRegisteredDate: null,
  area: '',
  latitude: null,
  longitude: null,
};

export function DevicesView({ activeSection, onChangeSection, onStartEmergency, onStartLive }: DevicesViewProps) {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [form, setForm] = useState<DeviceInput>(emptyDevice);
  const [editingId, setEditingId] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [recordingDevice, setRecordingDevice] = useState<Device | null>(null);
  const [assignedScheduleDevice, setAssignedScheduleDevice] = useState<Device | null>(null);
  const [detailDevice, setDetailDevice] = useState<Device | null>(null);
  const [recordings, setRecordings] = useState<DeviceRecordingSession[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState('');

  const operationSchedules = useMemo(() => schedules, [schedules]);

  const filteredDevices = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return devices;
    return devices.filter((device) => getDeviceSearchValues(device).some((value) => normalizeSearchText(value).includes(keyword)));
  }, [devices, search]);
  const operationPagination = usePagination(filteredDevices.length);
  const settingsPagination = usePagination(filteredDevices.length);
  const logsPagination = usePagination(devices.length);
  const pagedOperationDevices = useMemo(
    () => paginate(filteredDevices, operationPagination.page, operationPagination.pageSize),
    [filteredDevices, operationPagination.page, operationPagination.pageSize],
  );
  const pagedSettingsDevices = useMemo(
    () => paginate(filteredDevices, settingsPagination.page, settingsPagination.pageSize),
    [filteredDevices, settingsPagination.page, settingsPagination.pageSize],
  );
  const pagedLogDevices = useMemo(
    () => paginate(devices, logsPagination.page, logsPagination.pageSize),
    [devices, logsPagination.page, logsPagination.pageSize],
  );

  const visibleStats = useMemo(() => {
    const online = filteredDevices.filter((device) => device.online).length;
    return {
      total: filteredDevices.length,
      online,
      offline: Math.max(filteredDevices.length - online, 0),
      playing: filteredDevices.filter((device) => device.playStatus === 'PLAYING').length,
    };
  }, [filteredDevices]);

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [deviceData, scheduleData] = await Promise.all([adminApi.listDevices(), adminApi.listSchedules()]);
      setDevices(deviceData.devices);
      setSchedules(scheduleData.schedules);
      setSelectedDeviceIds((current) => new Set([...current].filter((deviceId) => deviceData.devices.some((device) => device.deviceId === deviceId))));
      setSelectedScheduleId((current) => current || scheduleData.schedules[0]?.scheduleId || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được thiết bị.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function update<K extends keyof DeviceInput>(key: K, value: DeviceInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(device: Device) {
    onChangeSection('settings');
    setEditingId(device.deviceId);
    setModalOpen(true);
    setForm({
      name: device.name,
      macAddress: device.macAddress,
      simNumber: device.simNumber,
      receiverInstalledDate: device.receiverInstalledDate,
      simRegisteredDate: device.simRegisteredDate,
      area: device.area,
      latitude: device.latitude,
      longitude: device.longitude,
    });
  }

  function viewDeviceDetail(device: Device) {
    setDetailDevice(device);
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyDevice);
  }

  function openCreateModal() {
    resetForm();
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function toggleDevice(deviceId: string, selected: boolean) {
    setSelectedDeviceIds((current) => {
      const next = new Set(current);
      if (selected) next.add(deviceId);
      else next.delete(deviceId);
      return next;
    });
  }

  function toggleAll(selected: boolean) {
    setSelectedDeviceIds(selected ? new Set(filteredDevices.map((device) => device.deviceId)) : new Set());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) await adminApi.updateDevice(editingId, form);
      else await adminApi.createDevice(form);
      resetForm();
      setModalOpen(false);
      await load();
    } catch (err) {
      showError(err, 'Không lưu được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(deviceId: string) {
    if (!confirm('Xóa thiết bị này?')) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deleteDevice(deviceId);
      if (editingId === deviceId) resetForm();
      setSelectedDeviceIds((current) => {
        const next = new Set(current);
        next.delete(deviceId);
        return next;
      });
      await load();
    } catch (err) {
      showError(err, 'Không xóa được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function runDeviceAction(action: () => Promise<unknown>) {
    setSaving(true);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      showError(err, 'Không thực hiện được thao tác thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function runBulk(action: (deviceId: string) => Promise<unknown>) {
    const ids = [...selectedDeviceIds];
    if (!ids.length) return;
    await runDeviceAction(() => Promise.all(ids.map((deviceId) => action(deviceId))));
  }

  async function updateDeviceVolume(deviceId: string, volumeLevel: number) {
    setSaving(true);
    setError('');
    try {
      const { device } = await adminApi.updateDeviceVolume(deviceId, volumeLevel);
      setDevices((current) => current.map((item) => (item.deviceId === device.deviceId ? device : item)));
    } catch (err) {
      showError(err, 'Không cập nhật được âm lượng thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function playMapDevice(device: Device) {
    const scheduleId = device.currentSchedule?.scheduleId || device.activeSchedule?.scheduleId || '';
    if (!scheduleId) {
      showError('Thiết bị chưa có lịch để bật phát.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { device: updatedDevice } = await adminApi.playDeviceNow(device.deviceId, scheduleId);
      setDevices((current) => current.map((item) => (item.deviceId === updatedDevice.deviceId ? updatedDevice : item)));
    } catch (err) {
      showError(err, 'Không bật phát được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function stopMapDevice(deviceId: string) {
    setSaving(true);
    setError('');
    try {
      const { device } = await adminApi.stopDevice(deviceId);
      setDevices((current) => current.map((item) => (item.deviceId === device.deviceId ? device : item)));
    } catch (err) {
      showError(err, 'Không dừng phát được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function openRecordingModal(device: Device) {
    setRecordingDevice(device);
    setRecordings([]);
    setRecordingsError('');
    setRecordingsLoading(true);
    try {
      const data = await adminApi.listDeviceRecordings(device.deviceId);
      setRecordings(data.recordings.filter((recording) => recording.audioUrl));
    } catch (err) {
      const message = getErrorMessage(err, 'Không tải được file ghi âm.');
      setRecordingsError(message);
      showToast({ type: 'error', message });
    } finally {
      setRecordingsLoading(false);
    }
  }

  function openAssignedSchedulesModal(device: Device) {
    setAssignedScheduleDevice(device);
  }

  function closeAssignedSchedulesModal() {
    setAssignedScheduleDevice(null);
  }

  async function removeAssignedSchedule(device: Device, scheduleId: string) {
    if (!confirm('Gỡ lịch phát này khỏi thiết bị?')) return;
    setSaving(true);
    setError('');
    try {
      const { device: updatedDevice } = await adminApi.removeDeviceSchedule(device.deviceId, scheduleId);
      setDevices((current) => current.map((item) => (item.deviceId === updatedDevice.deviceId ? updatedDevice : item)));
      setAssignedScheduleDevice(updatedDevice);
      await load();
    } catch (err) {
      showError(err, 'Không gỡ được lịch khỏi thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  function closeRecordingModal() {
    setRecordingDevice(null);
    setRecordings([]);
    setRecordingsError('');
    setRecordingsLoading(false);
  }

  function exportDevicesCsv() {
    const rows = [
      [
        'Tên thiết bị',
        'MAC',
        'Số SIM',
        'Ngày lắp bộ thu',
        'Ngày đăng ký SIM',
        'Khu vực',
        'Thời gian',
        'Trạng thái kết nối',
        'Loại kết nối',
        'Network',
        'Trạng thái phát',
        'Lịch đã tải',
        'Đồng bộ',
      ],
      ...devices.map((device) => [
        device.name,
        device.macAddress,
        device.simNumber || '',
        device.receiverInstalledDate || '',
        device.simRegisteredDate || '',
        device.area,
        formatLastSeenTime(device.lastSeenAt),
        device.online ? 'Kết nối' : 'Mất kết nối',
        getDeviceConnectionLabel(device),
        device.networkType || '',
        getPlayStatusLabel(device),
        `${getDeviceScheduleAssignments(device).length} lịch`,
        getSyncStatusLabel(device.syncStatus),
      ]),
    ];
    downloadCsv('devices.csv', rows);
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setImportFile(null);
  }

  async function importDevices(event: FormEvent) {
    event.preventDefault();
    if (!importFile) {
      showError('Vui lòng chọn file thiết bị.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const rows = await readDeviceImportRows(importFile);
      const inputs = toDeviceInputsFromImportRows(rows);
      if (!inputs.length) throw new Error('File nhập không có thiết bị hợp lệ.');
      await Promise.all(inputs.map((input) => adminApi.createDevice(input)));
      await load();
      closeImportModal();
      showToast({ type: 'success', message: `Đã nhập ${inputs.length} thiết bị.` });
    } catch (err) {
      showError(err, 'Không nhập được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  function showError(error: unknown, fallback = 'Có lỗi xảy ra.') {
    const message = getErrorMessage(error, fallback);
    setError(message);
    showToast({ type: 'error', message });
  }

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      void load(false);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    operationPagination.setPage(1);
    settingsPagination.setPage(1);
  }, [operationPagination.setPage, search, settingsPagination.setPage]);

  return (
    <Panel title="Quản lý thiết bị" description="Vận hành, cấu hình và theo dõi trạng thái thiết bị phát thanh.">
      <DataState loading={loading} error={error} empty={!devices.length} emptyText="Chưa có thiết bị." />
      {!loading ? (
        <div className="device-page">
          {activeSection === 'map' ? (
            <DeviceMapView
              devices={filteredDevices}
              saving={saving}
              stats={visibleStats}
              search={search}
              onSearchChange={setSearch}
              onPlayDevice={(device) => void playMapDevice(device)}
              onStartEmergency={onStartEmergency}
              onStartLive={onStartLive}
              onStopDevice={(deviceId) => void stopMapDevice(deviceId)}
              onVolumeChange={(deviceId, volumeLevel) => void updateDeviceVolume(deviceId, volumeLevel)}
            />
          ) : null}

          {activeSection === 'operate' ? (
            <div className="device-operate">
              <div className="device-operate-layout">
                <aside className="schedule-list-panel">
                  <h3>Danh sách lịch phát</h3>
                  <div className="schedule-list">
                    {operationSchedules.length ? operationSchedules.map((schedule) => (
                      <button
                        className={selectedScheduleId === schedule.scheduleId ? 'schedule-list-item active' : 'schedule-list-item'}
                        key={schedule.scheduleId}
                        onClick={() => setSelectedScheduleId(schedule.scheduleId)}
                        type="button"
                      >
                        <input checked={selectedScheduleId === schedule.scheduleId} readOnly type="radio" />
                        <span>
                          <strong>{schedule.name}</strong>
                          <small>{formatScheduleWindow(schedule)}</small>
                        </span>
                        <em>{getScheduleSourceLabel(schedule)}</em>
                      </button>
                    )) : (
                      <div className="state compact">Chưa có lịch phát.</div>
                    )}
                  </div>
                </aside>

                <section className="device-operation-board">
                  <div className="device-operation-toolbar">
                    <div className="device-actions">
                      <button className="primary" disabled={saving || !selectedDeviceIds.size || !selectedScheduleId} onClick={() => void runBulk((id) => adminApi.syncDeviceSchedule(id, selectedScheduleId))} type="button">
                        Tải lịch
                      </button>
                      <button className="success" disabled={saving || !selectedDeviceIds.size || !selectedScheduleId} onClick={() => void runBulk((id) => adminApi.playDeviceNow(id, selectedScheduleId))} type="button">
                        Bật phát
                      </button>
                      <button className="danger" disabled={saving || !selectedDeviceIds.size} onClick={() => void runBulk((id) => adminApi.stopDevice(id))} type="button">
                        Dừng
                      </button>
                    </div>
                    <strong className="selected-device-count">Đã chọn {selectedDeviceIds.size} thiết bị</strong>
                    <div className="device-operation-stats">
                      <span>Tổng thiết bị: <strong>{visibleStats.total}</strong></span>
                      <span>Kết nối: <strong>{visibleStats.online}</strong></span>
                      <span>Mất kết nối: <strong>{visibleStats.offline}</strong></span>
                    </div>
                  </div>

                  <div className="device-operate-search">
                    <DeviceSearch value={search} onChange={setSearch} />
                  </div>

                  <div className="table-wrap">
                    <table className="device-operation-table">
                      <thead>
                        <tr>
                          <th className="select-col">
                            <input
                              checked={filteredDevices.length > 0 && filteredDevices.every((device) => selectedDeviceIds.has(device.deviceId))}
                              onChange={(event) => toggleAll(event.target.checked)}
                              type="checkbox"
                            />
                          </th>
                          <th>Tên thiết bị</th>
                          <th>Thời gian</th>
                          <th>Trạng thái phát</th>
                          <th>Âm lượng</th>
                          <th>Kết nối</th>
                          <th>Loại kết nối</th>
                          <th>File ghi âm</th>
                          <th>Lịch đã tải</th>
                          <th>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedOperationDevices.map((device) => (
                          <tr key={device.deviceId}>
                            <td className="select-col">
                              <input checked={selectedDeviceIds.has(device.deviceId)} onChange={(event) => toggleDevice(device.deviceId, event.target.checked)} type="checkbox" />
                            </td>
                            <DeviceNameCell device={device} />
                            <td>{formatLastSeenTime(device.lastSeenAt)}</td>
                            <td>
                              <StatusBadge tone={getPlayStatusTone(device)}>{getPlayStatusLabel(device)}</StatusBadge>
                              {!device.playAllowed ? <div className="subtext">Đang chặn phát theo lịch</div> : null}
                              {device.playbackMessage ? <div className="subtext">{formatDeviceMessage(device.playbackMessage)}</div> : null}
                            </td>
                            <td>
                              <VolumeControl device={device} disabled={saving} onChange={(volumeLevel) => void updateDeviceVolume(device.deviceId, volumeLevel)} />
                            </td>
                            <td>
                              <StatusBadge tone={device.online ? 'ok' : 'danger'}>{device.online ? 'Kết nối' : 'Mất kết nối'}</StatusBadge>
                              {device.batteryLevel !== null ? <div className="subtext">Pin {device.batteryLevel}%</div> : null}
                            </td>
                            <td>
                              <strong>{getDeviceConnectionLabel(device)}</strong>
                              {getDeviceConnectionDetail(device) ? <div className="subtext">{getDeviceConnectionDetail(device)}</div> : null}
                            </td>
                            <td>
                              <button className="ghost compact" onClick={() => void openRecordingModal(device)} type="button">
                                Danh sách
                              </button>
                            </td>
                            <td>
                              <button className="ghost compact" onClick={() => openAssignedSchedulesModal(device)} type="button">
                                {getDeviceScheduleAssignments(device).length} lịch
                              </button>
                              <div className="subtext">Sync: {getSyncStatusLabel(device.syncStatus)}</div>
                            </td>
                            <td>
                              <button className="ghost compact" onClick={() => viewDeviceDetail(device)} type="button">
                                Xem chi tiết
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination page={operationPagination.page} pageSize={operationPagination.pageSize} totalItems={filteredDevices.length} onPageChange={operationPagination.setPage} />
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {activeSection === 'settings' ? (
            <>
              <div className="section-toolbar">
                <DeviceSearch value={search} onChange={setSearch} />
                <div className="section-toolbar-actions">
                  <button className="primary" onClick={openCreateModal} type="button">
                    Thêm mới
                  </button>
                  <button className="primary" disabled={saving} onClick={() => setImportModalOpen(true)} type="button">
                    Nhập thiết bị
                  </button>
                  <button className="primary" disabled={!devices.length} onClick={exportDevicesCsv} type="button">
                    Xuất thiết bị
                  </button>
                </div>
              </div>
              <div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên thiết bị</th>
                        <th>Khu vực</th>
                        <th>Dạng kết nối</th>
                        <th>Cập nhật cuối</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSettingsDevices.map((device) => (
                        <tr key={device.deviceId}>
                          <DeviceNameCell device={device} />
                          <td>{device.area || '-'}</td>
                          <td>{getDeviceConnectionLabel(device)}</td>
                          <td>{formatDateTime(device.updatedAt)}</td>
                          <td>
                            <div className="row-actions">
                              <button className="ghost" onClick={() => viewDeviceDetail(device)} type="button">
                                Xem chi tiết
                              </button>
                              <button className="ghost" disabled={saving} onClick={() => edit(device)} type="button">
                                Sửa
                              </button>
                              <button className="danger" disabled={saving} onClick={() => remove(device.deviceId)} type="button">
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination page={settingsPagination.page} pageSize={settingsPagination.pageSize} totalItems={filteredDevices.length} onPageChange={settingsPagination.setPage} />
                </div>
              </div>
              {modalOpen ? (
                <Modal title={editingId ? 'Sửa thiết bị' : 'Thêm thiết bị'} onClose={closeModal}>
                  <form className="form-panel" onSubmit={save}>
                    <label>
                      Tên thiết bị
                      <input value={form.name} onChange={(event) => update('name', event.target.value)} required />
                    </label>
                    <label>
                      MAC address
                      <input value={form.macAddress} onChange={(event) => update('macAddress', event.target.value)} required />
                    </label>
                    <label>
                      Số SIM
                      <input value={form.simNumber || ''} onChange={(event) => update('simNumber', event.target.value || null)} placeholder="VD: 0987654321" />
                    </label>
                    <label>
                      Ngày lắp bộ thu
                      <input type="date" value={form.receiverInstalledDate || ''} onChange={(event) => update('receiverInstalledDate', event.target.value || null)} />
                    </label>
                    <label>
                      Ngày đăng ký SIM
                      <input type="date" value={form.simRegisteredDate || ''} onChange={(event) => update('simRegisteredDate', event.target.value || null)} />
                    </label>
                    <label>
                      Khu vực
                      <input value={form.area} onChange={(event) => update('area', event.target.value)} placeholder="Chưa phân khu" />
                    </label>
                    <label>
                      Vĩ độ (Latitude)
                      <input type="number" step="any" value={form.latitude ?? ''} onChange={(event) => update('latitude', event.target.value ? Number(event.target.value) : null)} placeholder="VD: 10.762622" />
                    </label>
                    <label>
                      Kinh độ (Longitude)
                      <input type="number" step="any" value={form.longitude ?? ''} onChange={(event) => update('longitude', event.target.value ? Number(event.target.value) : null)} placeholder="VD: 106.660172" />
                    </label>
                    <div className="row-actions">
                      <button className="primary" disabled={saving || !form.name.trim() || !form.macAddress.trim()}>
                        {editingId ? 'Lưu thiết bị' : 'Thêm thiết bị'}
                      </button>
                      <button className="ghost" onClick={closeModal} type="button">
                        Hủy
                      </button>
                    </div>
                  </form>
                </Modal>
              ) : null}
              {importModalOpen ? (
                <Modal title="NHẬP FILE DEVICE" onClose={closeImportModal}>
                  <form className="device-import-form" onSubmit={importDevices}>
                    <label>
                      Chọn file
                      <input accept=".csv,.xlsx,.xls" onChange={(event: ChangeEvent<HTMLInputElement>) => setImportFile(event.target.files?.[0] || null)} type="file" />
                    </label>
                    <div className="modal-footer">
                      <button className="primary" disabled={saving || !importFile} type="submit">
                        OK
                      </button>
                      <button className="danger" disabled={saving} onClick={closeImportModal} type="button">
                        Hủy bỏ
                      </button>
                    </div>
                  </form>
                </Modal>
              ) : null}
            </>
          ) : null}

          {activeSection === 'logs' ? (
            <div className="table-wrap padded-table">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Thiết bị</th>
                    <th>Trạng thái</th>
                    <th>Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLogDevices.map((device) => (
                    <tr key={device.deviceId}>
                      <td>{formatDateTime(device.playbackUpdatedAt || device.lastSyncedAt || device.lastSeenAt || device.updatedAt)}</td>
                      <td>
                        <strong>{device.name}</strong>
                        <div className="subtext">{device.macAddress}</div>
                      </td>
                      <td>
                        <StatusBadge tone={device.syncStatus === 'FAILED' || device.playStatus === 'ERROR' ? 'danger' : device.online ? 'ok' : 'warn'}>
                          {device.syncStatus || device.playStatus}
                        </StatusBadge>
                      </td>
                      <td>{formatDeviceMessage(device.syncMessage || device.playbackMessage || formatStatus(device.playAllowed))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={logsPagination.page} pageSize={logsPagination.pageSize} totalItems={devices.length} onPageChange={logsPagination.setPage} />
            </div>
          ) : null}
        </div>
      ) : null}
      {recordingDevice ? (
        <Modal title={`Danh sách file ghi âm trên thiết bị: ${recordingDevice.name}`} onClose={closeRecordingModal}>
          <RecordingFilesTable recordings={recordings} loading={recordingsLoading} error={recordingsError} />
        </Modal>
      ) : null}
      {assignedScheduleDevice ? (
        <Modal title={`Lịch đã tải trên thiết bị: ${assignedScheduleDevice.name}`} onClose={closeAssignedSchedulesModal}>
          <AssignedSchedulesTable
            assignments={getDeviceScheduleAssignments(assignedScheduleDevice)}
            saving={saving}
            onRemove={(scheduleId) => void removeAssignedSchedule(assignedScheduleDevice, scheduleId)}
          />
        </Modal>
      ) : null}
      {detailDevice ? (
        <Modal title={`Chi tiết thiết bị: ${detailDevice.name}`} onClose={() => setDetailDevice(null)}>
          <DeviceDetailPanel device={detailDevice} />
        </Modal>
      ) : null}
    </Panel>
  );
}

function DeviceSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="toolbar-row">
      <input placeholder="Tìm theo tên, MAC, khu vực, kết nối..." value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RecordingFilesTable({ recordings, loading, error }: { recordings: DeviceRecordingSession[]; loading: boolean; error: string }) {
  const [playingId, setPlayingId] = useState('');

  if (loading) return <div className="state compact">Đang tải file ghi âm...</div>;
  if (error) return <div className="state error compact">{error}</div>;
  if (!recordings.length) return <div className="state compact">Chưa có file ghi âm.</div>;

  return (
    <div className="table-wrap recording-files-table">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Tên file</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((recording, index) => {
            const fileName = getRecordingFileName(recording);
            const audioUrl = recording.audioUrl || '';
            return (
              <tr key={recording.recordingId}>
                <td>{index + 1}</td>
                <td>
                  <strong>{fileName}</strong>
                  {recording.uploadedAt ? <div className="subtext">{formatDateTime(recording.uploadedAt)}</div> : null}
                </td>
                <td>
                  <div className="recording-file-actions">
                    <button className="ghost icon-btn" disabled={!audioUrl} onClick={() => setPlayingId((current) => (current === recording.recordingId ? '' : recording.recordingId))} title="Nghe file" type="button">
                      ▶
                    </button>
                    <a className="ghost icon-btn download-link" download={fileName} href={audioUrl} title="Tải file">
                      ⇩
                    </a>
                  </div>
                  {playingId === recording.recordingId && audioUrl ? (
                    <audio className="recording-audio" controls autoPlay src={audioUrl}>
                      Trình duyệt không hỗ trợ nghe file ghi âm.
                    </audio>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignedSchedulesTable({
  assignments,
  saving,
  onRemove,
}: {
  assignments: DeviceScheduleAssignment[];
  saving: boolean;
  onRemove: (scheduleId: string) => void;
}) {
  if (!assignments.length) return <div className="state compact">Thiết bị chưa có lịch phát nào.</div>;

  return (
    <div className="table-wrap assigned-schedules-table">
      <table>
        <thead>
          <tr>
            <th>Tên lịch</th>
            <th>Thời gian</th>
            <th>Lặp</th>
            <th>Nguồn</th>
            <th>Đồng bộ</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.assignmentId}>
              <td>
                <strong>{assignment.schedule.name}</strong>
              </td>
              <td>{formatScheduleWindow(assignment.schedule)}</td>
              <td>
                {repeatLabel(assignment.schedule.repeatType)}
                {assignment.schedule.sourceType === 'FILE' && assignment.schedule.repeatCount > 0 ? (
                  <div className="subtext">Phát lại {assignment.schedule.repeatCount} lần</div>
                ) : null}
              </td>
              <td>{getScheduleSourceLabel(assignment.schedule)}</td>
              <td>
                <StatusBadge tone={assignment.syncStatus === 'FAILED' ? 'danger' : assignment.syncStatus === 'SYNCED' ? 'ok' : 'warn'}>
                  {getSyncStatusLabel(assignment.syncStatus)}
                </StatusBadge>
                {assignment.lastSyncedAt ? <div className="subtext">{formatDateTime(assignment.lastSyncedAt)}</div> : null}
                {assignment.syncMessage ? <div className="subtext">{formatDeviceMessage(assignment.syncMessage)}</div> : null}
              </td>
              <td>
                <button className="danger" disabled={saving} onClick={() => onRemove(assignment.scheduleId)} type="button">
                  Gỡ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getDeviceSearchValues(device: Device) {
  return [
    device.name,
    device.macAddress,
    device.simNumber,
    device.receiverInstalledDate,
    device.simRegisteredDate,
    device.area,
    device.connectionType,
    getConnectionTypeLabel(device.connectionType),
    getDeviceConnectionLabel(device),
    device.networkType,
    device.online ? 'Kết nối Đã kết nối' : 'Mất kết nối',
    getPlayStatusLabel(device),
    ...getDeviceScheduleAssignments(device).map((assignment) => assignment.schedule.name),
    device.currentSchedule?.name,
  ];
}

function getDeviceScheduleAssignments(device: Device) {
  return device.scheduleAssignments || [];
}

function getRecordingFileName(recording: DeviceRecordingSession) {
  if (recording.fileName) return recording.fileName;
  const value = recording.uploadedAt || recording.createdAt;
  if (!value) return `${recording.recordingId}.webm`;
  return `${formatLastSeenTime(value).replace(/\//g, '-').replace(' ', '-')}-${recording.recordingId.slice(0, 8)}.webm`;
}

function normalizeSearchText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

const deviceMessageLabels: Record<string, string> = {
  'Admin da yeu cau dung ghi am truoc khi lenh bat dau duoc xu ly.': 'Admin đã yêu cầu dừng ghi âm trước khi lệnh bắt đầu được xử lý.',
  'Android da dong bo lich.': 'Android đã đồng bộ lịch.',
  'Android dong bo that bai.': 'Android đồng bộ thất bại.',
  'Da co lenh am luong moi hon.': 'Đã có lệnh âm lượng mới hơn.',
  'Da gan lich cho thiet bi.': 'Đã gán lịch cho thiết bị.',
  'Dang cho thiet bi bat dau ghi am.': 'Đang chờ thiết bị bắt đầu ghi âm.',
  'Dang cho thiet bi nhan lenh am luong.': 'Đang chờ thiết bị nhận lệnh âm lượng.',
  'Dang yeu cau thiet bi dung ghi am.': 'Đang yêu cầu thiết bị dừng ghi âm.',
  'Thiet bi ap dung am luong that bai.': 'Thiết bị áp dụng âm lượng thất bại.',
  'Thiet bi da ap dung am luong.': 'Thiết bị đã áp dụng âm lượng.',
  'Thiet bi dang mat ket noi.': 'Thiết bị đang mất kết nối.',
};

function formatDeviceMessage(message: string) {
  return deviceMessageLabels[message.trim()] || message;
}

function downloadCsv(fileName: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeCsvCell(value: string) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

async function readDeviceImportRows(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
      header: 1,
      blankrows: false,
      defval: '',
    });
  }

  return parseCsv(await file.text());
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function toDeviceInputsFromImportRows(rows: unknown[][]) {
  const firstRow = rows[0] || [];
  const header = firstRow.map(normalizeCsvHeader);
  const hasHeader = header.some((value) => isNameHeader(value) || isMacHeader(value));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (hasHeader && (!header.some(isNameHeader) || !header.some(isMacHeader))) {
    throw new Error('File nhập không đúng cấu trúc: thiếu cột Tên thiết bị hoặc MAC.');
  }

  return dataRows.reduce<DeviceInput[]>((inputs, row, index) => {
    if (isImportRowEmpty(row)) return inputs;
    const lineNumber = index + (hasHeader ? 2 : 1);
    inputs.push(toDeviceInputFromImportRow(row, header, hasHeader, lineNumber));
    return inputs;
  }, []);
}

function toDeviceInputFromImportRow(row: unknown[], header: string[], hasHeader: boolean, lineNumber: number): DeviceInput {
  const cellByHeader = (names: string[]) => {
    if (!hasHeader) return undefined;
    const columnIndex = header.findIndex((value) => names.includes(value));
    return columnIndex >= 0 ? row[columnIndex] : undefined;
  };
  const valueByHeader = (names: string[]) => normalizeImportCell(cellByHeader(names));

  const name = valueByHeader(nameHeaders) || normalizeImportCell(row[0]);
  const macAddress = valueByHeader(macHeaders) || normalizeImportCell(row[1]);
  const simNumber = valueByHeader(simNumberHeaders) || normalizeImportCell(row[2]);
  const noHeaderHasDateColumns = !hasHeader && row.length >= 6;
  const receiverInstalledDate = normalizeImportDate(
    cellByHeader(receiverInstalledDateHeaders) ?? (noHeaderHasDateColumns ? row[3] : undefined),
    lineNumber,
    'Ngày lắp bộ thu',
  );
  const simRegisteredDate = normalizeImportDate(
    cellByHeader(simRegisteredDateHeaders) ?? (noHeaderHasDateColumns ? row[4] : undefined),
    lineNumber,
    'Ngày đăng ký SIM',
  );
  const area = valueByHeader(['area', 'khuvuc']) || normalizeImportCell(row[noHeaderHasDateColumns ? 5 : 3]);

  if (!name || !macAddress) {
    throw new Error(`File nhập không đúng cấu trúc: dòng ${lineNumber} thiếu Tên thiết bị hoặc MAC.`);
  }

  return {
    name,
    macAddress,
    simNumber: simNumber || null,
    receiverInstalledDate,
    simRegisteredDate,
    area,
    latitude: null,
    longitude: null,
  };
}

const nameHeaders = ['name', 'devicename', 'tenthietbi'];
const macHeaders = ['mac', 'macaddress', 'diachimac'];
const simNumberHeaders = ['sim', 'sosim', 'simnumber', 'sodienthoai', 'sdt', 'sodt', 'phone', 'phonenumber'];
const receiverInstalledDateHeaders = ['ngaylapbothu', 'receiverinstalleddate', 'receiverinstallationdate', 'installeddate'];
const simRegisteredDateHeaders = ['ngaydangkysim', 'simregistereddate', 'simregistrationdate'];

function isNameHeader(value: string) {
  return nameHeaders.includes(value);
}

function isMacHeader(value: string) {
  return macHeaders.includes(value);
}

function isImportRowEmpty(row: unknown[]) {
  return !row.some((value) => normalizeImportCell(value));
}

function normalizeImportCell(value: unknown) {
  if (value instanceof Date) return formatIsoDate(value);
  return String(value ?? '').trim();
}

function normalizeImportDate(value: unknown, lineNumber: number, label: string) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`File nhập không đúng cấu trúc: dòng ${lineNumber} ${label} không hợp lệ.`);
    }
    return formatIsoDate(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`File nhập không đúng cấu trúc: dòng ${lineNumber} ${label} không hợp lệ.`);
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const text = normalizeImportCell(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && isValidIsoDate(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const date = `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
    if (isValidIsoDate(date)) return date;
  }

  throw new Error(`File nhập không đúng cấu trúc: dòng ${lineNumber} ${label} phải là YYYY-MM-DD hoặc DD/MM/YYYY.`);
}

function formatIsoDate(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isValidIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeCsvHeader(value: unknown) {
  return normalizeImportCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function formatScheduleWindow(schedule: Schedule) {
  return `${schedule.startDate} · ${schedule.startTime.slice(0, 5)}-${schedule.endTime.slice(0, 5)}`;
}

function getScheduleSourceLabel(schedule: Schedule) {
  if (schedule.sourceType === 'RTSP') return 'RTSP/HLS';
  return schedule.fileMode === 'SINGLE_FILE' ? 'File' : 'Danh sách phát';
}

function repeatLabel(value: Schedule['repeatType']) {
  return {
    ONCE: 'Một lần',
    DAILY: 'Hằng ngày',
    WEEKLY: 'Hằng tuần',
    MONTHLY: 'Hằng tháng',
  }[value];
}

function getPlayStatusLabel(device: Device) {
  if (!device.playAllowed) return 'Đang dừng';
  if (device.playStatus === 'PLAYING') return 'Đang phát';
  if (device.playStatus === 'ERROR') return 'Báo lỗi';
  return 'Sẵn sàng';
}

function getPlayStatusTone(device: Device) {
  if (!device.playAllowed) return 'warn';
  if (device.playStatus === 'PLAYING') return 'ok';
  if (device.playStatus === 'ERROR') return 'danger';
  return 'neutral';
}

function getSyncStatusLabel(status: Device['syncStatus']) {
  if (status === 'SYNCED') return 'Đã tải';
  if (status === 'FAILED') return 'Thất bại';
  if (status === 'PENDING') return 'Đang chờ';
  return '-';
}

function getConnectionTypeLabel(connectionType: Device['connectionType']) {
  if (connectionType === 'LAN') return 'LAN';
  if (connectionType === '4G') return '4G';
  return 'Chưa xác định';
}

function getDeviceConnectionLabel(device: Device) {
  if (device.connectionType !== 'UNKNOWN') return getConnectionTypeLabel(device.connectionType);
  return device.networkType?.trim() || getConnectionTypeLabel(device.connectionType);
}

function getDeviceConnectionDetail(device: Device) {
  const networkType = device.networkType?.trim();
  if (!networkType || networkType === getDeviceConnectionLabel(device)) return '';
  return networkType;
}

function formatLastSeenTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateOnly(value: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

const volumeLevels = Array.from({ length: 16 }, (_, index) => index);

function VolumeControl({ device, disabled, onChange }: { device: Device; disabled: boolean; onChange: (volumeLevel: number) => void }) {
  const displayVolume = device.desiredVolumeLevel ?? device.volumeLevel ?? 0;
  const actualText = device.volumeLevel !== null ? `Thực tế: ${device.volumeLevel}` : 'Chưa có xác nhận';

  return (
    <div className="volume-control">
      <select
        aria-label={`Âm lượng ${device.name}`}
        disabled={disabled}
        value={displayVolume}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {volumeLevels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <StatusBadge tone={getVolumeSyncTone(device.volumeSyncStatus)}>{getVolumeSyncLabel(device.volumeSyncStatus)}</StatusBadge>
      <div className="subtext">{formatDeviceMessage(device.volumeSyncMessage || actualText)}</div>
    </div>
  );
}

function getVolumeSyncLabel(status: Device['volumeSyncStatus']) {
  if (status === 'SYNCED') return 'Đã áp dụng';
  if (status === 'FAILED') return 'Thất bại';
  if (status === 'PENDING') return 'Đang chờ';
  return 'Chưa đặt';
}

function getVolumeSyncTone(status: Device['volumeSyncStatus']) {
  if (status === 'SYNCED') return 'ok';
  if (status === 'FAILED') return 'danger';
  if (status === 'PENDING') return 'warn';
  return 'neutral';
}

function DeviceInfoCell({ device }: { device: Device }) {
  return (
    <td>
      <strong>{device.name}</strong>
      <div className="subtext">{device.macAddress}</div>
      {device.simNumber ? <div className="subtext">SIM {device.simNumber}</div> : null}
      <div className="subtext">{device.area || 'Chưa phân khu'}</div>
      {device.appVersion ? <div className="subtext">App {device.appVersion}</div> : null}
    </td>
  );
}

function DeviceNameCell({ device }: { device: Device }) {
  return (
    <td>
      <strong className="device-name-cell">{device.name}</strong>
    </td>
  );
}

function DeviceDetailPanel({ device }: { device: Device }) {
  const assignments = getDeviceScheduleAssignments(device);
  const coordinates = device.latitude !== null && device.longitude !== null ? `${device.latitude}, ${device.longitude}` : 'Chưa có';

  return (
    <div className="device-detail-panel">
      <div className="device-detail-summary">
        <div>
          <p className="section-kicker">Thiết bị</p>
          <h3>{device.name}</h3>
          <p>{device.macAddress}</p>
        </div>
        <div className="device-detail-badges">
          <StatusBadge tone={device.online ? 'ok' : 'danger'}>{device.online ? 'Kết nối' : 'Mất kết nối'}</StatusBadge>
          <StatusBadge tone={getPlayStatusTone(device)}>{getPlayStatusLabel(device)}</StatusBadge>
        </div>
      </div>

      <div className="device-detail-grid">
        <DetailItem label="MAC" value={device.macAddress} />
        <DetailItem label="Số SIM" value={device.simNumber || '-'} />
        <DetailItem label="Ngày lắp bộ thu" value={formatDateOnly(device.receiverInstalledDate)} />
        <DetailItem label="Ngày đăng ký SIM" value={formatDateOnly(device.simRegisteredDate)} />
        <DetailItem label="Android ID" value={device.androidId || '-'} />
        <DetailItem label="Khu vực" value={device.area || 'Chưa phân khu'} />
        <DetailItem label="Dạng kết nối" value={getDeviceConnectionLabel(device)} />
        <DetailItem label="Network" value={device.networkType || '-'} />
        <DetailItem label="Pin" value={device.batteryLevel !== null ? `${device.batteryLevel}%` : '-'} />
        <DetailItem label="Phiên bản app" value={device.appVersion || '-'} />
        <DetailItem label="Tọa độ" value={coordinates} />
        <DetailItem label="Cập nhật cuối" value={formatDateTime(device.updatedAt)} />
        <DetailItem label="Lần online cuối" value={formatLastSeenTime(device.lastSeenAt)} />
        <DetailItem label="Cho phép phát" value={formatStatus(device.playAllowed)} />
        <DetailItem label="Lịch hiện tại" value={device.currentSchedule?.name || device.activeSchedule?.name || '-'} />
        <DetailItem label="Lịch đã tải" value={`${assignments.length} lịch`} />
        <DetailItem label="Đồng bộ lịch" value={getSyncStatusLabel(device.syncStatus)} />
        <DetailItem label="Lần đồng bộ cuối" value={formatDateTime(device.lastSyncedAt)} />
        <DetailItem label="Âm lượng thực tế" value={device.volumeLevel !== null ? String(device.volumeLevel) : '-'} />
        <DetailItem label="Âm lượng mong muốn" value={device.desiredVolumeLevel !== null ? String(device.desiredVolumeLevel) : '-'} />
        <DetailItem label="Đồng bộ âm lượng" value={getVolumeSyncLabel(device.volumeSyncStatus)} />
        <DetailItem label="Cập nhật âm lượng" value={formatDateTime(device.volumeUpdatedAt)} />
        <DetailItem label="Trạng thái phát" value={getPlayStatusLabel(device)} />
        <DetailItem label="Vị trí phát" value={device.playbackPositionSeconds !== null ? `${device.playbackPositionSeconds}s` : '-'} />
        <DetailItem label="Cập nhật phát" value={formatDateTime(device.playbackUpdatedAt)} />
        <DetailItem label="Ngày tạo" value={formatDateTime(device.createdAt)} />
      </div>

      {device.syncMessage || device.volumeSyncMessage || device.playbackMessage ? (
        <div className="device-detail-notes">
          {device.syncMessage ? <DetailItem label="Thông báo đồng bộ" value={formatDeviceMessage(device.syncMessage)} /> : null}
          {device.volumeSyncMessage ? <DetailItem label="Thông báo âm lượng" value={formatDeviceMessage(device.volumeSyncMessage)} /> : null}
          {device.playbackMessage ? <DetailItem label="Thông báo phát" value={formatDeviceMessage(device.playbackMessage)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
