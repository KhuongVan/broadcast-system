import { useEffect, useState } from 'react';
import { BroadcastView } from './components/BroadcastView';
import { DevicesView } from './components/DevicesView';
import { FilesView } from './components/FilesView';
import { LoginPage } from './components/LoginPage';
import { PlaylistsView } from './components/PlaylistsView';
import { SchedulesView } from './components/SchedulesView';
import { Shell, type ViewKey } from './components/Shell';
import { TtsView } from './components/TtsView';
import { adminApi } from './lib/api';
import type { Session } from './lib/types';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('broadcast');
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    const data = await adminApi.me();
    setSession(data.authenticated ? data : null);
  }

  async function logout() {
    await adminApi.logout();
    setSession(null);
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
      {activeView === 'broadcast' ? <BroadcastView /> : null}
      {activeView === 'playlists' ? <PlaylistsView /> : null}
      {activeView === 'files' ? <FilesView /> : null}
      {activeView === 'schedules' ? <SchedulesView /> : null}
      {activeView === 'devices' ? <DevicesView /> : null}
      {activeView === 'tts' ? <TtsView /> : null}
    </Shell>
  );
}
