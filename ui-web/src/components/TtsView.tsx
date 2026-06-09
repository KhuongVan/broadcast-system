import { Panel } from './Panel';
import { TtsForm } from './TtsForm';

export function TtsView() {
  return (
    <Panel title="TTS" description="Tạo file âm thanh từ văn bản bằng provider đã cấu hình trên backend.">
      <TtsForm />
    </Panel>
  );
}
