import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { adminApi } from '../lib/api';
import type { AppUser, Commune, Device } from '../lib/types';
import { Panel } from './Panel';
import { useToast } from './Toast';

const emptyCommuneForm = { name: '', code: '', status: 'ACTIVE' as const };
const emptyUserForm = {
  username: '',
  accountCode: '',
  password: '',
  displayName: '',
  role: 'COMMUNE_USER',
  communeId: '',
  active: true,
};

export function SystemAdminView() {
  const { showToast } = useToast();
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [communeForm, setCommuneForm] = useState(emptyCommuneForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [provisioningToken, setProvisioningToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const activeCommunes = useMemo(() => communes.filter((commune) => commune.status === 'ACTIVE'), [communes]);
  const selectedCommune = useMemo(
    () => communes.find((commune) => commune.communeId === userForm.communeId) || null,
    [communes, userForm.communeId],
  );
  const generatedCommuneUsername = useMemo(() => {
    if (userForm.role !== 'COMMUNE_USER' || !selectedCommune) return '';
    const prefix = slugUsernamePart(selectedCommune.code);
    const accountCode = slugUsernamePart(userForm.accountCode);
    return prefix && accountCode ? `${prefix}_${accountCode}` : '';
  }, [selectedCommune, userForm.accountCode, userForm.role]);

  useEffect(() => {
    loadData().catch((error) => showToast({ message: error instanceof Error ? error.message : 'Không tải được dữ liệu.' }));
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [communeData, userData, deviceData] = await Promise.all([
        adminApi.listCommunes(),
        adminApi.listUsers(),
        adminApi.listDevices(),
      ]);
      setCommunes(communeData.communes);
      setUsers(userData.users);
      setDevices(deviceData.devices);
      setSelectedDeviceId((current) => current || deviceData.devices[0]?.deviceId || '');
    } finally {
      setLoading(false);
    }
  }

  async function createCommune(event: FormEvent) {
    event.preventDefault();
    await adminApi.createCommune(communeForm);
    setCommuneForm(emptyCommuneForm);
    await loadData();
    showToast({ type: 'success', message: 'Đã tạo xã.' });
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const username = userForm.role === 'SYSTEM_ADMIN' ? slugUsernamePart(userForm.username) : generatedCommuneUsername;
    await adminApi.createUser({
      username,
      password: userForm.password,
      displayName: userForm.displayName || null,
      role: userForm.role,
      communeId: userForm.role === 'SYSTEM_ADMIN' ? null : userForm.communeId,
      active: userForm.active,
    });
    setUserForm(emptyUserForm);
    await loadData();
    showToast({ type: 'success', message: 'Đã tạo user.' });
  }

  async function toggleUser(user: AppUser) {
    await adminApi.updateUser(user.userId, {
      displayName: user.displayName,
      role: user.role,
      communeId: user.communeId,
      active: !user.active,
    });
    await loadData();
  }

  async function resetPassword(user: AppUser) {
    const password = window.prompt(`Nhập mật khẩu mới cho ${user.username} (ít nhất 8 ký tự)`);
    if (!password) return;
    await adminApi.resetUserPassword(user.userId, password);
    showToast({ type: 'success', message: 'Đã đặt lại mật khẩu.' });
  }

  async function createProvisioningToken(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeviceId) return;
    const data = await adminApi.createDeviceProvisioningToken(selectedDeviceId);
    setProvisioningToken({ token: data.provisioningToken, expiresAt: data.expiresAt });
    await loadData();
  }

  return (
    <div className="system-admin-grid">
      <Panel title="Xã" description="Tạo và quản lý đơn vị xã">
        <form className="inline-form" onSubmit={(event) => void createCommune(event)}>
          <input value={communeForm.name} onChange={(event) => setCommuneForm({ ...communeForm, name: event.target.value })} placeholder="Tên xã" required />
          <input value={communeForm.code} onChange={(event) => setCommuneForm({ ...communeForm, code: event.target.value })} placeholder="Mã xã" required />
          <button type="submit">Tạo xã</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tên xã</th><th>Mã</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {communes.map((commune) => (
                <tr key={commune.communeId}><td>{commune.name}</td><td>{commune.code}</td><td>{commune.status}</td></tr>
              ))}
              {!communes.length && !loading ? <tr><td colSpan={3}>Chưa có xã.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="User" description="Tạo tài khoản hệ thống và tài khoản xã">
        <form className="admin-user-form" onSubmit={(event) => void createUser(event)}>
          <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
            <option value="COMMUNE_USER">User xã</option>
            <option value="SYSTEM_ADMIN">Admin hệ thống</option>
          </select>
          <select value={userForm.communeId} onChange={(event) => setUserForm({ ...userForm, communeId: event.target.value })} disabled={userForm.role === 'SYSTEM_ADMIN'} required={userForm.role !== 'SYSTEM_ADMIN'}>
            <option value="">Chọn xã</option>
            {activeCommunes.map((commune) => <option key={commune.communeId} value={commune.communeId}>{formatCommuneOption(commune)}</option>)}
          </select>
          {userForm.role === 'SYSTEM_ADMIN' ? (
            <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="Username admin" required />
          ) : (
            <label className="generated-username-field">
              <input value={userForm.accountCode} onChange={(event) => setUserForm({ ...userForm, accountCode: event.target.value })} placeholder="Mã tài khoản, VD: vanhanh01" required />
              <span>{generatedCommuneUsername || 'Chọn xã và nhập mã tài khoản'}</span>
            </label>
          )}
          <input value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} placeholder="Tên hiển thị" />
          <input value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Mật khẩu ban đầu" type="password" required />
          <button disabled={userForm.role === 'COMMUNE_USER' && !generatedCommuneUsername} type="submit">Tạo user</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Xã</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>{user.displayName || user.username}<div className="subtext">{user.username}</div></td>
                  <td>{user.role}</td>
                  <td>{user.communeName || '-'}</td>
                  <td>{user.active ? 'Đang hoạt động' : 'Đã khóa'}</td>
                  <td className="row-actions">
                    <button className="ghost" onClick={() => void toggleUser(user)} type="button">{user.active ? 'Khóa' : 'Mở'}</button>
                    <button className="ghost" onClick={() => void resetPassword(user)} type="button">Reset mật khẩu</button>
                  </td>
                </tr>
              ))}
              {!users.length && !loading ? <tr><td colSpan={5}>Chưa có user.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Provisioning thiết bị" description="Sinh token một lần cho app Android đăng ký">
        <form className="inline-form" onSubmit={(event) => void createProvisioningToken(event)}>
          <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} required>
            <option value="">Chọn thiết bị</option>
            {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.name} - {device.area}</option>)}
          </select>
          <button type="submit">Sinh token</button>
        </form>
        {provisioningToken ? (
          <div className="token-box">
            <code>{provisioningToken.token}</code>
            <span>Hết hạn: {new Date(provisioningToken.expiresAt).toLocaleString('vi-VN')}</span>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function formatCommuneOption(commune: Commune) {
  return `${commune.name} (${commune.code})`;
}

function slugUsernamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}
