import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { adminApi } from '../lib/api';
import type { AudioFile, Device, Playlist, Schedule, ScheduleStatus } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

export function OverviewView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [area, setArea] = useState('');
  const [connected, setConnected] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>({ activeSchedule: null, pausedSchedule: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const areas = useMemo(() => {
    const names = devices.map((device) => device.area).filter((value): value is string => Boolean(value?.trim()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [devices]);

  const scopedDevices = useMemo(
    () => (area ? devices.filter((device) => device.area === area) : devices),
    [area, devices],
  );

  const summary = useMemo(() => {
    const online = scopedDevices.filter((device) => device.online).length;
    const playing = scopedDevices.filter((device) => device.playStatus === 'PLAYING').length;
    const enabledSchedules = schedules.filter((schedule) => schedule.enabled).length;
    return {
      totalDevices: scopedDevices.length,
      online,
      offline: Math.max(scopedDevices.length - online, 0),
      playing,
      enabledSchedules,
      disabledSchedules: Math.max(schedules.length - enabledSchedules, 0),
      playlists: playlists.length,
      files: files.length,
    };
  }, [files.length, playlists.length, schedules, scopedDevices]);

  useEffect(() => {
    let socket: Socket | null = io('/', { withCredentials: true });

    socket.on('connect', () => {
      setConnected(true);
      socket?.emit('admin_request_schedule_status');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('SCHEDULE_STATUS', (payload: ScheduleStatus) => setScheduleStatus(payload));

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [deviceData, scheduleData, playlistData, fileData] = await Promise.all([
          adminApi.listDevices(),
          adminApi.listSchedules(),
          adminApi.listPlaylists(),
          adminApi.listFiles(),
        ]);
        setDevices(deviceData.devices);
        setSchedules(scheduleData.schedules);
        setPlaylists(playlistData.playlists);
        setFiles(fileData.files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu tổng quan.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <div className="dashboard-page">
      <div className="hero-panel">
        <div>
          <p className="section-kicker">Thành phố Hồ Chí Minh</p>
          <h2>Hệ thống thông tin nguồn - Thành phố Hồ Chí Minh</h2>
          <p>Theo dõi nhanh thiết bị, lịch phát và kho nội dung đang vận hành.</p>
        </div>
        <StatusBadge tone={connected ? 'ok' : 'danger'}>{connected ? 'Realtime online' : 'Realtime offline'}</StatusBadge>
      </div>

      <div className="filter-row">
        <select value="Thành phố Hồ Chí Minh" disabled>
          <option>Thành phố Hồ Chí Minh</option>
        </select>
        <select value={area} onChange={(event) => setArea(event.target.value)} disabled={!areas.length}>
          <option value="">Tất cả khu vực</option>
          {areas.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value="" disabled>
          <option>Chọn xã/phường</option>
        </select>
      </div>

      <DataState loading={loading} error={error} empty={false} />

      {!loading && !error ? (
        <>
          <div className="kpi-grid">
            <MetricCard tone="red" value={summary.totalDevices} label="Tổng thiết bị trên địa bàn" />
            <MetricCard tone="blue" value={summary.online} label="Thiết bị đang kết nối" />
            <MetricCard tone="orange" value={summary.offline} label="Thiết bị mất kết nối" />
            <MetricCard tone="green" value={summary.playing} label="Thiết bị đang phát" />
            <MetricCard tone="blue" value={summary.enabledSchedules} label="Lịch phát đang bật" />
            <MetricCard tone="orange" value={summary.disabledSchedules} label="Lịch phát đang tắt" />
            <MetricCard tone="green" value={summary.playlists} label="Danh sách phát" />
            <MetricCard tone="red" value={summary.files} label="File âm thanh" />
          </div>

          <div className="overview-grid">
            <Panel title="Trạng thái lịch phát" description="Cập nhật nhanh qua Socket.IO.">
              <div className="summary-list">
                <SummaryItem label="Lịch đang phát" value={scheduleStatus.activeSchedule?.name || 'Không có'} />
                <SummaryItem label="Lịch tạm dừng" value={scheduleStatus.pausedSchedule?.name || 'Không có'} />
                <SummaryItem label="Nguồn đang phát" value={getActiveSourceLabel(scheduleStatus.activeSchedule?.sourceType)} />
              </div>
            </Panel>
            <Panel title="Thiết bị cần chú ý" description="Các thiết bị offline hoặc đang báo lỗi phát.">
              <div className="mini-list">
                {scopedDevices.filter((device) => !device.online || device.playStatus === 'ERROR').slice(0, 5).map((device) => (
                  <div className="mini-list-item" key={device.deviceId}>
                    <div>
                      <strong>{device.name}</strong>
                      <div className="subtext">{device.area || 'Chưa phân khu'} · {device.macAddress}</div>
                    </div>
                    <StatusBadge tone={device.online ? 'danger' : 'warn'}>{device.online ? 'Lỗi phát' : 'Offline'}</StatusBadge>
                  </div>
                ))}
                {scopedDevices.every((device) => device.online && device.playStatus !== 'ERROR') ? (
                  <div className="state compact">Không có thiết bị cần chú ý.</div>
                ) : null}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'red' | 'blue' | 'orange' | 'green' }) {
  return (
    <div className={`metric-card ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getActiveSourceLabel(sourceType: Schedule['sourceType'] | undefined) {
  if (!sourceType) return 'Không có nguồn đang phát';
  if (sourceType === 'RTSP') return 'RTSP/HLS';
  return 'File/Playlist';
}
