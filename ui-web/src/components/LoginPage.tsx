import { FormEvent, useState } from 'react';
import { adminApi } from '../lib/api';

type LoginPageProps = {
  onLoggedIn: () => void;
};

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await adminApi.login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng nhập được.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        <p className="login-brand">Phát thanh nhanh</p>
        <h1>Đăng nhập quản trị</h1>
        <label>
          Tên đăng nhập
          <input
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary" disabled={submitting}>
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        {error ? <div className="form-error">{error}</div> : null}
      </form>
    </main>
  );
}
