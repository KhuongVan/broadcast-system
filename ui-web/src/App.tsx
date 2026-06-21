import { useEffect, useState } from 'react';
import { BroadcastView } from './components/BroadcastView';
import { ClientSimulatorView } from './components/ClientSimulatorView';
import { DevicesView } from './components/DevicesView';
import { EmergencyView } from './components/EmergencyView';
import { FilesView } from './components/FilesView';
import { LoginPage } from './components/LoginPage';
import { OverviewView } from './components/OverviewView';
import { PlaylistsView } from './components/PlaylistsView';
import { ReportsView } from './components/ReportsView';
import { ScheduleManagementView } from './components/ScheduleManagementView';
import { SchedulesView } from './components/SchedulesView';
import { Shell, type ViewKey } from './components/Shell';
import { SystemAdminView } from './components/SystemAdminView';
import { ToastProvider } from './components/Toast';
import { adminApi } from './lib/api';
import type { Session } from './lib/types';

export function App() {
  if (window.location.pathname === '/client') {
    return <ClientSimulatorView />;
  }

  return <AdminApp />;
}

function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>(() => getViewFromCurrentPath());
  const [loading, setLoading] = useState(true);
  const [prefillDeviceId, setPrefillDeviceId] = useState('');
  const [prefillTarget, setPrefillTarget] = useState<'emergency' | 'live' | null>(null);

  async function refreshSession() {
    const data = await adminApi.me();
    setSession(data.authenticated ? data : null);
  }

  async function logout() {
    await adminApi.logout();
    setSession(null);
  }

  function openEmergencyForDevice(deviceId: string) {
    setPrefillDeviceId(deviceId);
    setPrefillTarget('emergency');
    navigateToView('emergency');
  }

  function openLiveForDevice(deviceId: string) {
    setPrefillDeviceId(deviceId);
    setPrefillTarget('live');
    navigateToView('live');
  }

  function clearDevicePrefill() {
    setPrefillDeviceId('');
    setPrefillTarget(null);
  }

  useEffect(() => {
    refreshSession()
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handlePopState() {
      setActiveView(getViewFromCurrentPath());
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigateToView(view: ViewKey) {
    const path = getPathForView(view);
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setActiveView(view);
  }

  if (loading) {
    return <div className="boot-screen">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!session) {
    return <LoginPage onLoggedIn={() => void refreshSession()} />;
  }

  return (
    <ToastProvider>
      <Shell activeView={activeView} session={session} onChangeView={navigateToView} onLogout={() => void logout()}>
        {activeView === 'overview' ? <OverviewView /> : null}
        {activeView.startsWith('devices:') ? (
          <DevicesView
            activeSection={getDeviceSection(activeView)}
            onChangeSection={(section) => navigateToView(`devices:${section}`)}
            onStartEmergency={openEmergencyForDevice}
            onStartLive={openLiveForDevice}
            session={session}
          />
        ) : null}
        {activeView.startsWith('schedules:') ? (
          <ScheduleManagementView
            activeTab={getScheduleTab(activeView)}
            schedules={<SchedulesView embedded />}
            playlists={<PlaylistsView embedded />}
            files={<FilesView embedded />}
          />
        ) : null}
        {activeView === 'live' ? (
          <BroadcastView
            openCreateOnPrefill={prefillTarget === 'live'}
            prefillDeviceId={prefillTarget === 'live' ? prefillDeviceId : undefined}
            onPrefillHandled={clearDevicePrefill}
          />
        ) : null}
        {activeView === 'emergency' ? (
          <EmergencyView
            prefillDeviceId={prefillTarget === 'emergency' ? prefillDeviceId : undefined}
            onPrefillHandled={clearDevicePrefill}
          />
        ) : null}
        {activeView === 'reports' ? <ReportsView /> : null}
        {activeView === 'system' && session.role === 'SYSTEM_ADMIN' ? <SystemAdminView /> : null}
      </Shell>
    </ToastProvider>
  );
}

function getDeviceSection(activeView: ViewKey) {
  if (activeView === 'devices:map') return 'map';
  if (activeView === 'devices:settings') return 'settings';
  if (activeView === 'devices:logs') return 'logs';
  return 'operate';
}

function getScheduleTab(activeView: ViewKey) {
  if (activeView === 'schedules:playlists') return 'playlists';
  if (activeView === 'schedules:files') return 'files';
  return 'schedules';
}

const viewPathMap = {
  overview: '/',
  'devices:map': '/devices/map',
  'devices:operate': '/devices/operate',
  'devices:settings': '/devices/settings',
  'devices:logs': '/devices/logs',
  'schedules:schedules': '/schedules',
  'schedules:playlists': '/schedules/playlists',
  'schedules:files': '/schedules/files',
  emergency: '/emergency',
  live: '/live',
  reports: '/reports',
  system: '/system',
} satisfies Record<ViewKey, string>;

const pathViewMap = new Map<string, ViewKey>(
  Object.entries(viewPathMap).map(([view, path]) => [path, view as ViewKey]),
);

function getPathForView(view: ViewKey) {
  return viewPathMap[view];
}

function getViewFromCurrentPath() {
  const path = normalizePath(window.location.pathname);
  const view = pathViewMap.get(path);
  if (view) return view;

  window.history.replaceState(null, '', '/');
  return 'overview';
}

function normalizePath(path: string) {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
}
