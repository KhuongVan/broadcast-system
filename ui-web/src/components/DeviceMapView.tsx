import { useMemo, useState } from 'react';
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

function MapUpdater({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  if (center) {
    map.flyTo(center, zoom || 13, { duration: 1.5 });
  }
  return null;
}

type DeviceMapViewProps = {
  devices: Device[];
  stats: { total: number; online: number; offline: number; playing: number };
};

export function DeviceMapView({ devices, stats }: DeviceMapViewProps) {
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  
  const groupedDevices = useMemo(() => {
    const groups: Record<string, Device[]> = {};
    for (const device of devices) {
      const area = device.area || 'Chưa phân khu';
      if (!groups[area]) groups[area] = [];
      groups[area].push(device);
    }
    return groups;
  }, [devices]);

  return (
    <div className="device-map-page">
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

      <div className="device-map-layout">
        <div className="device-map-sidebar">
          {Object.entries(groupedDevices).map(([area, areaDevices]) => (
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
                    {!device.latitude && <span className="no-coords" title="Chưa có tọa độ">⚠️</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="device-map-container">
          <MapContainer center={[16.0, 106.0]} zoom={6} style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {activeDevice && <MapUpdater center={activeDevice.latitude ? [activeDevice.latitude, activeDevice.longitude] : null} />}
            {devices.map(device => {
              if (device.latitude && device.longitude) {
                return (
                  <Marker 
                    key={device.deviceId} 
                    position={[device.latitude, device.longitude]}
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
                        <div className="popup-row"><span className="label">Loại kết nối:</span> <span className="value">{device.connectionType}</span></div>
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
