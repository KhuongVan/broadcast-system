import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatDateTime, formatStatus } from '../lib/format';
import type { Device, DeviceInput, Schedule } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

const emptyDevice: DeviceInput = {
  name: '',
  macAddress: '',
  area: '',
  connectionType: '4G',
};

export function DevicesView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [form, setForm] = useState<DeviceInput>(emptyDevice);
  const [editingId, setEditingId] = useState('');
  const [selectedScheduleByDevice, setSelectedScheduleByDevice] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rtspSchedules = useMemo(() => schedules.filter((schedule) => schedule.sourceType === 'RTSP'), [schedules]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [deviceData, scheduleData] = await Promise.all([adminApi.listDevices(), adminApi.listSchedules()]);
      setDevices(deviceData.devices);
      setSchedules(scheduleData.schedules);
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
    setEditingId(device.deviceId);
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

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await adminApi.updateDevice(editingId, form);
      } else {
        await adminApi.createDevice(form);
      }
      resetForm();
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được thiết bị.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePlayAllowed(device: Device) {
    await runDeviceAction(() => adminApi.updateDevicePlayAllowed(device.deviceId, !device.playAllowed));
  }

  async function stop(deviceId: string) {
    await runDeviceAction(() => adminApi.stopDevice(deviceId));
  }

  async function playNow(deviceId: string) {
    const scheduleId = getSelectedScheduleId(devices.find((device) => device.deviceId === deviceId));
    if (!scheduleId) return;
    await runDeviceAction(() => adminApi.playDeviceNow(deviceId, scheduleId));
  }

  async function syncSchedule(deviceId: string) {
    const scheduleId = getSelectedScheduleId(devices.find((device) => device.deviceId === deviceId));
    if (!scheduleId) return;
    await runDeviceAction(() => adminApi.syncDeviceSchedule(deviceId, scheduleId));
  }

  function getSelectedScheduleId(device?: Device) {
    if (!device) return '';
    return selectedScheduleByDevice[device.deviceId] || device.currentSchedule?.scheduleId || '';
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

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel title="Thiết bị" description="Theo dõi trạng thái, CRUD thiết bị và điều khiển lịch RTSP xuống Android client.">
      <DataState loading={loading} error={error} empty={!devices.length} emptyText="Chưa có thiết bị." />
      {!loading ? (
        <div className="split-layout">
          <form className="detail-panel form-panel" onSubmit={save}>
            <h3>{editingId ? 'Sửa thiết bị' : 'Thêm thiết bị'}</h3>
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
              {editingId ? (
                <button className="ghost" onClick={resetForm} type="button">
                  Hủy sửa
                </button>
              ) : null}
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thiết bị</th>
                  <th>Khu vực</th>
                  <th>Kết nối</th>
                  <th>Phát</th>
                  <th>Lịch RTSP</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.deviceId}>
                    <td>
                      <strong>{device.name}</strong>
                      <div className="subtext">{device.macAddress}</div>
                      <div className="subtext">Lần cuối: {formatDateTime(device.lastSeenAt)}</div>
                      {device.appVersion ? <div className="subtext">App {device.appVersion}</div> : null}
                    </td>
                    <td>{device.area}</td>
                    <td>
                      <StatusBadge tone={device.online ? 'ok' : 'danger'}>{device.online ? 'Online' : 'Offline'}</StatusBadge>
                      <div className="subtext">{device.connectionType} · {device.networkType || '-'}</div>
                      {device.batteryLevel !== null ? <div className="subtext">Pin {device.batteryLevel}%</div> : null}
                    </td>
                    <td>
                      <StatusBadge tone={device.playAllowed ? 'ok' : 'warn'}>{formatStatus(device.playAllowed)}</StatusBadge>
                      <div className="subtext">{device.playStatus}</div>
                      {device.playbackMessage ? <div className="subtext">{device.playbackMessage}</div> : null}
                    </td>
                    <td>
                      <select
                        className="compact-select"
                        value={getSelectedScheduleId(device)}
                        onChange={(event) =>
                          setSelectedScheduleByDevice((current) => ({ ...current, [device.deviceId]: event.target.value }))
                        }
                      >
                        <option value="">Chọn lịch RTSP</option>
                        {rtspSchedules.map((schedule) => (
                          <option key={schedule.scheduleId} value={schedule.scheduleId}>
                            {schedule.name}
                          </option>
                        ))}
                      </select>
                      <div className="subtext">Sync: {device.syncStatus || '-'}</div>
                      {device.syncMessage ? <div className="subtext">{device.syncMessage}</div> : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="ghost" disabled={saving} onClick={() => edit(device)} type="button">
                          Sửa
                        </button>
                        <button className="ghost" disabled={saving} onClick={() => togglePlayAllowed(device)} type="button">
                          {device.playAllowed ? 'Tắt phát' : 'Cho phát'}
                        </button>
                        <button className="ghost" disabled={saving || !getSelectedScheduleId(device)} onClick={() => syncSchedule(device.deviceId)} type="button">
                          Sync
                        </button>
                        <button className="primary" disabled={saving || !getSelectedScheduleId(device)} onClick={() => playNow(device.deviceId)} type="button">
                          Play now
                        </button>
                        <button className="danger" disabled={saving} onClick={() => stop(device.deviceId)} type="button">
                          Dừng
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
      ) : null}
    </Panel>
  );
}
