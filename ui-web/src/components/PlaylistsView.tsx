import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { AudioFile, Playlist, PlaylistItem } from '../lib/types';
import { DataState } from './DataState';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Pagination, paginate, usePagination } from './Pagination';

type PlaylistsViewProps = {
  embedded?: boolean;
};

type PlaylistModalMode = 'create' | 'edit';

type PendingFile = {
  fileId: string;
  originalName: string;
  size: number;
  playlistItemId?: string;
  sortOrder?: number;
};

export function PlaylistsView({ embedded = false }: PlaylistsViewProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [modalMode, setModalMode] = useState<PlaylistModalMode>('create');
  const [formName, setFormName] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const totalSelectedSize = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles],
  );
  const playlistPagination = usePagination(playlists.length);
  const pagedPlaylists = useMemo(
    () => paginate(playlists, playlistPagination.page, playlistPagination.pageSize),
    [playlistPagination.page, playlistPagination.pageSize, playlists],
  );

  async function load(preferredId?: string) {
    setLoading(true);
    setError('');
    try {
      const [playlistData, fileData] = await Promise.all([adminApi.listPlaylists(), adminApi.listFiles()]);
      setPlaylists(playlistData.playlists);
      setFiles(fileData.files);
      if (preferredId) {
        const updated = playlistData.playlists.find((playlist) => playlist.playlistId === preferredId) || null;
        if (updated) setEditingPlaylist(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách phát.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setModalMode('create');
    setEditingPlaylist(null);
    setFormName('');
    setSelectedFileId('');
    setSelectedFiles([]);
    setModalOpen(true);
  }

  function openEditModal(playlist: Playlist) {
    setModalMode('edit');
    setEditingPlaylist(playlist);
    setFormName(playlist.name);
    setSelectedFileId('');
    setSelectedFiles(playlist.items.map(toPendingFile));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingPlaylist(null);
    setFormName('');
    setSelectedFileId('');
    setSelectedFiles([]);
  }

  function addSelectedFile() {
    if (!selectedFileId) return;
    const file = files.find((item) => item.fileId === selectedFileId);
    if (!file) return;
    setSelectedFiles((current) => [...current, { fileId: file.fileId, originalName: file.originalName, size: file.size }]);
    setSelectedFileId('');
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function savePlaylist(event: FormEvent) {
    event.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (modalMode === 'create') {
        const data = await adminApi.createPlaylist(formName.trim());
        for (const file of selectedFiles) {
          await adminApi.addPlaylistItem(data.playlist.playlistId, file.fileId);
        }
        closeModal();
        await load(data.playlist.playlistId);
      } else if (editingPlaylist) {
        await adminApi.updatePlaylist(editingPlaylist.playlistId, formName.trim());
        const existingItemIds = new Set(editingPlaylist.items.map((item) => item.playlistItemId));
        const keptItemIds = new Set(selectedFiles.map((file) => file.playlistItemId).filter((value): value is string => Boolean(value)));

        for (const item of editingPlaylist.items) {
          if (!keptItemIds.has(item.playlistItemId)) {
            await adminApi.deletePlaylistItem(editingPlaylist.playlistId, item.playlistItemId);
          }
        }

        for (const file of selectedFiles) {
          if (!file.playlistItemId || !existingItemIds.has(file.playlistItemId)) {
            await adminApi.addPlaylistItem(editingPlaylist.playlistId, file.fileId);
          }
        }

        closeModal();
        await load(editingPlaylist.playlistId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được danh sách phát.');
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

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel
      title={embedded ? 'Danh sách phát' : 'Danh sách phát'}
      description="Tạo playlist, đổi tên và sắp file âm thanh dùng cho lịch phát."
      actions={
        <button className="primary" onClick={openCreateModal} type="button">
          Tạo danh sách phát mới
        </button>
      }
    >
      <DataState loading={loading} error={error} empty={!playlists.length} emptyText="Chưa có danh sách phát." />
      {!loading ? (
        <div className="playlist-page">
          <div className="table-wrap">
            <table className="playlist-table">
              <thead>
                <tr>
                  <th>Tên danh sách phát</th>
                  <th>Tổng số file</th>
                  <th>Tổng dung lượng</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pagedPlaylists.map((playlist) => (
                  <tr key={playlist.playlistId}>
                    <td>
                      <strong>{playlist.name}</strong>
                    </td>
                    <td>{playlist.totalFiles}</td>
                    <td>{formatBytes(playlist.totalSize)}</td>
                    <td>{formatDateTime(playlist.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="primary" disabled={saving} onClick={() => openEditModal(playlist)} type="button">
                          Chỉnh sửa
                        </button>
                        <button className="danger" disabled={saving} onClick={() => void deletePlaylist(playlist.playlistId)} type="button">
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={playlistPagination.page} pageSize={playlistPagination.pageSize} totalItems={playlists.length} onPageChange={playlistPagination.setPage} />
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <Modal title={modalMode === 'create' ? 'Thêm mới danh sách phát' : 'Chỉnh sửa danh sách phát'} onClose={closeModal}>
          <form className="form-panel playlist-modal-form" onSubmit={savePlaylist}>
            <label>
              Tên phát <span className="required">*</span>
              <input value={formName} onChange={(event) => setFormName(event.target.value)} required />
            </label>
            <div className="form-grid">
              <label>
                Số lượng file
                <input readOnly value={selectedFiles.length} />
              </label>
              <label>
                Tổng dung lượng
                <input readOnly value={formatBytes(totalSelectedSize)} />
              </label>
            </div>
            <label>
              Chọn file âm thanh
              <div className="playlist-file-picker">
                <select value={selectedFileId} onChange={(event) => setSelectedFileId(event.target.value)}>
                  <option value="">{files.length ? 'Chọn file âm thanh' : 'Kho âm thanh chưa có file'}</option>
                  {files.map((file) => (
                    <option key={file.fileId} value={file.fileId}>
                      {file.originalName} · {formatBytes(file.size)}
                    </option>
                  ))}
                </select>
                <button className="primary" disabled={saving || !selectedFileId} onClick={addSelectedFile} type="button">
                  Thêm file
                </button>
              </div>
            </label>

            <div className="playlist-file-list">
              {selectedFiles.length ? selectedFiles.map((file, index) => (
                <div className="playlist-file-row" key={`${file.playlistItemId || file.fileId}-${index}`}>
                  <div>
                    <strong>{file.originalName}</strong>
                    <div className="subtext">
                      Thứ tự {file.sortOrder ?? index} · {formatBytes(file.size)}
                    </div>
                  </div>
                  <button className="danger" disabled={saving} onClick={() => removeSelectedFile(index)} type="button">
                    Xóa
                  </button>
                </div>
              )) : (
                <div className="state compact">Chưa chọn file nào. Có thể lưu playlist rỗng.</div>
              )}
            </div>

            <div className="modal-footer">
              <button className="primary" disabled={saving || !formName.trim()}>
                Lưu
              </button>
              <button className="danger" onClick={closeModal} type="button">
                Hủy bỏ
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

function toPendingFile(item: PlaylistItem): PendingFile {
  return {
    fileId: item.fileId,
    originalName: item.file.originalName,
    size: item.file.size,
    playlistItemId: item.playlistItemId,
    sortOrder: item.sortOrder,
  };
}
