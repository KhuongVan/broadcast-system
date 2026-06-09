import type { ReactNode } from 'react';

export type ScheduleTabKey = 'schedules' | 'playlists' | 'files';

type ScheduleManagementViewProps = {
  activeTab: ScheduleTabKey;
  schedules: ReactNode;
  playlists: ReactNode;
  files: ReactNode;
};

export function ScheduleManagementView({ activeTab, schedules, playlists, files }: ScheduleManagementViewProps) {
  return (
    <div className="tab-page">
      <div className="tab-content">
        {activeTab === 'schedules' ? schedules : null}
        {activeTab === 'playlists' ? playlists : null}
        {activeTab === 'files' ? files : null}
      </div>
    </div>
  );
}
