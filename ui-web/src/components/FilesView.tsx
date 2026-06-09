import { ChangeEvent, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { AudioFile } from '../lib/types';
import { Panel } from './Panel';

type FilesViewProps = {
  embedded?: boolean;
};

export function FilesView({ embedded = false }: FilesViewProps) {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

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
      setError(err instanceof Error ? err.message : 'Không upload được file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel
      title={embedded ? 'Kho âm thanh' : 'Kho âm thanh'}
      description="Upload và xem các file âm thanh đã lưu."
      actions={
        <label className="file-input">
          {uploading ? 'Đang upload...' : 'Upload MP3'}
          <input accept="audio/mpeg,.mp3" disabled={uploading} onChange={upload} type="file" />
        </label>
      }
    >
      {loading ? <div className="state">Đang tải dữ liệu...</div> : null}
      {error ? <div className="state error">{error}</div> : null}
      {!loading && !error && !files.length ? <div className="state">Chưa có file âm thanh.</div> : null}
      {!loading && files.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên file</th>
                <th>Định dạng</th>
                <th>Dung lượng</th>
                <th>Ngày tạo</th>
                <th>Nghe thử</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.fileId}>
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
        </div>
      ) : null}
    </Panel>
  );
}
