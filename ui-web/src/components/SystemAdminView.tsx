import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { adminApi } from '../lib/api';
import type { AppUser, Commune, Device } from '../lib/types';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { useToast } from './Toast';

type SystemAdminModal = 'commune' | 'user' | 'provisioning' | null;

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
  const [activeModal, setActiveModal] = useState<SystemAdminModal>(null);

  const activeCommunes = useMemo(() => communes.filter((commune) => commune.status === 'ACTIVE'), [communes]);
  const communeById = useMemo(() => new Map(communes.map((commune) => [commune.communeId, commune])), [communes]);
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
    setActiveModal(null);
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
    setActiveModal(null);
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

  function openProvisioningModal(deviceId?: string) {
    setProvisioningToken(null);
    setSelectedDeviceId(deviceId || selectedDeviceId || devices[0]?.deviceId || '');
    setActiveModal('provisioning');
  }

  function closeModal() {
    setActiveModal(null);
    setProvisioningToken(null);
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
    <>
      <div className="system-admin-grid">
        <div className="system-admin-summary">
          <div>
            <span>Đơn vị</span>
            <strong>{communes.length}</strong>
            <small>{activeCommunes.length} đang hoạt động</small>
          </div>
          <div>
            <span>User</span>
            <strong>{users.length}</strong>
            <small>{users.filter((user) => user.active).length} đang hoạt động</small>
          </div>
          <div>
            <span>Thiết bị</span>
            <strong>{devices.length}</strong>
            <small>{devices.filter((device) => device.provisionedAt).length} đã đăng ký</small>
          </div>
        </div>

        <Panel
          title="Đơn vị phường/xã"
          description="Danh sách đơn vị đang quản lý"
          actions={<button className="primary" onClick={() => setActiveModal('commune')} type="button">Tạo đơn vị</button>}
        >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tên đơn vị</th><th>Mã</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {communes.map((commune) => (
                <tr key={commune.communeId}><td>{commune.name}</td><td>{commune.code}</td><td>{commune.status}</td></tr>
              ))}
              {!communes.length && !loading ? <tr><td colSpan={3}>Chưa có đơn vị.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Tài khoản"
        description="Danh sách tài khoản hệ thống và tài khoản đơn vị"
        actions={<button className="primary" onClick={() => setActiveModal('user')} type="button">Tạo user</button>}
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Đơn vị</th><th>Trạng thái</th><th></th></tr></thead>
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

      <Panel
        title="Thiết bị & provisioning"
        description="Danh sách thiết bị và token đăng ký Android"
        actions={<button className="primary" disabled={!devices.length} onClick={() => openProvisioningModal()} type="button">Sinh token</button>}
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Thiết bị</th><th>MAC</th><th>Địa bàn</th><th>Đơn vị</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.deviceId}>
                  <td>{device.name}</td>
                  <td>{device.macAddress || '-'}</td>
                  <td>{device.area || '-'}</td>
                  <td>{device.communeId ? communeById.get(device.communeId)?.name || '-' : '-'}</td>
                  <td>{device.provisionedAt ? 'Đã đăng ký' : device.provisioningExpiresAt ? 'Đã sinh token' : 'Chưa đăng ký'}</td>
                  <td className="row-actions">
                    <button className="ghost" onClick={() => openProvisioningModal(device.deviceId)} type="button">Sinh token</button>
                  </td>
                </tr>
              ))}
              {!devices.length && !loading ? <tr><td colSpan={6}>Chưa có thiết bị.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>
      </div>

      {activeModal === 'commune' ? (
        <Modal title="Tạo đơn vị phường/xã" onClose={closeModal}>
          <form className="form-panel system-admin-modal-form" onSubmit={(event) => void createCommune(event)}>
            <label>
              Tên đơn vị
              <input value={communeForm.name} onChange={(event) => setCommuneForm({ ...communeForm, name: event.target.value })} placeholder="VD: Phường Gò Vấp" required />
            </label>
            <label>
              Mã đơn vị
              <input value={communeForm.code} onChange={(event) => setCommuneForm({ ...communeForm, code: event.target.value })} placeholder="VD: HCM_GOVAP" required />
            </label>
            <div className="modal-footer">
              <button className="primary" type="submit">Tạo đơn vị</button>
              <button className="ghost" onClick={closeModal} type="button">Hủy</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'user' ? (
        <Modal title="Tạo user" onClose={closeModal}>
          <form className="form-panel system-admin-modal-form" onSubmit={(event) => void createUser(event)}>
            <label>
              Loại tài khoản
              <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
                <option value="COMMUNE_USER">User xã</option>
                <option value="SYSTEM_ADMIN">Admin hệ thống</option>
              </select>
            </label>
            <label>
              Đơn vị
              <select value={userForm.communeId} onChange={(event) => setUserForm({ ...userForm, communeId: event.target.value })} disabled={userForm.role === 'SYSTEM_ADMIN'} required={userForm.role !== 'SYSTEM_ADMIN'}>
                <option value="">Chọn đơn vị</option>
                {activeCommunes.map((commune) => <option key={commune.communeId} value={commune.communeId}>{formatCommuneOption(commune)}</option>)}
              </select>
            </label>
            {userForm.role === 'SYSTEM_ADMIN' ? (
              <label>
                Username admin
                <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="VD: sysadmin" required />
              </label>
            ) : (
              <label className="generated-username-field">
                Mã tài khoản
                <input value={userForm.accountCode} onChange={(event) => setUserForm({ ...userForm, accountCode: event.target.value })} placeholder="VD: vanhanh01" required />
                <span>{generatedCommuneUsername || 'Chọn đơn vị và nhập mã tài khoản'}</span>
              </label>
            )}
            <label>
              Tên hiển thị
              <input value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} placeholder="VD: Trực ban phường" />
            </label>
            <label>
              Mật khẩu ban đầu
              <input value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Ít nhất 8 ký tự" type="password" required />
            </label>
            <div className="modal-footer">
              <button className="primary" disabled={userForm.role === 'COMMUNE_USER' && !generatedCommuneUsername} type="submit">Tạo user</button>
              <button className="ghost" onClick={closeModal} type="button">Hủy</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'provisioning' ? (
        <Modal title="Sinh provisioning token" onClose={closeModal}>
          <form className="form-panel system-admin-modal-form" onSubmit={(event) => void createProvisioningToken(event)}>
            <label>
              Thiết bị
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} required>
                <option value="">Chọn thiết bị</option>
                {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.name} - {device.macAddress}</option>)}
              </select>
            </label>
            <div className="modal-footer">
              <button className="primary" disabled={!selectedDeviceId} type="submit">Sinh token</button>
              <button className="ghost" onClick={closeModal} type="button">Đóng</button>
            </div>
          </form>
          {provisioningToken ? (
            <div className="token-box system-admin-token-box">
              <span>Provisioning token</span>
              <code>{provisioningToken.token}</code>
              <small>Hết hạn: {new Date(provisioningToken.expiresAt).toLocaleString('vi-VN')}</small>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
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
