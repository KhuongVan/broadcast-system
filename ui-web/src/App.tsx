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
  const [activeView, setActiveView] = useState<ViewKey>('overview');
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
    setActiveView('emergency');
  }

  function openLiveForDevice(deviceId: string) {
    setPrefillDeviceId(deviceId);
    setPrefillTarget('live');
    setActiveView('live');
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

  if (loading) {
    return <div className="boot-screen">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!session) {
    return <LoginPage onLoggedIn={() => void refreshSession()} />;
  }

  return (
    <Shell activeView={activeView} session={session} onChangeView={setActiveView} onLogout={() => void logout()}>
      {activeView === 'overview' ? <OverviewView /> : null}
      {activeView.startsWith('devices:') ? (
        <DevicesView
          activeSection={getDeviceSection(activeView)}
          onChangeSection={(section) => setActiveView(`devices:${section}`)}
          onStartEmergency={openEmergencyForDevice}
          onStartLive={openLiveForDevice}
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
    </Shell>
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
