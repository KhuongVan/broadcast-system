import { BadRequestException, Injectable } from '@nestjs/common';
import { AudioFilesService } from '../audio-files/audio-files.service';
import { config } from '../config';
import { GenerateTtsInput, TtsVoice } from './tts.types';

const FPT_TTS_URL = 'https://api.fpt.ai/hmi/tts/v5';
const FPT_REQUEST_TIMEOUT_MS = 15000;
const FPT_DOWNLOAD_TIMEOUT_MS = 15000;

const FPT_VOICES: TtsVoice[] = [
  { code: 'banmai', label: 'Ban Mai - Nữ miền Bắc' },
  { code: 'thuminh', label: 'Thu Minh - Nữ miền Bắc' },
  { code: 'leminh', label: 'Lê Minh - Nam miền Bắc' },
  { code: 'myan', label: 'Mỹ An - Nữ miền Trung' },
  { code: 'giahuy', label: 'Gia Huy - Nam miền Trung' },
  { code: 'lannhi', label: 'Lan Nhi - Nữ miền Nam' },
  { code: 'linhsan', label: 'Linh San - Nữ miền Nam' },
];

@Injectable()
export class TtsService {
  constructor(private readonly audioFiles: AudioFilesService) {}

  listVoices() {
    return {
      provider: config.ttsProvider,
      defaultVoice: config.fptTtsDefaultVoice,
      defaultSpeed: config.fptTtsSpeed,
      voices: FPT_VOICES,
    };
  }

  async generate(input: GenerateTtsInput) {
    if (config.ttsProvider !== 'fpt') {
      throw new BadRequestException('He thong hien chi ho tro provider FPT.AI.');
    }

    if (!config.fptTtsApiKey) {
      throw new BadRequestException('Chua cau hinh FPT_TTS_API_KEY.');
    }

    const text = String(input.text || '').trim();
    if (text.length < 3) throw new BadRequestException('Noi dung can it nhat 3 ky tu.');
    if (text.length > 5000) throw new BadRequestException('FPT.AI gioi han toi da 5000 ky tu moi lan tao.');

    const voice = String(input.voice || config.fptTtsDefaultVoice).trim();
    if (!FPT_VOICES.some((item) => item.code === voice)) {
      throw new BadRequestException('Giong doc khong hop le.');
    }

    const speed = this.normalizeSpeed(input.speed || config.fptTtsSpeed);
    const title = this.safeAudioTitle(input.title || text.slice(0, 48));
    const audioUrl = await this.requestFptAudioUrl(text, voice, speed);
    const audioBuffer = await this.downloadFptAudio(audioUrl);
    const originalName = `${title}.mp3`;

    const file = {
      fieldname: 'mp3',
      originalname: originalName,
      encoding: '7bit',
      mimetype: 'audio/mpeg',
      buffer: audioBuffer,
      size: audioBuffer.length,
    } as Express.Multer.File;

    const record = await this.audioFiles.registerUpload(file);
    return { file: record, voice, speed, characters: text.length };
  }

  private async requestFptAudioUrl(text: string, voice: string, speed: string) {
    const response = await this.fetchWithBadRequest(
      FPT_TTS_URL,
      {
        method: 'POST',
        headers: {
          api_key: config.fptTtsApiKey,
          voice,
          speed,
          format: config.fptTtsFormat || 'mp3',
          'Cache-Control': 'no-cache',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: text,
        signal: AbortSignal.timeout(FPT_REQUEST_TIMEOUT_MS),
      },
      'Khong ket noi duoc FPT.AI TTS.',
    );

    if (!response.ok) {
      const message = await this.readResponseMessage(response);
      throw new BadRequestException(message || `FPT.AI khong phan hoi thanh cong: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { async?: string; error?: number; message?: string };
    if (Number(data.error) !== 0 || !data.async) {
      throw new BadRequestException(data.message || 'FPT.AI khong tao duoc audio.');
    }

    return data.async;
  }

  private async downloadFptAudio(audioUrl: string) {
    let lastMessage = '';

    for (let attempt = 1; attempt <= config.fptTtsPollAttempts; attempt += 1) {
      const response = await this.fetchWithBadRequest(
        audioUrl,
        { signal: AbortSignal.timeout(FPT_DOWNLOAD_TIMEOUT_MS) },
        'Khong tai duoc file audio tu FPT.AI.',
      );
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (this.isFptAudioResponse(buffer, contentType, audioUrl)) {
          return buffer;
        }
        lastMessage = this.readBufferMessage(buffer, contentType) || 'Link FPT.AI da phan hoi nhung chua phai file audio.';
      } else {
        lastMessage = `FPT.AI dang xu ly audio (HTTP ${response.status}).`;
      }

      await this.delay(config.fptTtsPollDelayMs);
    }

    throw new BadRequestException(lastMessage || 'FPT.AI chua san sang file audio, vui long thu lai.');
  }

  private normalizeSpeed(speed: string) {
    const value = String(speed || '0').trim();
    if (!['-3', '-2', '-1', '0', '+1', '+2', '+3', '1', '2', '3'].includes(value)) {
      throw new BadRequestException('Toc do doc khong hop le.');
    }
    return value.startsWith('+') || value.startsWith('-') || value === '0' ? value : `+${value}`;
  }

  private safeAudioTitle(title: string) {
    const value = String(title || 'tts-audio')
      .trim()
      .replace(/[^a-zA-Z0-9\u00C0-\u1EF9._ -]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    return value || `tts-${Date.now()}`;
  }

  private async fetchWithBadRequest(url: string, init: RequestInit, fallbackMessage: string) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError' ? `${fallbackMessage} Qua thoi gian cho.` : fallbackMessage;
      throw new BadRequestException(message);
    }
  }

  private async readResponseMessage(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      return payload?.message || payload?.error || '';
    }

    return response.text().catch(() => '');
  }

  private isFptAudioResponse(buffer: Buffer, contentType: string, audioUrl: string) {
    if (buffer.length === 0) return false;

    const normalizedType = contentType.toLowerCase();
    return (
      normalizedType.includes('audio') ||
      normalizedType.includes('octet-stream') ||
      audioUrl.toLowerCase().includes('.mp3') ||
      this.isMp3Buffer(buffer)
    );
  }

  private isMp3Buffer(buffer: Buffer) {
    return (
      buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
      (buffer.length >= 2 && buffer[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(buffer[1]))
    );
  }

  private readBufferMessage(buffer: Buffer, contentType: string) {
    const normalizedType = contentType.toLowerCase();
    if (!normalizedType.includes('json') && !normalizedType.includes('text')) return '';

    return buffer.toString('utf8').slice(0, 300);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
