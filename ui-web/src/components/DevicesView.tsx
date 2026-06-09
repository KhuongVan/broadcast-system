import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatDateTime, formatStatus } from '../lib/format';
import type { Device, DeviceInput, Schedule } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

export type DeviceSectionKey = 'operate' | 'settings' | 'logs';

type DevicesViewProps = {
  activeSection: DeviceSectionKey;
  onChangeSection: (section: DeviceSectionKey) => void;
};

const emptyDevice: DeviceInput = {
  name: '',
  macAddress: '',
  area: '',
  connectionType: '4G',
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

  const rtspSchedules = useMemo(() => schedules.filter((schedule) => schedule.sourceType === 'RTSP'), [schedules]);

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
        setSelectedScheduleId(scheduleData.schedules.find((schedule) => schedule.sourceType === 'RTSP')?.scheduleId || '');
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

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel title="Quản lý thiết bị" description="Vận hành, cấu hình và theo dõi trạng thái thiết bị phát thanh.">
      <DataState loading={loading} error={error} empty={!devices.length} emptyText="Chưa có thiết bị." />
      {!loading ? (
        <div className="device-page">
          {activeSection === 'operate' ? (
            <div className="device-operate">
              <div className="device-command-panel">
                <div>
                  <span className="section-kicker">Lịch RTSP/HLS</span>
                  <select value={selectedScheduleId} onChange={(event) => setSelectedScheduleId(event.target.value)}>
                    <option value="">Chọn lịch phát</option>
                    {rtspSchedules.map((schedule) => (
                      <option key={schedule.scheduleId} value={schedule.scheduleId}>
                        {schedule.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="device-actions">
                  <button className="primary" disabled={saving || !selectedDeviceIds.size || !selectedScheduleId} onClick={() => void runBulk((id) => adminApi.syncDeviceSchedule(id, selectedScheduleId))} type="button">
                    Tải lịch
                  </button>
                  <button className="success" disabled={saving || !selectedDeviceIds.size || !selectedScheduleId} onClick={() => void runBulk((id) => adminApi.playDeviceNow(id, selectedScheduleId))} type="button">
                    Phát
                  </button>
                  <button className="danger" disabled={saving || !selectedDeviceIds.size} onClick={() => void runBulk((id) => adminApi.stopDevice(id))} type="button">
                    Dừng
                  </button>
                </div>
              </div>

              <div className="device-stats-grid">
                <StatPill label="Tổng thiết bị" value={stats.total} />
                <StatPill label="Kết nối" value={stats.online} />
                <StatPill label="Mất kết nối" value={stats.offline} />
                <StatPill label="Đang phát" value={stats.playing} />
              </div>

              <DeviceSearch value={search} onChange={setSearch} />
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
                      <th>Thiết bị</th>
                      <th>Kết nối</th>
                      <th>Trạng thái phát</th>
                      <th>Lịch hiện tại</th>
                      <th>Thao tác</th>
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
                          <StatusBadge tone={device.online ? 'ok' : 'danger'}>{device.online ? 'Online' : 'Offline'}</StatusBadge>
                          <div className="subtext">{device.connectionType} · {device.networkType || '-'}</div>
                          {device.batteryLevel !== null ? <div className="subtext">Pin {device.batteryLevel}%</div> : null}
                        </td>
                        <td>
                          <StatusBadge tone={device.playStatus === 'ERROR' ? 'danger' : device.playStatus === 'PLAYING' ? 'ok' : 'neutral'}>
                            {device.playStatus}
                          </StatusBadge>
                          {device.playbackMessage ? <div className="subtext">{device.playbackMessage}</div> : null}
                        </td>
                        <td>
                          <strong>{device.currentSchedule?.name || device.activeSchedule?.name || '-'}</strong>
                          <div className="subtext">Sync: {device.syncStatus || '-'}</div>
                          {device.syncMessage ? <div className="subtext">{device.syncMessage}</div> : null}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="ghost" disabled={saving} onClick={() => edit(device)} type="button">
                              Cài đặt
                            </button>
                            <button className="ghost" disabled={saving} onClick={() => void runDeviceAction(() => adminApi.updateDevicePlayAllowed(device.deviceId, !device.playAllowed))} type="button">
                              {device.playAllowed ? 'Tắt phát' : 'Cho phát'}
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
