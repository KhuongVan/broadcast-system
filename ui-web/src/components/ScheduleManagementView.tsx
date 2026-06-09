import type { ReactNode } from 'react';

export type ScheduleTabKey = 'schedules' | 'playlists' | 'files';

type ScheduleManagementViewProps = {
  activeTab: ScheduleTabKey;
  schedules: ReactNode;
  playlists: ReactNode;
  files: ReactNode;
};

const tabs: Array<{ key: ScheduleTabKey; label: string; description: string }> = [
  { key: 'schedules', label: 'Lịch phát', description: 'Tạo và quản lý khung giờ phát.' },
  { key: 'playlists', label: 'Danh sách phát', description: 'Sắp xếp nội dung theo playlist.' },
  { key: 'files', label: 'Kho âm thanh', description: 'Upload và nghe thử file MP3.' },
];

export function ScheduleManagementView({ activeTab, schedules, playlists, files }: ScheduleManagementViewProps) {
  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  return (
    <div className="tab-page">
      <div className="tab-hero">
        <div>
          <p className="section-kicker">Quản lý lịch phát</p>
          <h2>{currentTab.label}</h2>
          <p>{currentTab.description}</p>
        </div>
      </div>

      <div className="tab-content">
        {activeTab === 'schedules' ? schedules : null}
        {activeTab === 'playlists' ? playlists : null}
        {activeTab === 'files' ? files : null}
      </div>
    </div>
  );
}
