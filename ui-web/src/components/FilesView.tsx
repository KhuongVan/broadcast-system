import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { AudioFile } from '../lib/types';
import { Modal } from './Modal';
import { Panel } from './Panel';
import { Pagination, paginate, usePagination } from './Pagination';
import { TtsForm } from './TtsForm';
import { useToast } from './Toast';

type FilesViewProps = {
  embedded?: boolean;
};

export function FilesView({ embedded = false }: FilesViewProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filteredFiles = useMemo(() => {
    const keyword = normalizeSearchText(search);
    if (!keyword) return files;
    return files.filter((file) => normalizeSearchText(file.originalName).includes(keyword));
  }, [files, search]);
  const filePagination = usePagination(filteredFiles.length);
  const pagedFiles = useMemo(() => paginate(filteredFiles, filePagination.page, filePagination.pageSize), [filePagination.page, filePagination.pageSize, filteredFiles]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.listFiles();
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được kho âm thanh.');
    } finally {
      setLoading(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      await adminApi.uploadFile(file);
      await load();
    } catch (err) {
      const message = getErrorMessage(err, 'Không upload được file.');
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    filePagination.setPage(1);
  }, [filePagination.setPage, search]);

  return (
    <Panel
      title={embedded ? 'Kho âm thanh' : 'Kho âm thanh'}
      description="Upload và xem các file âm thanh đã lưu."
      actions={
        <div className="file-actions">
          <button className="primary" onClick={() => setTtsModalOpen(true)} type="button">
            Tạo âm thanh từ văn bản
          </button>
          <label className="file-input">
            {uploading ? 'Đang upload...' : 'Upload MP3'}
            <input accept="audio/mpeg,.mp3" disabled={uploading} onChange={upload} type="file" />
          </label>
        </div>
      }
    >
      {ttsModalOpen ? (
        <Modal title="Tạo âm thanh từ văn bản" onClose={() => setTtsModalOpen(false)}>
          <TtsForm onGenerated={() => void load()} />
        </Modal>
      ) : null}
      {loading ? <div className="state">Đang tải dữ liệu...</div> : null}
      {error ? <div className="state error">{error}</div> : null}
      {!loading && !error && !files.length ? <div className="state">Chưa có file âm thanh.</div> : null}
      {!loading && !error && files.length ? (
        <div className="section-toolbar search-only">
          <div className="toolbar-row">
            <input
              aria-label="Tìm theo tên file âm thanh"
              placeholder="Tìm theo tên file âm thanh..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      ) : null}
      {!loading && !error && files.length && !filteredFiles.length ? <div className="state">Không tìm thấy file âm thanh phù hợp.</div> : null}
      {!loading && filteredFiles.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên file</th>
                <th>Định dạng</th>
                <th>Dung lượng</th>
                <th>Ngày tạo</th>
                <th>Nghe thử</th>
              </tr>
            </thead>
            <tbody>
              {pagedFiles.map((file, index) => (
                <tr key={file.fileId}>
                  <td>{(filePagination.page - 1) * filePagination.pageSize + index + 1}</td>
                  <td>
                    <strong>{file.originalName}</strong>
                    <div className="subtext">{file.storagePath}</div>
                  </td>
                  <td>{file.mimetype}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td>{formatDateTime(file.createdAt)}</td>
                  <td>
                    <audio controls src={file.url} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={filePagination.page} pageSize={filePagination.pageSize} totalItems={filteredFiles.length} onPageChange={filePagination.setPage} />
        </div>
      ) : null}
    </Panel>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
