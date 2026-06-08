import { join } from 'path';

export const config = {
  port: Number(process.env.PORT || 3000),
  uploadDir: process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'),
  streamPath: process.env.STREAM_PATH || 'loacuaxa',
  timeZone: process.env.TZ || process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  rtspHost: process.env.RTSP_HOST || 'mediamtx',
  rtspPort: process.env.RTSP_PORT || '8554',
  rtspUrl:
    process.env.RTSP_URL ||
    `rtsp://${process.env.RTSP_HOST || 'mediamtx'}:${process.env.RTSP_PORT || '8554'}/${process.env.STREAM_PATH || 'loacuaxa'}`,
  hlsHealthUrl:
    process.env.HLS_HEALTH_URL ||
    `http://${process.env.RTSP_HOST || 'mediamtx'}:8888/${process.env.STREAM_PATH || 'loacuaxa'}/index.m3u8`,
  publicHlsBaseUrl: (process.env.PUBLIC_HLS_BASE_URL || '').replace(/\/+$/, ''),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  maxUploadSize: 50 * 1024 * 1024,
  hlsReadyTimeoutMs: Number(process.env.HLS_READY_TIMEOUT_MS || 20000),
  hlsReadyPollMs: Number(process.env.HLS_READY_POLL_MS || 300),
  hlsReadyGraceMs: Number(process.env.HLS_READY_GRACE_MS || 1200),
  ffmpegReconnectDelayMaxSeconds: Number(process.env.FFMPEG_RECONNECT_DELAY_MAX_SECONDS || 5),
  scheduleStreamRestartMaxAttempts: Number(process.env.SCHEDULE_STREAM_RESTART_MAX_ATTEMPTS || 3),
  scheduleStreamRestartDelayMs: Number(process.env.SCHEDULE_STREAM_RESTART_DELAY_MS || 5000),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAudioBucket: process.env.SUPABASE_AUDIO_BUCKET || 'broadcast-audio',
  signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 3600),
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 86400),
  ttsProvider: process.env.TTS_PROVIDER || 'fpt',
  fptTtsApiKey: process.env.FPT_TTS_API_KEY || '',
  fptTtsDefaultVoice: process.env.FPT_TTS_DEFAULT_VOICE || 'banmai',
  fptTtsSpeed: process.env.FPT_TTS_SPEED || '0',
  fptTtsFormat: process.env.FPT_TTS_FORMAT || 'mp3',
  fptTtsPollAttempts: Number(process.env.FPT_TTS_POLL_ATTEMPTS || 30),
  fptTtsPollDelayMs: Number(process.env.FPT_TTS_POLL_DELAY_MS || 5000),
  isProduction: process.env.NODE_ENV === 'production',
};
