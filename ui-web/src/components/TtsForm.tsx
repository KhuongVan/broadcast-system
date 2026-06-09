import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AudioFile, TtsGenerateInput, TtsVoicesResponse } from '../lib/types';
import { DataState } from './DataState';

type TtsFormProps = {
  onGenerated?: (file: AudioFile) => void;
};

const initialForm: TtsGenerateInput = {
  title: '',
  text: '',
  voice: '',
  speed: '0',
};

export function TtsForm({ onGenerated }: TtsFormProps) {
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
      onGenerated?.(data.file);
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
    <>
      <DataState loading={loading} error={error} empty={!voices} emptyText="Chưa có cấu hình TTS." />
      {voices ? (
        <div className="tts-modern-wrapper">
          <div className="tts-modern-card">
            <h2 className="tts-modern-title">Chuyển đổi giọng nói</h2>
            <form className="tts-modern-form" onSubmit={generate}>
              <div className="tts-modern-field">
                <label>Tiêu đề file:</label>
                <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Ví dụ: Thông báo khẩn cấp" />
              </div>

              <div className="tts-modern-field">
                <label>Giọng đọc:</label>
                <select value={form.voice} onChange={(event) => update('voice', event.target.value)}>
                  {voices.voices.map((voice) => (
                    <option key={voice.code} value={voice.code}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tts-modern-field">
                <label>Tốc độ:</label>
                <select value={form.speed} onChange={(event) => update('speed', event.target.value)}>
                  <option value="-3">-3 (rất chậm)</option>
                  <option value="-2">-2 (chậm)</option>
                  <option value="-1">-1 (hơi chậm)</option>
                  <option value="0">Bình thường</option>
                  <option value="+1">+1 (hơi nhanh)</option>
                  <option value="+2">+2 (nhanh)</option>
                  <option value="+3">+3 (rất nhanh)</option>
                </select>
              </div>

              <div className="tts-modern-field tts-modern-textarea">
                <label>Nội dung:</label>
                <textarea
                  value={form.text}
                  onChange={(event) => update('text', event.target.value)}
                  placeholder="Nhập nội dung cần chuyển thành giọng nói..."
                  required
                  rows={7}
                />
              </div>

              <div className="tts-modern-info">
                Tạo xong sẽ lưu file MP3 vào Kho âm thanh.
              </div>

              <div className="tts-modern-actions">
                <button className="primary" disabled={saving || form.text.trim().length < 3 || !form.voice} type="submit">
                  {saving ? 'Đang tạo...' : 'Tạo âm thanh'}
                </button>
                <button className="danger" type="button" onClick={() => setForm(initialForm)}>
                  Hủy bỏ
                </button>
              </div>
              {message ? <div className="state compact">{message}</div> : null}
            </form>
          </div>
          
          {latestFile && (
            <div className="tts-modern-latest">
              <h3>File mới tạo</h3>
              <strong>{latestFile.originalName}</strong>
              <p className="subtext">{latestFile.storagePath}</p>
              <audio controls src={latestFile.url} />
              <p className="subtext">File này đã nằm trong Kho âm thanh và có thể thêm vào playlist/lịch phát.</p>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
