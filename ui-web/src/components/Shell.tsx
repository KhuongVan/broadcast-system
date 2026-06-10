import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '../lib/types';

export type ViewKey =
  | 'overview'
  | 'devices:map'
  | 'devices:operate'
  | 'devices:settings'
  | 'devices:logs'
  | 'schedules:schedules'
  | 'schedules:playlists'
  | 'schedules:files'
  | 'live'
  | 'emergency'
  | 'reports';

type ParentKey = 'devices' | 'schedules';

type MenuItem = {
  key: ViewKey;
  label: string;
  icon: string;
  eyebrow: string;
};

type MenuGroup = {
  key: ParentKey;
  label: string;
  icon: string;
  eyebrow: string;
  children: MenuItem[];
};

type MenuEntry = MenuItem | MenuGroup;

const menu: MenuEntry[] = [
  { key: 'overview', label: 'Tổng quan', icon: '▦', eyebrow: 'Dashboard vận hành' },
  {
    key: 'devices',
    label: 'Quản lý thiết bị',
    icon: '◉',
    eyebrow: 'Thiết bị và kết nối',
    children: [
      { key: 'devices:map', label: 'Giám sát trực tuyến', icon: '⊕', eyebrow: 'Quản lý thiết bị / Giám sát trực tuyến' },
      { key: 'devices:operate', label: 'Vận hành', icon: '▶', eyebrow: 'Quản lý thiết bị / Vận hành' },
      { key: 'devices:settings', label: 'Cài đặt', icon: '⚙', eyebrow: 'Quản lý thiết bị / Cài đặt' },
      { key: 'devices:logs', label: 'Nhật ký', icon: '≡', eyebrow: 'Quản lý thiết bị / Nhật ký' },
    ],
  },
  {
    key: 'schedules',
    label: 'Quản lý lịch phát',
    icon: '◷',
    eyebrow: 'Lịch phát, playlist, audio',
    children: [
      { key: 'schedules:schedules', label: 'Lịch phát', icon: '◷', eyebrow: 'Quản lý lịch phát / Lịch phát' },
      { key: 'schedules:playlists', label: 'Danh sách phát', icon: '▤', eyebrow: 'Quản lý lịch phát / Danh sách phát' },
      { key: 'schedules:files', label: 'Kho âm thanh', icon: '♪', eyebrow: 'Quản lý lịch phát / Kho âm thanh' },
    ],
  },
  { key: 'live', label: 'Phát trực tiếp', icon: '●', eyebrow: 'Live mic và phát file' },
  { key: 'emergency', label: 'Phát khẩn cấp', icon: '⚠', eyebrow: 'Phát khẩn cấp từ nguồn RTSP/HLS' },
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
  const activeParent = getParentKey(activeView);
  const [expandedGroups, setExpandedGroups] = useState<Set<ParentKey>>(() => new Set(activeParent ? [activeParent] : []));

  const currentView = useMemo(() => findMenuItem(activeView), [activeView]);

  useEffect(() => {
    if (!activeParent) return;
    setExpandedGroups((current) => {
      if (current.has(activeParent)) return current;
      const next = new Set(current);
      next.add(activeParent);
      return next;
    });
  }, [activeParent]);

  function toggleGroup(groupKey: ParentKey) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">BS</div>
          <div>
            <div className="brand">Phát thanh nhanh</div>
            <div className="brand-subtitle">Broadcast Admin</div>
          </div>
        </div>
        <nav className="nav-list">
          {menu.map((item) => {
            if ('children' in item) {
              const expanded = expandedGroups.has(item.key);
              const active = activeParent === item.key;

              return (
                <div className={active ? 'nav-group active' : 'nav-group'} key={item.key}>
                  <button
                    aria-expanded={expanded}
                    className={active ? 'nav-btn nav-parent active' : 'nav-btn nav-parent'}
                    onClick={() => toggleGroup(item.key)}
                    type="button"
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className={expanded ? 'nav-chevron open' : 'nav-chevron'}>⌄</span>
                  </button>
                  {expanded ? (
                    <div className="nav-sublist">
                      {item.children.map((child) => (
                        <button
                          className={child.key === activeView ? 'nav-subbtn active' : 'nav-subbtn'}
                          key={child.key}
                          onClick={() => onChangeView(child.key)}
                          type="button"
                        >
                          <span className="nav-subicon">{child.icon}</span>
                          <span>{child.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <button
                className={item.key === activeView ? 'nav-btn active' : 'nav-btn'}
                key={item.key}
                onClick={() => onChangeView(item.key)}
                type="button"
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
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

function getParentKey(activeView: ViewKey): ParentKey | null {
  if (activeView.startsWith('devices:')) return 'devices';
  if (activeView.startsWith('schedules:')) return 'schedules';
  return null;
}

function findMenuItem(activeView: ViewKey): MenuItem {
  for (const item of menu) {
    if ('children' in item) {
      const child = item.children.find((entry) => entry.key === activeView);
      if (child) return child;
    } else if (item.key === activeView) {
      return item;
    }
  }

  return menu[0] as MenuItem;
}
