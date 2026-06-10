import { ChangeEvent, FormEvent, useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
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
  simNumber: '',
  area: '',
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const operationSchedules = useMemo(() => schedules, [schedules]);

  const filteredDevices = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return devices;
    return devices.filter((device) => getDeviceSearchValues(device).some((value) => normalizeSearchText(value).includes(keyword)));
  }, [devices, search]);

  const visibleStats = useMemo(() => {
    const online = filteredDevices.filter((device) => device.online).length;
    return {
      total: filteredDevices.length,
      online,
      offline: Math.max(filteredDevices.length - online, 0),
      playing: filteredDevices.filter((device) => device.playStatus === 'PLAYING').length,
    };
  }, [filteredDevices]);

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
      simNumber: device.simNumber,
      area: device.area,
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

  function exportDevicesCsv() {
    const rows = [
      ['Tên thiết bị', 'MAC', 'Số SIM', 'Khu vực', 'Dạng kết nối', 'Trạng thái online', 'Trạng thái phát', 'Lịch đã tải', 'Đồng bộ'],
      ...devices.map((device) => [
        device.name,
        device.macAddress,
        device.simNumber || '',
        device.area,
        getConnectionTypeLabel(device.connectionType),
        device.online ? 'Kết nối' : 'Mất kết nối',
        getPlayStatusLabel(device),
        device.activeSchedule?.name || '',
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
      setError('Vui lòng chọn file thiết bị.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const rows = await readDeviceImportRows(importFile);
      const inputs = rows.map(toDeviceInputFromCsv).filter((input): input is DeviceInput => Boolean(input));
      if (!inputs.length) throw new Error('File nhập không có thiết bị hợp lệ.');
      await Promise.all(inputs.map((input) => adminApi.createDevice(input)));
      await load();
      closeImportModal();
      alert(`Đã nhập ${inputs.length} thiết bị.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nhập được thiết bị.');
    } finally {
      setSaving(false);
    }
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
            <DeviceMapView devices={filteredDevices} stats={visibleStats} search={search} onSearchChange={setSearch} />
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
                      <span>Tổng thiết bị: <strong>{visibleStats.total}</strong></span>
                      <span>Kết nối: <strong>{visibleStats.online}</strong></span>
                      <span>Mất kết nối: <strong>{visibleStats.offline}</strong></span>
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
                              <div className="subtext">{getConnectionTypeLabel(device.connectionType)} · {device.networkType || '-'}</div>
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
                          <td>{getConnectionTypeLabel(device.connectionType)}</td>
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
                      Số SIM
                      <input value={form.simNumber || ''} onChange={(event) => update('simNumber', event.target.value || null)} placeholder="VD: 0987654321" />
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

function getDeviceSearchValues(device: Device) {
  return [
    device.name,
    device.macAddress,
    device.simNumber,
    device.area,
    device.connectionType,
    getConnectionTypeLabel(device.connectionType),
    device.networkType,
    device.online ? 'Kết nối Đã kết nối' : 'Mất kết nối',
    getPlayStatusLabel(device),
    device.activeSchedule?.name,
    device.currentSchedule?.name,
  ];
}

function normalizeSearchText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[firstSheetName], {
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

function toDeviceInputFromCsv(row: string[], index: number, rows: string[][]): DeviceInput | null {
  const header = index === 0 ? row.map(normalizeCsvHeader) : rows[0]?.map(normalizeCsvHeader) || [];
  if (index === 0 && header.some((value) => ['name', 'tenthietbi', 'mac', 'macaddress'].includes(value))) return null;

  const valueByHeader = (names: string[]) => {
    const columnIndex = header.findIndex((value) => names.includes(value));
    return columnIndex >= 0 ? row[columnIndex]?.trim() || '' : '';
  };

  const name = valueByHeader(['name', 'tenthietbi']) || row[0]?.trim() || '';
  const macAddress = valueByHeader(['mac', 'macaddress', 'diachimac']) || row[1]?.trim() || '';
  const simNumber = valueByHeader(['sim', 'sosim', 'simnumber']) || row[2]?.trim() || '';
  const area = valueByHeader(['area', 'khuvuc']) || row[3]?.trim() || '';

  if (!name || !macAddress) return null;
  return {
    name,
    macAddress,
    simNumber: simNumber || null,
    area,
    latitude: null,
    longitude: null,
  };
}

function normalizeCsvHeader(value: string) {
  return value
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

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
