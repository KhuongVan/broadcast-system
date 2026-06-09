import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatDateTime, formatStatus } from '../lib/format';
import type { Device, DeviceInput, Schedule } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

import { DeviceMapView } from './DeviceMapView';

export type DeviceSectionKey = 'map' | 'operate' | 'settings' | 'logs';

type DevicesViewProps = {
  activeSection: DeviceSectionKey;
  onChangeSection: (section: DeviceSectionKey) => void;
};

const emptyDevice: DeviceInput = {
  name: '',
  macAddress: '',
  area: '',
  connectionType: '4G',
  latitude: null,
  longitude: null,
};

export function DevicesView({ activeSection, onChangeSection }: DevicesViewProps) {
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

  const operationSchedules = useMemo(() => schedules, [schedules]);

  const filteredDevices = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return devices;
    return devices.filter((device) =>
      [device.name, device.macAddress, device.area, device.connectionType, device.networkType]
        .some((value) => String(value || '').toLowerCase().includes(keyword)),
    );
  }, [devices, search]);

  const stats = useMemo(() => {
    const online = devices.filter((device) => device.online).length;
    return {
      total: devices.length,
      online,
      offline: Math.max(devices.length - online, 0),
      playing: devices.filter((device) => device.playStatus === 'PLAYING').length,
    };
  }, [devices]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [deviceData, scheduleData] = await Promise.all([adminApi.listDevices(), adminApi.listSchedules()]);
      setDevices(deviceData.devices);
      setSchedules(scheduleData.schedules);
      setSelectedDeviceIds((current) => new Set([...current].filter((deviceId) => deviceData.devices.some((device) => device.deviceId === deviceId))));
      if (!selectedScheduleId) {
        setSelectedScheduleId(scheduleData.schedules[0]?.scheduleId || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được thiết bị.');
    } finally {
      setLoading(false);
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
      area: device.area,
      connectionType: device.connectionType,
      latitude: device.latitude,
      longitude: device.longitude,
    });
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
      setError(err instanceof Error ? err.message : 'Không lưu được thiết bị.');
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
      setError(err instanceof Error ? err.message : 'Không xóa được thiết bị.');
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
      setError(err instanceof Error ? err.message : 'Không thực hiện được thao tác thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function runBulk(action: (deviceId: string) => Promise<unknown>) {
    const ids = [...selectedDeviceIds];
    if (!ids.length) return;
    await runDeviceAction(() => Promise.all(ids.map((deviceId) => action(deviceId))));
  }

  async function stopScheduledPlayback(deviceId: string) {
    await adminApi.updateDevicePlayAllowed(deviceId, false);
    await adminApi.stopDevice(deviceId);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel title="Quản lý thiết bị" description="Vận hành, cấu hình và theo dõi trạng thái thiết bị phát thanh.">
      <DataState loading={loading} error={error} empty={!devices.length} emptyText="Chưa có thiết bị." />
      {!loading ? (
        <div className="device-page">
          {activeSection === 'map' ? (
            <DeviceMapView devices={filteredDevices} stats={stats} />
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
                      <button className="success" disabled={saving || !selectedDeviceIds.size} onClick={() => void runBulk((id) => adminApi.updateDevicePlayAllowed(id, true))} type="button">
                        Bật phát
                      </button>
                      <button className="danger" disabled={saving || !selectedDeviceIds.size} onClick={() => void runBulk(stopScheduledPlayback)} type="button">
                        Dừng
                      </button>
                    </div>
                    <strong className="selected-device-count">Đã chọn {selectedDeviceIds.size} thiết bị</strong>
                    <div className="device-operation-stats">
                      <span>Tổng thiết bị: <strong>{stats.total}</strong></span>
                      <span>Kết nối: <strong>{stats.online}</strong></span>
                      <span>Mất kết nối: <strong>{stats.offline}</strong></span>
                    </div>
                  </div>

                  <div className="device-operate-search">
                    <DeviceSearch value={search} onChange={setSearch} />
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th className="select-col">
                            <input
                              checked={filteredDevices.length > 0 && filteredDevices.every((device) => selectedDeviceIds.has(device.deviceId))}
                              onChange={(event) => toggleAll(event.target.checked)}
                              type="checkbox"
                            />
                          </th>
                          <th>Thông tin thiết bị</th>
                          <th>Trạng thái phát</th>
                          <th>Kết nối</th>
                          <th>Lịch đã tải</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDevices.map((device) => (
                          <tr key={device.deviceId}>
                            <td className="select-col">
                              <input checked={selectedDeviceIds.has(device.deviceId)} onChange={(event) => toggleDevice(device.deviceId, event.target.checked)} type="checkbox" />
                            </td>
                            <DeviceInfoCell device={device} />
                            <td>
                              <StatusBadge tone={getPlayStatusTone(device)}>{getPlayStatusLabel(device)}</StatusBadge>
                              {!device.playAllowed ? <div className="subtext">Đang chặn phát theo lịch</div> : null}
                              {device.playbackMessage ? <div className="subtext">{device.playbackMessage}</div> : null}
                            </td>
                            <td>
                              <StatusBadge tone={device.online ? 'ok' : 'danger'}>{device.online ? 'Kết nối' : 'Mất kết nối'}</StatusBadge>
                              <div className="subtext">{device.connectionType} · {device.networkType || '-'}</div>
                              {device.batteryLevel !== null ? <div className="subtext">Pin {device.batteryLevel}%</div> : null}
                            </td>
                            <td>
                              <strong>{device.activeSchedule?.name || '-'}</strong>
                              <div className="subtext">Sync: {getSyncStatusLabel(device.syncStatus)}</div>
                              {device.syncMessage ? <div className="subtext">{device.syncMessage}</div> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {activeSection === 'settings' ? (
            <>
              <div className="section-toolbar">
                <DeviceSearch value={search} onChange={setSearch} />
                <button className="primary" onClick={openCreateModal} type="button">
                  Thêm thiết bị
                </button>
              </div>
              <div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Thiết bị</th>
                        <th>Khu vực</th>
                        <th>Dạng kết nối</th>
                        <th>Cập nhật cuối</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDevices.map((device) => (
                        <tr key={device.deviceId}>
                          <DeviceInfoCell device={device} />
                          <td>{device.area || '-'}</td>
                          <td>{device.connectionType}</td>
                          <td>{formatDateTime(device.updatedAt)}</td>
                          <td>
                            <div className="row-actions">
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
                      Khu vực
                      <input value={form.area} onChange={(event) => update('area', event.target.value)} placeholder="Chưa phân khu" />
                    </label>
                    <label>
                      Kết nối
                      <select value={form.connectionType} onChange={(event) => update('connectionType', event.target.value as DeviceInput['connectionType'])}>
                        <option value="4G">4G</option>
                        <option value="LAN">LAN</option>
                      </select>
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
                  {devices.map((device) => (
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
                      <td>{device.syncMessage || device.playbackMessage || formatStatus(device.playAllowed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
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

function formatScheduleWindow(schedule: Schedule) {
  return `${schedule.startDate} · ${schedule.startTime.slice(0, 5)}-${schedule.endTime.slice(0, 5)}`;
}

function getScheduleSourceLabel(schedule: Schedule) {
  if (schedule.sourceType === 'RTSP') return 'RTSP/HLS';
  return schedule.fileMode === 'SINGLE_FILE' ? 'File' : 'Danh sách phát';
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

function DeviceInfoCell({ device }: { device: Device }) {
  return (
    <td>
      <strong>{device.name}</strong>
      <div className="subtext">{device.macAddress}</div>
      <div className="subtext">{device.area || 'Chưa phân khu'}</div>
      {device.appVersion ? <div className="subtext">App {device.appVersion}</div> : null}
    </td>
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
