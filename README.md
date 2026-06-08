# 📡 Broadcast System — Hệ thống Phát thanh Thông minh

> Nền tảng quản lý và phát thanh thông minh cho các đơn vị hành chính (xã, phường, thị trấn). Hỗ trợ phát file âm thanh, tiếp sóng RTSP/HLS, phát live mic, lên lịch tự động và quản lý thiết bị loa từ xa.

---

## 🗺️ Mục lục

- [Tổng quan hệ thống](#tổng-quan-hệ-thống)
- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc](#kiến-trúc)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt & Chạy local](#cài-đặt--chạy-local)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Device Client API](#device-client-api)
- [Deploy lên AWS](#deploy-lên-aws)
- [Roadmap](#roadmap)

---

## Tổng quan hệ thống

Broadcast System là nền tảng **multi-tenant** phục vụ nhiều đơn vị xã/phường cùng lúc. Mỗi đơn vị có không gian dữ liệu riêng biệt (organization isolation), hệ thống phân quyền user/roles, và giao diện quản trị web độc lập.

Thiết bị đầu cuối (loa thông minh chạy Android) kết nối về server, nhận lịch phát và thực thi tự động theo khung giờ được cài đặt sẵn.

```
Trung tâm (Admin Web)              Thiết bị đầu cuối (Android)
┌─────────────────────┐            ┌──────────────────────┐
│  Quản lý lịch phát  │  WebSocket │  Android App (Loa)   │
│  Upload âm thanh    │◄──────────►│  HLS Player          │
│  Giám sát thiết bị  │  REST API  │  Auto-sync schedule  │
│  Phát live mic      │            │  Heartbeat + status  │
└─────────────────────┘            └──────────────────────┘
          │
          ▼
┌─────────────────────┐
│  NestJS Backend     │
│  ┌───────────────┐  │            ┌──────────────────┐
│  │  MediaMTX     │──┼───────────►│  FFmpeg          │
│  │  RTSP → HLS   │  │            │  Audio encoding  │
│  └───────────────┘  │            └──────────────────┘
│  ┌───────────────┐  │            ┌──────────────────┐
│  │  Supabase     │  │            │  FPT.AI TTS      │
│  │  DB + Storage │  │            │  Text-to-Speech  │
│  └───────────────┘  │            └──────────────────┘
└─────────────────────┘
```

---

## Tính năng chính

### 🎙️ Phát thanh
| Tính năng | Mô tả |
|-----------|-------|
| **Phát file** | Upload MP3 lên Supabase Storage, phát qua HLS |
| **Tiếp sóng** | Tiếp sóng RTSP/HLS từ nguồn ngoài (Đài tỉnh, huyện) |
| **Live mic** | Phát trực tiếp từ micro của máy tính admin |
| **Playlist** | Tạo danh sách phát theo thứ tự |
| **TTS** | Chuyển văn bản thành giọng nói (FPT.AI) |

### 📅 Lịch phát
| Tính năng | Mô tả |
|-----------|-------|
| **Lịch định kỳ** | Một lần / Hằng ngày / Hằng tuần / Hằng tháng |
| **Ưu tiên** | NORMAL (thường) và EMERGENCY (khẩn cấp) |
| **Tự động** | Server tự chạy lịch theo khung giờ (polling 30s) |
| **Conflict detection** | Kiểm tra trùng khung giờ khi tạo lịch |

### 📱 Quản lý thiết bị
| Tính năng | Mô tả |
|-----------|-------|
| **Giám sát** | Online/offline, pin, mạng, trạng thái phát |
| **Điều khiển** | Cho phép/chặn phát, gán lịch xuống thiết bị |
| **Sync** | Đồng bộ lịch phát xuống thiết bị (PENDING/SYNCED/FAILED) |
| **Mic test** | Thiết bị ghi âm và upload để kiểm tra chất lượng |

### 👥 Multi-tenant & User/Roles *(Roadmap)*
| Role | Quyền |
|------|-------|
| `super_admin` | Quản lý tất cả organizations |
| `admin` | Full access trong organization |
| `operator` | Phát thanh, upload, quản lý lịch |
| `viewer` | Chỉ xem trạng thái |

---

## Kiến trúc

```
broadcast-server/
├── packages/
│   ├── shared/          # Shared TypeScript types & constants
│   ├── server/          # NestJS Backend API
│   └── web/             # React + Vite Admin Frontend
├── docker-compose.yml
└── README.md
```

### Luồng phát thanh
```
[Admin nhấn Phát]
      │
      ▼
[BroadcastGateway]    ─── socket event ──►  [tất cả clients]
      │
      ▼
[MediaService]        ─── spawn ──────────► [FFmpeg process]
      │                                           │
      │                                           ▼
      │                               [RTSP push → MediaMTX :8554]
      │                                           │
      │                               [MediaMTX → HLS :8888]
      │                                           │
      ▼                                           ▼
[Wait HLS ready]      ◄── poll ─────────── [GET /index.m3u8]
      │
      ▼
[emit client_update START]
      │
      ▼
[Android HLS Player pulls stream từ :8888]
```

### Tech Stack chi tiết

```
Backend (packages/server):
  - NestJS 11       ─ Framework, DI, Modules
  - Socket.IO 4     ─ WebSocket real-time
  - Supabase JS 2   ─ Database + Storage client
  - FFmpeg          ─ Audio encoding, stream relay
  - MediaMTX        ─ RTSP server → HLS conversion
  - Multer          ─ File upload
  - FPT.AI API      ─ Text-to-Speech

Frontend (packages/web):
  - React 19        ─ UI framework
  - Vite 5          ─ Build tool
  - TypeScript 5    ─ Type safety

Infrastructure:
  - Supabase        ─ PostgreSQL DB + Object Storage
  - Docker Compose  ─ Container orchestration (dev)
  - AWS             ─ Production deployment target
```

---

## Cấu trúc thư mục

```
broadcast-server/
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── audio.ts
│   │   │   │   ├── device.ts
│   │   │   │   ├── organization.ts
│   │   │   │   ├── playlist.ts
│   │   │   │   ├── schedule.ts
│   │   │   │   └── user.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── server/                         # NestJS Backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config.ts
│   │   │   ├── common/
│   │   │   │   ├── guards/             # Auth guards
│   │   │   │   ├── filters/            # Exception filters
│   │   │   │   └── interceptors/       # Logging, transform
│   │   │   ├── auth/                   # Login, session
│   │   │   ├── audio-files/            # Upload MP3, signed URLs
│   │   │   ├── playlists/              # Playlist CRUD
│   │   │   ├── schedules/              # Schedule CRUD + logic
│   │   │   ├── devices/                # Admin device management
│   │   │   ├── device-client/          # Android device API
│   │   │   ├── broadcast/              # WebSocket gateway
│   │   │   ├── media/                  # FFmpeg management
│   │   │   ├── tts/                    # FPT.AI Text-to-Speech
│   │   │   └── storage/                # Supabase client
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                            # React Admin UI
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── layout/             # Shell, Sidebar, Topbar
│       │   │   ├── common/             # Button, Modal, Table, Badge
│       │   │   └── features/
│       │   │       ├── auth/           # Login page
│       │   │       ├── playlists/      # Playlist management
│       │   │       ├── files/          # Audio file library
│       │   │       ├── schedules/      # Schedule management
│       │   │       ├── devices/        # Device monitoring
│       │   │       ├── broadcast/      # Live mic broadcast
│       │   │       └── tts/            # TTS modal
│       │   ├── hooks/                  # useApi, useSocket, useAuth
│       │   ├── lib/
│       │   │   ├── api.ts              # HTTP client
│       │   │   └── socket.ts           # WebSocket client
│       │   └── styles/
│       │       ├── variables.css       # Design tokens
│       │       └── app.css
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
│
├── docker-compose.yml                  # Root compose (dev)
├── package.json                        # NPM workspaces root
└── README.md
```

---

## Cài đặt & Chạy local

### Yêu cầu
- Node.js ≥ 20
- Docker & Docker Compose
- FFmpeg (cài trên máy hoặc qua Docker)

### 1. Clone và cài dependencies

```bash
git clone <repo-url> broadcast-server
cd broadcast-server
npm install          # Cài tất cả packages trong monorepo
```

### 2. Cấu hình môi trường

```bash
cp packages/server/.env.example packages/server/.env
# Chỉnh sửa file .env (xem phần Cấu hình môi trường bên dưới)
```

### 3. Chạy database migrations

Chạy SQL trong Supabase SQL Editor theo thứ tự:
```bash
# Chạy từng file trong packages/server/database/migrations/
001_create_organizations.sql
002_create_users.sql
003_create_audio_files.sql
...
```

### 4. Chạy backend

```bash
# Dùng Docker Compose (bao gồm cả MediaMTX)
cd packages/server
docker compose up -d

# Hoặc dev mode không cần Docker (cần MediaMTX riêng)
npm run start:dev -w packages/server
```

### 5. Chạy frontend

```bash
npm run dev -w packages/web
# Truy cập: http://localhost:5173
```

---

## Cấu hình môi trường

File: `packages/server/.env`

```env
# ─── App ───────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
TZ=Asia/Ho_Chi_Minh

# ─── Admin Auth (tạm thời, sẽ chuyển sang Supabase Auth) ──────────
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-in-production
SESSION_TTL_SECONDS=86400

# ─── Supabase ──────────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUDIO_BUCKET=broadcast-audio
SIGNED_URL_TTL_SECONDS=3600

# ─── MediaMTX / RTSP / HLS ─────────────────────────────────────────
RTSP_HOST=mediamtx           # hostname của MediaMTX container
RTSP_PORT=8554
STREAM_PATH=loacuaxa          # Tên stream path (tuỳ chỉnh)
PUBLIC_HLS_BASE_URL=          # Để trống nếu dùng cùng host, hoặc http://<IP>:8888
HLS_READY_TIMEOUT_MS=20000
HLS_READY_POLL_MS=300
HLS_READY_GRACE_MS=1200

# ─── FFmpeg ────────────────────────────────────────────────────────
FFMPEG_PATH=ffmpeg
FFMPEG_RECONNECT_DELAY_MAX_SECONDS=5

# ─── Schedule ──────────────────────────────────────────────────────
SCHEDULE_STREAM_RESTART_MAX_ATTEMPTS=3
SCHEDULE_STREAM_RESTART_DELAY_MS=5000

# ─── TTS (FPT.AI) ──────────────────────────────────────────────────
TTS_PROVIDER=fpt
FPT_TTS_API_KEY=your-fpt-api-key
FPT_TTS_DEFAULT_VOICE=banmai
FPT_TTS_SPEED=0
FPT_TTS_FORMAT=mp3
FPT_TTS_POLL_ATTEMPTS=30
FPT_TTS_POLL_DELAY_MS=5000
```

---

## Database Schema

### Bảng chính

```sql
-- Tổ chức (xã/phường) — Multi-tenant
organizations (organization_id, name, code, created_at)

-- Người dùng
users (user_id, organization_id, email, role, created_at)

-- File âm thanh
audio_files (file_id, organization_id, original_name, storage_path, size, mimetype, created_at)

-- Danh sách phát
playlists (playlist_id, organization_id, name, created_at)
playlist_items (playlist_item_id, playlist_id, file_id, sort_order)

-- Lịch phát
broadcast_schedules (
  schedule_id, organization_id, name,
  source_type,      -- FILE | RTSP
  priority,         -- NORMAL | EMERGENCY
  playlist_id, file_id, file_mode,
  rtsp_url,
  start_date, start_time, end_time,
  repeat_type,      -- ONCE | DAILY | WEEKLY | MONTHLY
  enabled
)
schedule_run_logs (run_log_id, schedule_id, started_at, ended_at, status, message)

-- Thiết bị
devices (
  device_id, organization_id, name, mac_address, android_id,
  area, connection_type,
  online, last_seen_at,
  play_allowed, play_status, current_schedule_id,
  app_version, network_type, battery_level,
  deleted_at
)
device_schedule_assignments (device_id, schedule_id, sync_status, last_synced_at)
device_mic_test_uploads (upload_id, device_id, file_name, storage_path, duration_seconds)
```

---

## API Reference

### Auth
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/auth/login` | Đăng nhập |
| `POST` | `/api/auth/logout` | Đăng xuất |
| `GET`  | `/api/auth/me` | Thông tin phiên hiện tại |

### Audio Files
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/files` | Danh sách file âm thanh |
| `POST` | `/upload` | Upload file MP3 |
| `GET`  | `/files/:fileId` | Redirect đến signed URL |

### Playlists
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/playlists` | Danh sách playlist |
| `POST` | `/api/playlists` | Tạo playlist mới |
| `GET`  | `/api/playlists/:id` | Chi tiết playlist |
| `PUT`  | `/api/playlists/:id` | Cập nhật playlist |
| `DELETE` | `/api/playlists/:id` | Xóa playlist |
| `POST` | `/api/playlists/:id/items` | Thêm file vào playlist |
| `DELETE` | `/api/playlists/:id/items/:itemId` | Xóa file khỏi playlist |

### Schedules
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/schedules` | Danh sách lịch phát |
| `POST` | `/api/schedules` | Tạo lịch phát |
| `GET`  | `/api/schedules/:id` | Chi tiết lịch |
| `PUT`  | `/api/schedules/:id` | Cập nhật lịch |
| `DELETE` | `/api/schedules/:id` | Xóa lịch |
| `POST` | `/api/schedules/test-rtsp` | Kiểm tra kết nối stream URL |

### Devices (Admin)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/devices` | Danh sách thiết bị |
| `POST` | `/api/devices` | Thêm thiết bị thủ công |
| `PUT`  | `/api/devices/:id` | Cập nhật thiết bị |
| `DELETE` | `/api/devices/:id` | Xóa thiết bị (soft delete) |
| `PUT`  | `/api/devices/:id/play-allowed` | Bật/tắt phép phát |
| `POST` | `/api/devices/:id/play-now` | Phát ngay (RTSP schedule) |
| `POST` | `/api/devices/:id/stop` | Dừng phát |
| `POST` | `/api/devices/:id/sync-schedule` | Đồng bộ lịch xuống thiết bị |

### TTS
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET`  | `/api/tts/voices` | Danh sách giọng đọc |
| `POST` | `/api/tts/generate` | Tạo file âm thanh từ văn bản |

---

## WebSocket Events

Kết nối tới `/` (root namespace) với cookie phiên đăng nhập.

### Server → Client
| Event | Payload | Mô tả |
|-------|---------|-------|
| `FILE_AVAILABLE` | `AudioFile` | File mới được upload |
| `PLAY_CACHED` | `{ fileId, resetPosition, startOffsetSeconds, serverTimeMs }` | Phát file đã cache |
| `STOP` | — | Dừng phát |
| `client_update` | `{ action: 'START'\|'STOP', streamVersion? }` | Bắt đầu/dừng HLS stream |
| `SCHEDULE_STATUS` | `{ activeSchedule, pausedSchedule }` | Trạng thái lịch hiện tại |
| `admin_status` | `{ status, type, streamVersion? }` | Phản hồi cho admin |
| `admin_error` | `{ message }` | Lỗi gửi về admin |

### Client (Admin) → Server
| Event | Payload | Mô tả |
|-------|---------|-------|
| `admin_file_uploaded` | `{ fileId }` | Thông báo file mới upload |
| `admin_play_cached` | `{ fileId, resetPosition? }` | Phát file từ cache |
| `admin_play_hls_file` | `{ fileId, resetPosition? }` | Phát file qua HLS |
| `admin_play_live` | — | Bắt đầu live mic |
| `admin_mic_chunk` | `ArrayBuffer` | Chunk âm thanh mic |
| `admin_stop` | — | Dừng tất cả |
| `admin_pause_schedule` | — | Tạm dừng lịch đang chạy |
| `admin_resume_schedule` | — | Tiếp tục lịch đã tạm dừng |
| `admin_request_schedule_status` | — | Yêu cầu trạng thái lịch |

### Client (Android) → Server
| Event | Payload | Mô tả |
|-------|---------|-------|
| `client_file_ended` | `{ fileId }` | File phát xong |
| `client_file_ready` | `{ fileId }` | File sẵn sàng phát |
| `client_file_error` | `{ fileId, message }` | Lỗi phát file |

---

## Device Client API

API dành riêng cho Android App (thiết bị loa). Xác thực bằng `Authorization: Bearer <device_token>`.

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/device-client/register` | Đăng ký thiết bị, lấy token |
| `POST` | `/api/device-client/heartbeat` | Heartbeat 30s, cập nhật trạng thái |
| `GET`  | `/api/device-client/config` | Lấy cấu hình + URL HLS |
| `GET`  | `/api/device-client/schedule` | Lấy lịch phát được gán |
| `POST` | `/api/device-client/playback-state` | Báo cáo trạng thái phát |
| `POST` | `/api/device-client/sync-result` | Báo kết quả đồng bộ lịch |
| `POST` | `/api/device-client/mic-test-upload` | Upload file kiểm tra mic |
| `GET`  | `/api/device-client/commands` | Poll lệnh từ server |

### Register Request
```json
{
  "androidId": "abc123xyz",
  "macAddress": "22:22:E5:6C:16:F4",
  "name": "Loa Thôn 1",
  "connectionType": "4G",
  "appVersion": "1.2.0"
}
```

### Heartbeat Request
```json
{
  "appVersion": "1.2.0",
  "networkType": "4G",
  "batteryLevel": 85
}
```

---

## Deploy lên AWS

> **Target**: AWS EC2 + Supabase (managed PostgreSQL + Storage)

### Docker Compose khuyến nghị sau khi tách Admin Web

Repo hiện tại có backend trong `demo-admin` và React admin trong `admin-web`. Cách deploy khuyến nghị trên VPS/AWS EC2 là chạy root Docker Compose:

```bash
cd broadcast-server
cp demo-admin/.env.example demo-admin/.env
nano demo-admin/.env
docker compose up -d --build
```

Root `docker-compose.yml` chạy 3 service:

| Service | Vai trò | Public |
|---------|---------|--------|
| `web` | Nginx phục vụ React Admin và reverse proxy | `80` |
| `api` | NestJS backend + FFmpeg | Nội bộ `3000` |
| `mediamtx` | RTSP/HLS server | Nội bộ `8554`, `8888` |

Các route public qua cùng domain:

| Route | Đích |
|-------|------|
| `/` | React Admin UI |
| `/api`, `/upload`, `/files` | NestJS backend |
| `/socket.io` | Socket.IO backend |
| `/client` | Android/WebView client page từ backend |
| `/hls/<stream_path>/index.m3u8` | MediaMTX HLS |

File `demo-admin/.env` production nên có tối thiểu:

```env
NODE_ENV=production
PORT=3000
TZ=Asia/Ho_Chi_Minh
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_AUDIO_BUCKET=broadcast-audio
STREAM_PATH=loacuaxa
RTSP_HOST=mediamtx
RTSP_PORT=8554
PUBLIC_HLS_BASE_URL=/hls
```

Trên AWS Security Group/VPS firewall chỉ nên mở:

```text
22/tcp   SSH, giới hạn IP admin
80/tcp   HTTP
443/tcp  HTTPS
```

Không mở public `3000`, `8554`, `8888` trong production. Nếu cần HTTPS cho Live Mic, đặt reverse proxy TLS phía trước Docker Compose (Nginx/Certbot, Caddy, ALB, hoặc CloudFront tùy hạ tầng).

### Kiến trúc production

```
Internet
   │
   ▼
[AWS ALB / CloudFront]
   │
   ├──► [EC2: NestJS Backend :3000]
   │         └── [MediaMTX :8888 (HLS public)]
   │                   └── [FFmpeg (internal)]
   │
   └──► [Supabase]
            ├── PostgreSQL Database
            └── S3-compatible Storage (audio files)
```

### Docker Compose Production

```bash
# Trên EC2
git clone <repo-url>
cd broadcast-server/packages/server
cp .env.example .env
nano .env    # Điền thông tin production

docker compose up -d --build
```

### Firewall / Security Group

```bash
# Mở các port cần thiết
sudo ufw allow 3000/tcp    # NestJS API
sudo ufw allow 8888/tcp    # MediaMTX HLS (nếu public)
# KHÔNG mở 8554 (RTSP nội bộ)
```

### HTTPS (bắt buộc cho Live Mic)

Live mic dùng `getUserMedia()` trong trình duyệt — chỉ hoạt động trên HTTPS. Cần cấu hình reverse proxy (Nginx + Let's Encrypt) hoặc AWS Certificate Manager.

```nginx
# Nginx reverse proxy mẫu
server {
    listen 443 ssl;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /hls/ {
        proxy_pass http://localhost:8888/;
    }
}
```

---

## Roadmap

### v1.0 — Foundation *(đang thực hiện)*
- [x] Backend API (NestJS) — audio, playlist, schedule, device
- [x] WebSocket gateway — real-time broadcast control
- [x] Admin UI inline (legacy)
- [ ] **Monorepo structure** (`packages/shared`, `packages/server`, `packages/web`)
- [ ] **Multi-tenant** — `organization_id` trên tất cả bảng
- [ ] **User/Roles** — Supabase Auth + RBAC
- [ ] **React Admin UI** hoàn thiện (thay thế inline HTML)
- [ ] Repository pattern (tách StorageService)
- [ ] DTOs + validation
- [ ] Structured logging

### v1.1 — Quality
- [ ] Unit tests (Jest)
- [ ] Integration tests (Supertest)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Health check endpoint
- [ ] Rate limiting

### v1.2 — Features
- [ ] Bulk device import (CSV)
- [ ] Schedule conflict detection nâng cao
- [ ] Báo cáo lịch sử phát
- [ ] Push notification khi lịch thất bại
- [ ] Multiple TTS providers

### v2.0 — Scale
- [ ] Organization management UI
- [ ] Supabase RLS (Row Level Security)
- [ ] Real-time device map
- [ ] Analytics dashboard

---

## Ghi chú vận hành

- **Live mic** yêu cầu HTTPS để trình duyệt cho phép truy cập micro.
- **MediaMTX** nhận RTSP nội bộ từ FFmpeg qua `rtsp://mediamtx:8554/<stream_path>`.
- **Signed URLs** cho audio có TTL mặc định 1 giờ (`SIGNED_URL_TTL_SECONDS`). Khi hết hạn, client cần reload trang để lấy URL mới.
- **Uploads** được lưu trong Supabase Storage (private bucket). Không truy cập được trực tiếp từ ngoài — chỉ qua signed URL.
- **Session** hiện lưu in-memory, sẽ mất khi restart server (sẽ được fix trong v1.0).
- **Schedule tick** chạy mỗi 30 giây — độ trễ tối đa là 30s kể từ khi lịch bắt đầu.

---

## Đóng góp

```bash
# Tạo branch mới
git checkout -b feature/ten-tinh-nang

# Commit
git commit -m "feat: mô tả ngắn gọn"

# Push và tạo Pull Request
git push origin feature/ten-tinh-nang
```

### Quy ước commit
- `feat:` — Tính năng mới
- `fix:` — Sửa lỗi
- `refactor:` — Tái cấu trúc code
- `docs:` — Cập nhật tài liệu
- `test:` — Thêm/sửa tests
- `chore:` — Công việc khác (build, deps, ...)

---

*Được phát triển cho hệ thống phát thanh thông minh cấp xã, phường tại Việt Nam.*
