import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { AudioFile, Device, Playlist, Schedule } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';

export function ReportsView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const report = useMemo(() => {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const byArea = Array.from(
      devices.reduce((map, device) => {
        const key = device.area || 'Chưa phân khu';
        const current = map.get(key) || { total: 0, online: 0 };
        current.total += 1;
        if (device.online) current.online += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { total: number; online: number }>()),
    );

    return {
      onlineRate: devices.length ? Math.round((devices.filter((device) => device.online).length / devices.length) * 100) : 0,
      activeScheduleRate: schedules.length ? Math.round((schedules.filter((schedule) => schedule.enabled).length / schedules.length) * 100) : 0,
      rtspSchedules: schedules.filter((schedule) => schedule.sourceType === 'RTSP').length,
      fileSchedules: schedules.filter((schedule) => schedule.sourceType === 'FILE').length,
      emergencySchedules: schedules.filter((schedule) => schedule.priority === 'EMERGENCY').length,
      totalSize,
      averagePlaylistFiles: playlists.length
        ? Math.round(playlists.reduce((sum, playlist) => sum + playlist.totalFiles, 0) / playlists.length)
        : 0,
      byArea,
    };
  }, [devices, files, playlists, schedules]);

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
        setError(err instanceof Error ? err.message : 'Không tải được báo cáo thống kê.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <Panel title="Báo cáo thống kê" description="Số liệu tổng hợp từ dữ liệu hiện có trong hệ thống.">
      <DataState loading={loading} error={error} empty={!devices.length && !schedules.length && !files.length} />
      {!loading && !error ? (
        <div className="reports-layout">
          <div className="kpi-grid compact">
            <ReportCard label="Tỷ lệ thiết bị online" value={`${report.onlineRate}%`} />
            <ReportCard label="Tỷ lệ lịch đang bật" value={`${report.activeScheduleRate}%`} />
            <ReportCard label="Lịch RTSP/HLS" value={String(report.rtspSchedules)} />
            <ReportCard label="Lịch file/playlist" value={String(report.fileSchedules)} />
            <ReportCard label="Lịch khẩn cấp" value={String(report.emergencySchedules)} />
            <ReportCard label="Dung lượng audio" value={formatBytes(report.totalSize)} />
          </div>

          <div className="report-grid">
            <section className="detail-panel">
              <h3>Thiết bị theo khu vực</h3>
              <div className="bar-list">
                {report.byArea.length ? report.byArea.map(([area, item]) => (
                  <div className="bar-row" key={area}>
                    <div>
                      <strong>{area}</strong>
                      <span>{item.online}/{item.total} online</span>
                    </div>
                    <div className="bar-track">
                      <span style={{ width: `${item.total ? (item.online / item.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )) : <div className="state compact">Chưa có dữ liệu thiết bị.</div>}
              </div>
            </section>

            <section className="detail-panel">
              <h3>Tình trạng vận hành</h3>
              <div className="summary-list">
                <ReportLine label="Thiết bị đang phát" value={devices.filter((device) => device.playStatus === 'PLAYING').length} tone="ok" />
                <ReportLine label="Thiết bị báo lỗi" value={devices.filter((device) => device.playStatus === 'ERROR').length} tone="danger" />
                <ReportLine label="Playlist trung bình" value={`${report.averagePlaylistFiles} file`} tone="neutral" />
                <ReportLine label="File âm thanh" value={files.length} tone="neutral" />
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReportLine({ label, value, tone }: { label: string; value: number | string; tone: 'ok' | 'danger' | 'neutral' }) {
  return (
    <div className="summary-item inline">
      <span>{label}</span>
      <StatusBadge tone={tone}>{String(value)}</StatusBadge>
    </div>
  );
}
