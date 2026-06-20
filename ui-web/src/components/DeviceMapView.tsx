import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Device } from '../lib/types';
import { formatDateTime } from '../lib/format';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function getMarkerIcon(device: Device) {
  const color = device.playStatus === 'ERROR' ? 'red' : device.playStatus === 'PLAYING' ? 'green' : device.online ? 'blue' : 'gray';
  
  return L.divIcon({
    className: `custom-marker-icon marker-${color}`,
    html: `<div class="marker-pin"></div><div class="marker-dot"></div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -35]
  });
}

function getDevicePosition(device: Device): [number, number] | null {
  if (typeof device.latitude !== 'number' || typeof device.longitude !== 'number') return null;
  return [device.latitude, device.longitude];
}

function MapUpdater({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  if (center) {
    map.flyTo(center, zoom || 13, { duration: 1.5 });
  }
  return null;
}

type DeviceMapViewProps = {
  devices: Device[];
  saving: boolean;
  stats: { total: number; online: number; offline: number; playing: number };
  search: string;
  onSearchChange: (value: string) => void;
  onPlayDevice: (device: Device) => void;
  onStartEmergency: (deviceId: string) => void;
  onStartLive: (deviceId: string) => void;
  onStopDevice: (deviceId: string) => void;
  onVolumeChange: (deviceId: string, volumeLevel: number) => void;
};

export function DeviceMapView({
  devices,
  saving,
  stats,
  search,
  onSearchChange,
  onPlayDevice,
  onStartEmergency,
  onStartLive,
  onStopDevice,
  onVolumeChange,
}: DeviceMapViewProps) {
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [volumePanelDeviceId, setVolumePanelDeviceId] = useState('');
  
  const groupedDevices = useMemo(() => {
    const groups: Record<string, Device[]> = {};
    for (const device of devices) {
      const area = device.area || 'Chưa phân khu';
      if (!groups[area]) groups[area] = [];
      groups[area].push(device);
    }
    return groups;
  }, [devices]);

  useEffect(() => {
    if (activeDevice && !devices.some((device) => device.deviceId === activeDevice.deviceId)) {
      setActiveDevice(null);
    }
  }, [activeDevice, devices]);

  return (
    <div className="device-map-page">
      <div className="device-map-topbar">
        <div className="device-map-stats">
          <div className="stat-item playing">
            <span className="dot"></span>
            Đang phát: <strong>{stats.playing}</strong>
          </div>
          <div className="stat-item online">
            <span className="dot"></span>
            Đã kết nối: <strong>{stats.online}</strong>
          </div>
          <div className="stat-item offline">
            <span className="dot"></span>
            Mất kết nối: <strong>{stats.offline}</strong>
          </div>
          <div className="stat-item total">
            Tổng thiết bị: <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="device-map-search">
          <input
            aria-label="Tìm kiếm thiết bị trên bản đồ"
            placeholder="Tìm theo tên, MAC, khu vực, kết nối..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className="device-map-layout">
        <div className="device-map-sidebar">
          {devices.length ? Object.entries(groupedDevices).map(([area, areaDevices]) => (
            <div key={area} className="area-group">
              <div className="area-header">
                {area} <span>({areaDevices.filter(d => d.online).length}/{areaDevices.length})</span>
              </div>
              <div className="area-list">
                {areaDevices.map(device => (
                  <div 
                    key={device.deviceId} 
                    className={`device-list-item ${activeDevice?.deviceId === device.deviceId ? 'active' : ''}`}
                    onClick={() => setActiveDevice(device)}
                  >
                    <span className={`status-dot ${device.playStatus === 'ERROR' ? 'error' : device.playStatus === 'PLAYING' ? 'playing' : device.online ? 'online' : 'offline'}`}></span>
                    <span className="device-name">{device.name}</span>
                    {!getDevicePosition(device) && <span className="no-coords" title="Chưa có tọa độ">⚠️</span>}
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="device-map-empty">Không tìm thấy thiết bị phù hợp.</div>
          )}
        </div>

        <div className="device-map-container">
          <MapContainer center={[16.0, 106.0]} zoom={6} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {activeDevice && <MapUpdater center={getDevicePosition(activeDevice)} />}
            {devices.map(device => {
              const position = getDevicePosition(device);
              const canPlay = Boolean(device.currentSchedule?.scheduleId || device.activeSchedule?.scheduleId);
              const isPlaying = device.playStatus === 'PLAYING';
              const displayVolume = device.desiredVolumeLevel ?? device.volumeLevel ?? 0;
              const volumePanelOpen = volumePanelDeviceId === device.deviceId;
              if (position) {
                return (
                  <Marker 
                    key={device.deviceId} 
                    position={position}
                    icon={getMarkerIcon(device)}
                    eventHandlers={{
                      click: () => setActiveDevice(device),
                    }}
                  >
                    <Popup className="device-map-popup" autoPan={false}>
                      <div className="popup-content">
                        <div className="popup-row"><span className="label">Tên:</span> <span className="value">{device.name}</span></div>
                        <div className="popup-row"><span className="label">Vị trí:</span> <span className="value">{device.area || 'Chưa phân khu'}</span></div>
                        <div className="popup-row"><span className="label">Mã thiết bị:</span> <span className="value">{device.macAddress}</span></div>
                        <div className="popup-row"><span className="label">Loại kết nối:</span> <span className="value">{getConnectionTypeLabel(device.connectionType)}</span></div>
                        <div className="popup-row">
                          <span className="label">Trạng thái:</span> 
                          <span className={`value status-${device.online ? (device.playStatus === 'PLAYING' ? 'playing' : 'online') : 'offline'}`}>
                            {device.online ? (device.playStatus === 'PLAYING' ? 'Đang phát' : 'Đã kết nối') : 'Mất kết nối'}
                          </span>
                        </div>
                        {device.playbackUpdatedAt && (
                          <div className="popup-row"><span className="label">Cập nhật:</span> <span className="value">{formatDateTime(device.playbackUpdatedAt)}</span></div>
                        )}
                        {device.batteryLevel !== null && (
                          <div className="popup-row"><span className="label">Pin:</span> <span className="value">{device.batteryLevel}%</span></div>
                        )}
                        <div className="popup-monitor-controls">
                          <button
                            aria-label={isPlaying ? `Dừng phát ${device.name}` : `Bật phát ${device.name}`}
                            className={`popup-play-toggle ${isPlaying ? 'playing' : ''}`}
                            disabled={saving || (!isPlaying && !canPlay)}
                            onClick={() => (isPlaying ? onStopDevice(device.deviceId) : onPlayDevice(device))}
                            title={isPlaying ? 'Dừng phát' : canPlay ? 'Bật phát' : 'Chưa có lịch để bật phát'}
                            type="button"
                          >
                            <span aria-hidden="true">{isPlaying ? '■' : '▶'}</span>
                            {isPlaying ? 'Dừng' : 'Bật phát'}
                          </button>
                          <button
                            aria-label={`Chỉnh âm lượng ${device.name}`}
                            className="popup-volume-toggle"
                            disabled={saving}
                            onClick={() => setVolumePanelDeviceId((current) => (current === device.deviceId ? '' : device.deviceId))}
                            title="Chỉnh âm lượng"
                            type="button"
                          >
                            🔊
                          </button>
                        </div>
                        {!isPlaying && !canPlay ? <div className="popup-hint">Chưa có lịch để bật phát.</div> : null}
                        {volumePanelOpen ? (
                          <div className="popup-volume-panel">
                            <div className="popup-volume-row">
                              <span>{displayVolume}</span>
                              <input
                                aria-label={`Âm lượng ${device.name}`}
                                disabled={saving}
                                max={15}
                                min={0}
                                onChange={(event) => onVolumeChange(device.deviceId, Number(event.target.value))}
                                type="range"
                                value={displayVolume}
                              />
                              <span>15</span>
                            </div>
                            <div className="popup-volume-footer">
                              <button disabled={saving || displayVolume === 0} onClick={() => onVolumeChange(device.deviceId, 0)} type="button">
                                Tắt âm
                              </button>
                              <span>{getVolumeSyncLabel(device.volumeSyncStatus)}</span>
                            </div>
                            <div className="popup-volume-note">{formatDeviceMessage(device.volumeSyncMessage || getVolumeActualText(device))}</div>
                          </div>
                        ) : null}
                        <div className="popup-actions">
                          <button
                            aria-label={`Phát khẩn cấp tới ${device.name}`}
                            className="popup-action emergency"
                            onClick={() => onStartEmergency(device.deviceId)}
                            title="Phát khẩn cấp"
                            type="button"
                          >
                            <span>⚠</span> Phát khẩn cấp
                          </button>
                          <button
                            aria-label={`Phát trực tiếp tới ${device.name}`}
                            className="popup-action live"
                            onClick={() => onStartLive(device.deviceId)}
                            title="Phát trực tiếp"
                            type="button"
                          >
                            <span>●</span> Phát trực tiếp
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

function getConnectionTypeLabel(connectionType: Device['connectionType']) {
  if (connectionType === 'LAN') return 'LAN';
  if (connectionType === '4G') return '4G';
  return 'Chưa xác định';
}

function getVolumeSyncLabel(status: Device['volumeSyncStatus']) {
  if (status === 'SYNCED') return 'Đã áp dụng';
  if (status === 'FAILED') return 'Thất bại';
  if (status === 'PENDING') return 'Đang chờ';
  return 'Chưa đặt';
}

function getVolumeActualText(device: Device) {
  return device.volumeLevel !== null ? `Thực tế: ${device.volumeLevel}` : 'Chưa có xác nhận';
}

const deviceMessageLabels: Record<string, string> = {
  'Da co lenh am luong moi hon.': 'Đã có lệnh âm lượng mới hơn.',
  'Dang cho thiet bi nhan lenh am luong.': 'Đang chờ thiết bị nhận lệnh âm lượng.',
  'Thiet bi ap dung am luong that bai.': 'Thiết bị áp dụng âm lượng thất bại.',
  'Thiet bi da ap dung am luong.': 'Thiết bị đã áp dụng âm lượng.',
};

function formatDeviceMessage(message: string) {
  return deviceMessageLabels[message.trim()] || message;
}
