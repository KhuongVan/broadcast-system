import { ReactNode, useState } from 'react';

type TabKey = 'schedules' | 'playlists' | 'files';

type ScheduleManagementViewProps = {
  schedules: ReactNode;
  playlists: ReactNode;
  files: ReactNode;
};

const tabs: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'schedules', label: 'Lịch phát', description: 'Tạo và quản lý khung giờ phát.' },
  { key: 'playlists', label: 'Danh sách phát', description: 'Sắp xếp nội dung theo playlist.' },
  { key: 'files', label: 'Kho âm thanh', description: 'Upload và nghe thử file MP3.' },
];

export function ScheduleManagementView({ schedules, playlists, files }: ScheduleManagementViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('schedules');

  return (
    <div className="tab-page">
      <div className="tab-hero">
        <div>
          <p className="section-kicker">Quản lý lịch phát</p>
          <h2>Lịch phát, danh sách phát và kho âm thanh</h2>
          <p>Gom toàn bộ nghiệp vụ lập lịch và chuẩn bị nội dung vào một khu vực dễ thao tác.</p>
        </div>
      </div>

      <div className="tab-bar" role="tablist" aria-label="Quản lý lịch phát">
        {tabs.map((tab) => (
          <button
            aria-selected={tab.key === activeTab}
            className={tab.key === activeTab ? 'tab-btn active' : 'tab-btn'}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            type="button"
          >
            <strong>{tab.label}</strong>
            <span>{tab.description}</span>
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'schedules' ? schedules : null}
        {activeTab === 'playlists' ? playlists : null}
        {activeTab === 'files' ? files : null}
      </div>
    </div>
  );
}
