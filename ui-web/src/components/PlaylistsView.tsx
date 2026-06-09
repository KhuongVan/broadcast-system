import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { AudioFile, Playlist } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';

type PlaylistsViewProps = {
  embedded?: boolean;
};

export function PlaylistsView({ embedded = false }: PlaylistsViewProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [fileId, setFileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => playlists.find((playlist) => playlist.playlistId === selectedId) || playlists[0] || null,
    [playlists, selectedId],
  );

  async function load(preferredId?: string) {
    setLoading(true);
    setError('');
    try {
      const [playlistData, fileData] = await Promise.all([adminApi.listPlaylists(), adminApi.listFiles()]);
      setPlaylists(playlistData.playlists);
      setFiles(fileData.files);
      const nextSelected = preferredId || selectedId;
      setSelectedId(
        playlistData.playlists.some((playlist) => playlist.playlistId === nextSelected)
          ? nextSelected
          : playlistData.playlists[0]?.playlistId || '',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách phát.');
    } finally {
      setLoading(false);
    }
  }

  async function createPlaylist(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await adminApi.createPlaylist(name.trim());
      setName('');
      await load(data.playlist.playlistId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được danh sách phát.');
    } finally {
      setSaving(false);
    }
  }

  async function renamePlaylist(event: FormEvent) {
    event.preventDefault();
    if (!selected || !newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.updatePlaylist(selected.playlistId, newName.trim());
      setNewName('');
      await load(selected.playlistId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đổi tên được danh sách phát.');
    } finally {
      setSaving(false);
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!selected || !fileId) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.addPlaylistItem(selected.playlistId, fileId);
      setFileId('');
      await load(selected.playlistId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thêm được file vào danh sách phát.');
    } finally {
      setSaving(false);
    }
  }

  async function deletePlaylist(playlistId: string) {
    if (!confirm('Xóa danh sách phát này?')) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deletePlaylist(playlistId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được danh sách phát.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(playlistItemId: string) {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await adminApi.deletePlaylistItem(selected.playlistId, playlistItemId);
      await load(selected.playlistId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được file khỏi danh sách phát.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel
      title={embedded ? 'Danh sách phát' : 'Danh sách phát'}
      description="Tạo playlist, đổi tên và sắp file âm thanh dùng cho lịch phát."
      actions={
        <form className="inline-form" onSubmit={createPlaylist}>
          <input
            placeholder="Tên danh sách phát"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="primary" disabled={saving || !name.trim()}>
            Tạo
          </button>
        </form>
      }
    >
      <DataState loading={loading} error={error} empty={!playlists.length} />
      {!loading && playlists.length ? (
        <div className="split-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Số file</th>
                  <th>Dung lượng</th>
                  <th>Cập nhật</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {playlists.map((playlist) => (
                  <tr className={playlist.playlistId === selected?.playlistId ? 'selected-row' : ''} key={playlist.playlistId}>
                    <td>
                      <button className="link-button" onClick={() => setSelectedId(playlist.playlistId)} type="button">
                        {playlist.name}
                      </button>
                    </td>
                    <td>{playlist.totalFiles}</td>
                    <td>{formatBytes(playlist.totalSize)}</td>
                    <td>{formatDateTime(playlist.updatedAt)}</td>
                    <td>
                      <button className="danger" disabled={saving} onClick={() => deletePlaylist(playlist.playlistId)} type="button">
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected ? (
            <div className="detail-panel">
              <h3>{selected.name}</h3>
              <p className="subtext">{selected.totalFiles} file, {formatBytes(selected.totalSize)}</p>
              <form className="stack-form" onSubmit={renamePlaylist}>
                <label>
                  Đổi tên
                  <input
                    placeholder={selected.name}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </label>
                <button className="ghost" disabled={saving || !newName.trim()}>
                  Lưu tên
                </button>
              </form>

              <form className="stack-form" onSubmit={addItem}>
                <label>
                  Thêm file
                  <select value={fileId} onChange={(event) => setFileId(event.target.value)}>
                    <option value="">Chọn file âm thanh</option>
                    {files.map((file) => (
                      <option key={file.fileId} value={file.fileId}>
                        {file.originalName}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" disabled={saving || !fileId}>
                  Thêm vào playlist
                </button>
              </form>

              <div className="mini-list">
                {selected.items.length ? selected.items.map((item) => (
                  <div className="mini-list-item" key={item.playlistItemId}>
                    <div>
                      <strong>{item.file.originalName}</strong>
                      <div className="subtext">Thứ tự {item.sortOrder} · {formatBytes(item.file.size)}</div>
                    </div>
                    <button className="danger" disabled={saving} onClick={() => deleteItem(item.playlistItemId)} type="button">
                      Xóa
                    </button>
                  </div>
                )) : <div className="state compact">Playlist chưa có file.</div>}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
