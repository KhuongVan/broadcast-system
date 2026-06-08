import type { ReactNode } from 'react';
import type { Session } from '../lib/types';

export type ViewKey = 'broadcast' | 'playlists' | 'files' | 'schedules' | 'devices' | 'tts';

const views: Array<{ key: ViewKey; label: string }> = [
  { key: 'broadcast', label: 'Điều khiển phát' },
  { key: 'playlists', label: 'Danh sách phát' },
  { key: 'files', label: 'Kho âm thanh' },
  { key: 'schedules', label: 'Lịch phát' },
  { key: 'devices', label: 'Thiết bị' },
  { key: 'tts', label: 'TTS' },
];

type ShellProps = {
  activeView: ViewKey;
  children: ReactNode;
  session: Session;
  onChangeView: (view: ViewKey) => void;
  onLogout: () => void;
};

export function Shell({ activeView, children, session, onChangeView, onLogout }: ShellProps) {
  const title = views.find((view) => view.key === activeView)?.label || 'Quản trị';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Phát thanh thông minh</div>
        <nav className="nav-list">
          {views.map((view) => (
            <button
              className={view.key === activeView ? 'nav-btn active' : 'nav-btn'}
              key={view.key}
              onClick={() => onChangeView(view.key)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="account">
            <span>{session.username || 'Admin'}</span>
            <button className="ghost" onClick={onLogout} type="button">
              Đăng xuất
            </button>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
