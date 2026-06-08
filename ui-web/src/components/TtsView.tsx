import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AudioFile, TtsGenerateInput, TtsVoicesResponse } from '../lib/types';
import { DataState } from './DataState';
import { Panel } from './Panel';

const initialForm: TtsGenerateInput = {
  title: '',
  text: '',
  voice: '',
  speed: '0',
};

export function TtsView() {
  const [voices, setVoices] = useState<TtsVoicesResponse | null>(null);
  const [form, setForm] = useState<TtsGenerateInput>(initialForm);
  const [latestFile, setLatestFile] = useState<AudioFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.listTtsVoices();
      setVoices(data);
      setForm((current) => ({
        ...current,
        voice: current.voice || data.defaultVoice || data.voices[0]?.code || '',
        speed: current.speed || data.defaultSpeed || '0',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được cấu hình TTS.');
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof TtsGenerateInput>(key: K, value: TtsGenerateInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await adminApi.generateTts({
        ...form,
        title: form.title.trim(),
        text: form.text.trim(),
      });
      setLatestFile(data.file);
      setMessage(`Đã tạo file ${data.file.originalName} (${data.characters} ký tự).`);
      setForm((current) => ({ ...current, title: '', text: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được file TTS.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel title="TTS" description="Tạo file âm thanh từ văn bản bằng provider đã cấu hình trên backend.">
      <DataState loading={loading} error={error} empty={!voices} emptyText="Chưa có cấu hình TTS." />
      {voices ? (
        <div className="broadcast-grid">
          <form className="detail-panel form-panel" onSubmit={generate}>
            <h3>Tạo audio</h3>
            <label>
              Tên file
              <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Ví dụ: Thông báo sáng" />
            </label>
            <div className="form-grid">
              <label>
                Giọng đọc
                <select value={form.voice} onChange={(event) => update('voice', event.target.value)}>
                  {voices.voices.map((voice) => (
                    <option key={voice.code} value={voice.code}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tốc độ
                <select value={form.speed} onChange={(event) => update('speed', event.target.value)}>
                  <option value="-3">-3 rất chậm</option>
                  <option value="-2">-2 chậm</option>
                  <option value="-1">-1 hơi chậm</option>
                  <option value="0">0 mặc định</option>
                  <option value="+1">+1 hơi nhanh</option>
                  <option value="+2">+2 nhanh</option>
                  <option value="+3">+3 rất nhanh</option>
                </select>
              </label>
            </div>
            <label>
              Nội dung
              <textarea
                value={form.text}
                onChange={(event) => update('text', event.target.value)}
                placeholder="Nhập nội dung cần chuyển thành giọng nói..."
                required
                rows={9}
              />
            </label>
            <div className="row-actions">
              <button className="primary" disabled={saving || form.text.trim().length < 3 || !form.voice}>
                {saving ? 'Đang tạo...' : 'Tạo file TTS'}
              </button>
            </div>
            {message ? <div className="state compact">{message}</div> : null}
          </form>

          <div className="detail-panel form-panel">
            <h3>File mới tạo</h3>
            {latestFile ? (
              <>
                <strong>{latestFile.originalName}</strong>
                <p className="subtext">{latestFile.storagePath}</p>
                <audio controls src={latestFile.url} />
                <p className="subtext">File này đã nằm trong Kho âm thanh và có thể thêm vào playlist/lịch phát.</p>
              </>
            ) : (
              <div className="state compact">Chưa tạo file trong phiên này.</div>
            )}
            <p className="subtext">Provider: {voices.provider}. Giọng mặc định: {voices.defaultVoice}.</p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
