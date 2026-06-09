import type { ReactNode } from 'react';
import type { Session } from '../lib/types';

export type ViewKey = 'overview' | 'devices' | 'schedules' | 'live' | 'reports';

const views: Array<{ key: ViewKey; label: string; icon: string; eyebrow: string }> = [
  { key: 'overview', label: 'Tổng quan', icon: '▦', eyebrow: 'Dashboard vận hành' },
  { key: 'devices', label: 'Quản lý thiết bị', icon: '◉', eyebrow: 'Thiết bị và kết nối' },
  { key: 'schedules', label: 'Quản lý lịch phát', icon: '◷', eyebrow: 'Lịch phát, playlist, audio' },
  { key: 'live', label: 'Phát trực tiếp', icon: '▶', eyebrow: 'Live mic và phát file' },
  { key: 'reports', label: 'Báo cáo thống kê', icon: '▥', eyebrow: 'Số liệu tổng hợp' },
];

type ShellProps = {
  activeView: ViewKey;
  children: ReactNode;
  session: Session;
  onChangeView: (view: ViewKey) => void;
  onLogout: () => void;
};

export function Shell({ activeView, children, session, onChangeView, onLogout }: ShellProps) {
  const currentView = views.find((view) => view.key === activeView) || views[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">BS</div>
          <div>
            <div className="brand">Hệ thống truyền thanh thông minh</div>
            <div className="brand-subtitle">Broadcast Admin</div>
          </div>
        </div>
        <nav className="nav-list">
          {views.map((view) => (
            <button
              className={view.key === activeView ? 'nav-btn active' : 'nav-btn'}
              key={view.key}
              onClick={() => onChangeView(view.key)}
              type="button"
            >
              <span className="nav-icon">{view.icon}</span>
              <span>{view.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">{currentView.eyebrow}</p>
            <h1>{currentView.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="notification-dot" aria-label="Trạng thái hệ thống" title="Trạng thái hệ thống">
              <span />
            </div>
            <div className="account">
              <span className="avatar">{(session.username || 'A').slice(0, 1).toUpperCase()}</span>
              <span>{session.username || 'Admin'}</span>
            </div>
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
