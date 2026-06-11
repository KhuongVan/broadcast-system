import { Injectable } from '@nestjs/common';
import { ChildProcessByStdio, spawn } from 'child_process';
import { Readable, Writable } from 'stream';
import { config } from '../config';
import { AudioFilesService } from '../audio-files/audio-files.service';

export type StreamTestResult = {
  success: boolean;
  message: string;
};

export type MediaStopInfo = {
  type: 'MIC' | 'FILE' | 'RTSP';
  version: number;
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type MediaStreamState = {
  type: 'MIC' | 'FILE' | 'RTSP';
  process: ChildProcessByStdio<Writable, null, Readable>;
  version: number;
  fileId?: string;
  startedAt: number;
  hlsReady: boolean;
  stderrTail: string;
};

@Injectable()
export class MediaService {
  private activeStream: MediaStreamState | null = null;
  private lastStoppedStreamStderrTail = '';
  private streamVersion = 0;
  private filePlaybackPositions = new Map<string, number>();

  constructor(private readonly audioFiles: AudioFilesService) {}

  getActiveStream() {
    return this.activeStream;
  }

  writeMicChunk(chunk: Buffer) {
    if (!this.activeStream || this.activeStream.type !== 'MIC') return;

    const stdin = this.activeStream.process.stdin;
    if (!stdin.destroyed && !stdin.writableEnded) {
      stdin.write(chunk);
    }
  }

  stop(reason = 'manual') {
    if (!this.activeStream) return false;

    const stream = this.activeStream;
    this.rememberFilePosition(stream);
    this.activeStream = null;

    if (!stream.process.stdin.destroyed) {
      stream.process.stdin.end();
    }

    if (!stream.process.killed) {
      stream.process.kill('SIGTERM');
      setTimeout(() => {
        if (stream.process.exitCode === null && !stream.process.signalCode) {
          stream.process.kill('SIGKILL');
        }
      }, 1500);
    }

    console.log(`STOP reason=${reason}`);
    return true;
  }

  async startLiveMic(onStop: (info: MediaStopInfo) => void) {
    return this.startStream('MIC', [], onStop);
  }

  async startRtspUrl(rtspUrl: string, onStop: (info: MediaStopInfo) => void) {
    return this.startStream('RTSP', ['-re', ...this.streamInputArgs(rtspUrl), '-i', rtspUrl], onStop);
  }

  async testRtspUrl(rtspUrl: string, timeoutMs = 8000): Promise<StreamTestResult> {
    if (!this.isSupportedStreamUrl(rtspUrl)) {
      throw new Error('Stream URL phải bắt đầu bằng rtsp://, http:// hoặc https://');
    }

    if (this.isHlsUrl(rtspUrl)) {
      const hlsResult = await this.testHlsPlaylistUrl(rtspUrl, timeoutMs);
      if (!hlsResult.success) return hlsResult;
    }

    return new Promise<StreamTestResult>((resolve) => {
      let settled = false;
      let stderr = '';
      const args = [
        ...this.streamInputArgs(rtspUrl, timeoutMs),
        '-i',
        rtspUrl,
        '-t',
        '1',
        '-f',
        'null',
        '-',
      ];
      const process = spawn(config.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      const finish = (success: boolean, message?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!process.killed) {
          process.kill('SIGTERM');
        }
        resolve({
          success,
          message: message || (success ? 'Kết nối stream thành công.' : this.getStreamTestErrorMessage(stderr)),
        });
      };

      const timer = setTimeout(() => finish(false, 'Kết nối stream quá thời gian chờ. Kiểm tra lại URL hoặc mạng máy chủ.'), timeoutMs);

      process.stderr.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        stderr += output;
        if (output.includes('Stream #') || output.includes('Input #')) {
          finish(true);
        }
      });

      process.on('error', (error) => finish(false, `Không chạy được FFmpeg: ${error.message}`));
      process.on('close', (code) => finish(code === 0));
    });
  }

  private isSupportedStreamUrl(url: string) {
    const value = url.toLowerCase();
    return value.startsWith('rtsp://') || value.startsWith('http://') || value.startsWith('https://');
  }

  private isHlsUrl(url: string) {
    return url.toLowerCase().includes('.m3u8');
  }

  private async testHlsPlaylistUrl(url: string, timeoutMs: number): Promise<StreamTestResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'broadcast-demo-admin/1.0' },
      });
      const body = await response.text();

      if (!response.ok) {
        return {
          success: false,
          message: `URL HLS không truy cập được (HTTP ${response.status}). Kiểm tra lại đường dẫn playlist.m3u8.`,
        };
      }

      if (!body.includes('#EXTM3U')) {
        return {
          success: false,
          message: 'URL trả về dữ liệu nhưng không phải playlist HLS hợp lệ.',
        };
      }

      return { success: true, message: 'Kết nối HLS thành công.' };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error && error.name === 'AbortError'
            ? 'Kết nối HLS quá thời gian chờ.'
            : 'Không tải được playlist HLS. Kiểm tra lại URL hoặc mạng máy chủ.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private getStreamTestErrorMessage(stderr: string) {
    const output = stderr.toLowerCase();
    if (output.includes('404') || output.includes('not found')) return 'URL stream không tồn tại hoặc sai đường dẫn.';
    if (output.includes('403') || output.includes('forbidden')) return 'Máy chủ stream từ chối truy cập (HTTP 403).';
    if (output.includes('401') || output.includes('unauthorized')) return 'Máy chủ stream yêu cầu xác thực.';
    if (output.includes('timed out') || output.includes('timeout')) return 'Kết nối stream quá thời gian chờ.';
    if (output.includes('invalid data')) return 'Stream trả về dữ liệu không hợp lệ.';
    return 'Không kết nối được luồng stream.';
  }

  private streamInputArgs(url: string, timeoutMs = 8000) {
    const timeoutMicros = `${timeoutMs * 1000}`;
    if (url.toLowerCase().startsWith('rtsp://')) {
      return ['-rtsp_transport', 'tcp', '-timeout', timeoutMicros, '-rw_timeout', timeoutMicros];
    }

    return [
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_at_eof',
      '1',
      '-reconnect_delay_max',
      String(config.ffmpegReconnectDelayMaxSeconds),
      '-rw_timeout',
      timeoutMicros,
    ];
  }

  async startHlsFile(fileId: string, resetPosition: boolean, onStop: (info: MediaStopInfo) => void) {
    const signedUrl = await this.audioFiles.getSignedUrl(fileId);
    if (!signedUrl) {
      throw new Error('File MP3 khong hop le hoac khong ton tai.');
    }

    if (resetPosition) {
      this.filePlaybackPositions.set(fileId, 0);
    }

    const offsetSeconds = this.filePlaybackPositions.get(fileId) || 0;
    const seekArgs = offsetSeconds > 0.5 ? ['-ss', offsetSeconds.toFixed(3)] : [];
    return this.startStream('FILE', ['-re', ...seekArgs, '-i', signedUrl], onStop, fileId, offsetSeconds);
  }

  private async startStream(
    type: 'MIC' | 'FILE' | 'RTSP',
    inputArgs: string[],
    onStop: (info: MediaStopInfo) => void,
    fileId?: string,
    offsetSeconds = 0,
  ) {
    this.stop('replace');

    const version = ++this.streamVersion;
    const args =
      type === 'MIC'
        ? ['-f', 'webm', '-i', 'pipe:0', ...this.outputArgs()]
        : [...inputArgs, ...this.outputArgs()];

    console.log(`STARTING version=${version} type=${type} -> ${config.rtspUrl}`);
    console.log(`FFMPEG_ARGS version=${version} type=${type} ${this.formatFfmpegArgs(args)}`);
    const process = spawn(config.ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    this.activeStream = {
      type,
      process,
      version,
      fileId,
      startedAt: Date.now() - offsetSeconds * 1000,
      hlsReady: false,
      stderrTail: '',
    };

    process.stderr.on('data', (chunk: Buffer) => {
      const output = chunk.toString();
      console.log(`FFmpeg: ${output}`);
      if (this.activeStream?.process === process) {
        this.activeStream.stderrTail = this.keepTail(`${this.activeStream.stderrTail}${output}`, 5000);
      }
    });

    process.on('error', (error) => {
      console.error(`Khong the chay FFmpeg: ${error.message}`);
      if (this.activeStream?.process === process) {
        const stream = this.activeStream;
        this.lastStoppedStreamStderrTail = stream.stderrTail;
        this.activeStream = null;
        onStop({ type: stream.type, version: stream.version, code: null, signal: null });
      }
    });

    process.on('close', (code, signal) => {
      console.log(`FFmpeg da thoat. code=${code} signal=${signal}`);
      if (this.activeStream?.process === process) {
        const stream = this.activeStream;
        if (stream.type === 'FILE' && code === 0 && !signal && stream.fileId) {
          this.filePlaybackPositions.set(stream.fileId, 0);
        }
        this.lastStoppedStreamStderrTail = stream.stderrTail;
        this.activeStream = null;
        onStop({ type: stream.type, version: stream.version, code, signal });
      }
    });

    await this.waitForHlsReady(version);
    const stillActive = this.activeStream?.version === version;

    if (!stillActive) {
      throw new Error('Luong phat da bi thay the.');
    }

    this.activeStream!.hlsReady = true;
    console.log(`STARTED version=${version}`);
    return { version, type };
  }

  private outputArgs() {
    return [
      '-map',
      '0:a:0?',
      '-vn',
      '-dn',
      '-sn',
      '-c:a',
      'aac',
      '-b:a',
      '64k',
      '-f',
      'rtsp',
      '-rtsp_transport',
      'tcp',
      config.rtspUrl,
    ];
  }

  private formatFfmpegArgs(args: string[]) {
    return args.map((arg) => this.redactUrlQuery(arg)).join(' ');
  }

  private redactUrlQuery(value: string) {
    try {
      const url = new URL(value);
      if (url.search) url.search = '?...';
      return url.toString();
    } catch {
      return value;
    }
  }

  private rememberFilePosition(stream: MediaStreamState) {
    if (stream.type !== 'FILE' || !stream.fileId) return;

    const elapsedSeconds = Math.max(0, (Date.now() - stream.startedAt) / 1000);
    this.filePlaybackPositions.set(stream.fileId, elapsedSeconds);
    console.log(`Luu vi tri file ${stream.fileId}: ${elapsedSeconds.toFixed(1)}s`);
  }

  private async waitForHlsReady(version: number) {
    const deadline = Date.now() + config.hlsReadyTimeoutMs;
    await this.sleep(config.hlsReadyGraceMs);

    while (Date.now() < deadline) {
      if (!this.activeStream || this.activeStream.version !== version) {
        throw new Error(`Luong phat da bi dung truoc khi HLS san sang.${this.formatStderrTailForError()}`);
      }

      if (await this.isHlsManifestReady()) {
        console.log(`HLS_READY version=${version}`);
        return;
      }

      await this.sleep(config.hlsReadyPollMs);
    }

    this.stop('hls_not_ready');
    throw new Error(`MediaMTX chưa tạo được HLS stream.${this.formatStderrTailForError()}`);
  }

  private async isHlsManifestReady() {
    const cacheBust = `v=${Date.now()}`;
    const url = config.hlsHealthUrl.includes('?')
      ? `${config.hlsHealthUrl}&${cacheBust}`
      : `${config.hlsHealthUrl}?${cacheBust}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return false;

      const body = await response.text();
      return (
        body.includes('#EXTM3U') &&
        (body.includes('#EXTINF') || body.includes('#EXT-X-PART') || body.includes('#EXT-X-STREAM-INF'))
      );
    } catch {
      return false;
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private keepTail(value: string, maxLength: number) {
    if (value.length <= maxLength) return value;
    return value.slice(value.length - maxLength);
  }

  private formatStderrTailForError() {
    const tail = this.lastStoppedStreamStderrTail.trim();
    if (!tail) return '';
    return ` FFmpeg gan nhat: ${tail.split('\n').slice(-8).join(' | ')}`;
  }
}
