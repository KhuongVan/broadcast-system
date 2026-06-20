# Admin API

Tai lieu nay mo ta cac API va Socket.IO event danh cho trang quan tri. Nhom Android device client nam rieng tai `docs/android-device-client-api.md`.

## Tong quan

- Base URL vi du: `http://<backend-host>:3000`
- Admin UI: `/admin`
- Login page: `/login`
- Client player page: `/client`
- HTTP API admin dung cookie session `admin_session`.
- Sau khi goi `POST /api/auth/login` thanh cong, browser/client can gui cookie do trong cac request tiep theo.

Vi du fetch:

```js
await fetch('/api/devices', {
  credentials: 'include',
});
```

## Danh sach nhom API

### Auth

```http
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Audio files

```http
GET  /api/files
POST /upload
GET  /files/:fileId
```

### Playlists

```http
GET    /api/playlists
POST   /api/playlists
GET    /api/playlists/:playlistId
PUT    /api/playlists/:playlistId
DELETE /api/playlists/:playlistId
POST   /api/playlists/:playlistId/items
DELETE /api/playlists/:playlistId/items/:playlistItemId
```

### Schedules

```http
GET    /api/schedules
POST   /api/schedules
POST   /api/schedules/test-rtsp
GET    /api/schedules/:scheduleId
PUT    /api/schedules/:scheduleId
DELETE /api/schedules/:scheduleId
```

### Devices

```http
GET    /api/devices
GET    /api/devices/:deviceId
POST   /api/devices
PUT    /api/devices/:deviceId
DELETE /api/devices/:deviceId
PUT    /api/devices/:deviceId/play-allowed
POST   /api/devices/:deviceId/play-now
POST   /api/devices/:deviceId/stop
POST   /api/devices/:deviceId/sync-schedule
```

### TTS

```http
GET  /api/tts/voices
POST /api/tts/generate
```

### Socket.IO admin events

```text
admin_file_uploaded
admin_play_cached
admin_play_hls_file
admin_play_live
admin_mic_chunk
admin_stop
admin_request_schedule_status
admin_pause_schedule
admin_resume_schedule
```

Chi tiet tung API nam o cac phan ben duoi.

## Auth

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

Request:

```json
{
  "username": "admin",
  "password": "password"
}
```

Response:

```json
{
  "authenticated": true
}
```

Notes:

- Response set cookie `admin_session`.
- Sai username/password tra `401`.

### Logout

```http
POST /api/auth/logout
Cookie: admin_session=<token>
```

Response:

```json
{
  "authenticated": false
}
```

### Current session

```http
GET /api/auth/me
Cookie: admin_session=<token>
```

Response:

```json
{
  "authenticated": true,
  "username": "admin",
  "expiresAt": "2026-06-06T03:00:00.000Z"
}
```

## Audio files

### List files

```http
GET /api/files
```

Response:

```json
{
  "files": [
    {
      "fileId": "uuid",
      "originalName": "ban-tin.mp3",
      "storagePath": "audio/uuid.mp3",
      "size": 1234567,
      "mimetype": "audio/mpeg",
      "createdAt": "2026-06-05T03:00:00.000Z",
      "updatedAt": "2026-06-05T03:00:00.000Z",
      "url": "https://signed-url.example.com/audio.mp3"
    }
  ]
}
```

Note: endpoint nay hien chua gan `AdminAuthGuard` truc tiep trong controller.

### Upload MP3

```http
POST /upload
Cookie: admin_session=<token>
Content-Type: multipart/form-data
```

Form-data:

```text
mp3: <file .mp3>
```

Response:

```json
{
  "success": true,
  "fileId": "uuid",
  "originalName": "ban-tin.mp3",
  "storagePath": "audio/uuid.mp3",
  "size": 1234567,
  "mimetype": "audio/mpeg",
  "createdAt": "2026-06-05T03:00:00.000Z",
  "updatedAt": "2026-06-05T03:00:00.000Z",
  "url": "https://signed-url.example.com/audio.mp3",
  "path": "audio/uuid.mp3"
}
```

### Redirect to file

```http
GET /files/:fileId
```

Redirects to signed Supabase Storage URL. Public route.

## Playlists

Tat ca endpoint trong phan nay can admin cookie.

### List playlists

```http
GET /api/playlists
```

Response:

```json
{
  "playlists": [
    {
      "playlistId": "uuid",
      "name": "Danh sách phát sáng",
      "createdAt": "2026-06-05T03:00:00.000Z",
      "updatedAt": "2026-06-05T03:00:00.000Z",
      "totalFiles": 1,
      "totalSize": 1234567,
      "items": []
    }
  ]
}
```

### Create playlist

```http
POST /api/playlists
Content-Type: application/json
```

Request:

```json
{
  "name": "Danh sách phát mới"
}
```

Response:

```json
{
  "playlist": {
    "playlistId": "uuid",
    "name": "Danh sách phát mới",
    "items": []
  }
}
```

### Get playlist

```http
GET /api/playlists/:playlistId
```

Response:

```json
{
  "playlist": {
    "playlistId": "uuid",
    "name": "Danh sách phát sáng",
    "items": []
  }
}
```

### Update playlist

```http
PUT /api/playlists/:playlistId
Content-Type: application/json
```

Request:

```json
{
  "name": "Tên mới"
}
```

### Delete playlist

```http
DELETE /api/playlists/:playlistId
```

Response:

```json
{
  "success": true
}
```

### Add file to playlist

```http
POST /api/playlists/:playlistId/items
Content-Type: application/json
```

Request:

```json
{
  "fileId": "uuid"
}
```

Response:

```json
{
  "playlist": {
    "playlistId": "uuid",
    "items": [
      {
        "playlistItemId": "uuid",
        "playlistId": "uuid",
        "fileId": "uuid",
        "sortOrder": 0,
        "file": {
          "fileId": "uuid",
          "originalName": "ban-tin.mp3",
          "url": "https://signed-url.example.com/audio.mp3"
        }
      }
    ]
  }
}
```

### Remove file from playlist

```http
DELETE /api/playlists/:playlistId/items/:playlistItemId
```

Response:

```json
{
  "success": true
}
```

## Schedules

Tat ca endpoint trong phan nay can admin cookie.

Schedule input:

```json
{
  "name": "Lịch phát sáng",
  "sourceType": "FILE",
  "playlistId": "uuid",
  "fileId": null,
  "fileMode": "PLAYLIST",
  "rtspUrl": null,
  "startDate": "2026-06-05",
  "startTime": "06:00",
  "endTime": "06:30",
  "repeatType": "DAILY",
  "repeatCount": 2,
  "enabled": true
}
```

Allowed values:

- `sourceType`: `FILE | RTSP`
- `priority`: optional legacy field, defaults to `NORMAL` for schedules created by the admin UI.
- `fileMode`: `PLAYLIST | SINGLE_FILE`
- `repeatType`: `ONCE | DAILY | WEEKLY | MONTHLY`
- `repeatCount`: integer `0..30`, chỉ áp dụng cho `sourceType = FILE`. `0` nghĩa là không phát lại thêm; RTSP/HLS luôn lưu `0`.

### List schedules

```http
GET /api/schedules
```

Response:

```json
{
  "schedules": [
    {
      "scheduleId": "uuid",
      "name": "Lịch phát sáng",
      "sourceType": "FILE",
      "priority": "NORMAL",
      "playlistId": "uuid",
      "fileId": null,
      "fileMode": "PLAYLIST",
      "rtspUrl": null,
      "startDate": "2026-06-05",
      "startTime": "06:00",
      "endTime": "06:30",
      "repeatType": "DAILY",
      "repeatCount": 2,
      "enabled": true
    }
  ]
}
```

### Create schedule

```http
POST /api/schedules
Content-Type: application/json
```

Request: schedule input.

Response:

```json
{
  "schedule": {
    "scheduleId": "uuid",
    "name": "Lịch phát sáng"
  }
}
```

### Test RTSP/HTTP/HLS URL

```http
POST /api/schedules/test-rtsp
Content-Type: application/json
```

Request:

```json
{
  "rtspUrl": "https://example.com/live/index.m3u8"
}
```

Response:

```json
{
  "success": true,
  "message": "Kết nối HLS thành công."
}
```

### Get schedule

```http
GET /api/schedules/:scheduleId
```

Response:

```json
{
  "schedule": {
    "scheduleId": "uuid",
    "name": "Lịch phát sáng"
  }
}
```

### Update schedule

```http
PUT /api/schedules/:scheduleId
Content-Type: application/json
```

Request: schedule input.

### Delete schedule

```http
DELETE /api/schedules/:scheduleId
```

Response:

```json
{
  "success": true
}
```

## Devices

Tat ca endpoint trong phan nay can admin cookie.

Device input:

```json
{
  "name": "Loa Thôn 1",
  "macAddress": "22:22:E5:6C:16:F4",
  "simNumber": "0987654321",
  "receiverInstalledDate": "2026-06-01",
  "simRegisteredDate": "2026-06-05",
  "area": "Thôn 1"
}
```

Admin khong can gui `connectionType`; backend mac dinh `UNKNOWN` va cap nhat tu Android register/heartbeat.

### List devices

```http
GET /api/devices
```

Response:

```json
{
  "devices": [
    {
      "deviceId": "uuid",
      "name": "Loa Thôn 1",
      "macAddress": "22:22:E5:6C:16:F4",
      "simNumber": "0987654321",
      "receiverInstalledDate": "2026-06-01",
      "simRegisteredDate": "2026-06-05",
      "androidId": null,
      "area": "Thôn 1",
      "connectionType": "4G",
      "online": true,
      "lastSeenAt": "2026-06-05T03:00:00.000Z",
      "playAllowed": true,
      "activeSchedule": null,
      "scheduleAssignments": [],
      "currentSchedule": null,
      "playStatus": "IDLE",
      "syncStatus": null,
      "syncMessage": null,
      "playbackMessage": null,
      "playbackPositionSeconds": null,
      "playbackUpdatedAt": null,
      "volumeLevel": null,
      "desiredVolumeLevel": 7,
      "volumeSyncStatus": "PENDING",
      "volumeSyncMessage": "Dang cho thiet bi nhan lenh am luong.",
      "volumeUpdatedAt": "2026-06-05T03:04:00.000Z"
    }
  ]
}
```

Allowed `playStatus`: `IDLE | PLAYING | STOPPED | ERROR`.

### Get device

```http
GET /api/devices/:deviceId
```

Response:

```json
{
  "device": {
    "deviceId": "uuid",
    "name": "Loa Thôn 1"
  }
}
```

### Create device

```http
POST /api/devices
Content-Type: application/json
```

Request: device input, including optional `simNumber`, `receiverInstalledDate`, and `simRegisteredDate`.
When importing devices from Excel/CSV, headers such as `SIM`, `Số SIM`, `simNumber`, or `Số điện thoại` all map to the same `simNumber` field.

### Update device

```http
PUT /api/devices/:deviceId
Content-Type: application/json
```

Request: device input, including optional `simNumber`, `receiverInstalledDate`, and `simRegisteredDate`.

### Delete device

```http
DELETE /api/devices/:deviceId
```

Soft delete device and return updated device.

### Update play allowed

```http
PUT /api/devices/:deviceId/play-allowed
Content-Type: application/json
```

Request:

```json
{
  "playAllowed": true
}
```

Endpoint nay chi mo/khoa quyen phat theo lich. Neu can yeu cau thiet bi phat/dung ngay, dung `POST /api/devices/:deviceId/play-now` hoac `POST /api/devices/:deviceId/stop` de backend tao command cho Android polling.

### Update volume

Gui muc am luong mong muon xuong thiet bi. Backend luu `desiredVolumeLevel`, tao lenh `SET_VOLUME`, va doi Android ack qua `/api/device-client/command-result`.

```http
PUT /api/devices/:deviceId/volume
Content-Type: application/json
```

Request:

```json
{
  "volumeLevel": 7
}
```

Allowed `volumeLevel`: so nguyen tu `0` den `15`.

Response:

```json
{
  "device": {
    "deviceId": "uuid",
    "desiredVolumeLevel": 7,
    "volumeLevel": null,
    "volumeSyncStatus": "PENDING",
    "volumeSyncMessage": "Dang cho thiet bi nhan lenh am luong."
  }
}
```

### List device recordings

Lay danh sach phien ghi am gan nhat cua thiet bi, bao gom phien thu cong va file bang chung phat thanh do thiet bi tu upload. Ban ghi hoan tat co `audioUrl` de admin nghe lai.

```http
GET /api/devices/:deviceId/recordings
```

Response:

```json
{
  "recordings": [
    {
      "recordingId": "uuid",
      "deviceId": "uuid",
      "status": "COMPLETED",
      "recordingSource": "AUTO_PLAYBACK",
      "scheduleId": "uuid",
      "fileId": "uuid",
      "playbackStartedAt": "2026-06-05T03:04:00.000Z",
      "playbackEndedAt": "2026-06-05T03:05:00.000Z",
      "durationSeconds": 12,
      "message": "Da upload file ghi am.",
      "audioUrl": "https://signed-url.example.com/mic-test.webm",
      "uploadedAt": "2026-06-05T03:05:00.000Z"
    }
  ]
}
```

Allowed `status`: `REQUESTED | RECORDING | STOP_REQUESTED | UPLOADING | COMPLETED | FAILED | EXPIRED`.

### List recording proof segments

Lay danh sach file bang chung phat theo thiet bi va ngay. Cac file nay do thiet bi tu ghi khi phat lich/phat ngay, phat truc tiep, hoac phat khan cap; moi file toi da 15 phut.

```http
GET /api/devices/:deviceId/recording-segments?date=2026-06-05&sourceType=SCHEDULE
```

Query:

- `date`: bat buoc theo dang `YYYY-MM-DD` neu muon xem ngay cu the; neu bo trong backend dung ngay hien tai.
- `sourceType`: optional, `SCHEDULE | LIVE | EMERGENCY`.

Response:

```json
{
  "segments": [
    {
      "segmentId": "uuid",
      "deviceId": "uuid",
      "sourceType": "SCHEDULE",
      "scheduleId": "uuid",
      "sessionId": null,
      "fileName": "2026-06-05T03-00-00-000Z-schedule-seg-0.webm",
      "startedAt": "2026-06-05T03:00:00.000Z",
      "endedAt": "2026-06-05T03:15:00.000Z",
      "durationSeconds": 900,
      "segmentIndex": 0,
      "isFinalSegment": false,
      "audioUrl": "https://signed-url.example.com/recording.webm"
    }
  ]
}
```

### Start device recording

Tao phien ghi am va gui lenh `START_RECORDING` cho thiet bi. Thiet bi tu dung sau toi da 60 giay.

```http
POST /api/devices/:deviceId/recordings/start
```

Response:

```json
{
  "recording": {
    "recordingId": "uuid",
    "status": "REQUESTED",
    "message": "Dang cho thiet bi bat dau ghi am."
  }
}
```

### Stop device recording

Gui lenh `STOP_RECORDING` cho phien ghi am dang chay.

```http
POST /api/devices/:deviceId/recordings/:recordingId/stop
```

Response:

```json
{
  "recording": {
    "recordingId": "uuid",
    "status": "STOP_REQUESTED",
    "message": "Dang yeu cau thiet bi dung ghi am."
  }
}
```

### Play now

```http
POST /api/devices/:deviceId/play-now
Content-Type: application/json
```

Request:

```json
{
  "scheduleId": "uuid"
}
```

Notes:

- Backend gan lich cho thiet bi neu can, mo `playAllowed`, tao command `PLAY_SCHEDULE`, va cap nhat trang thai phat de admin thay ngay.
- Android nhan command qua `GET /api/device-client/commands`, thuc thi phat, roi ack bang `/api/device-client/command-result` va `/api/device-client/playback-state`.
- Response tra `{ device }`.

### Stop device

```http
POST /api/devices/:deviceId/stop
```

Backend khoa `playAllowed`, tao command `STOP_PLAYBACK`, va cap nhat trang thai phat sang `STOPPED`. Response tra `{ device }`.

### Sync schedule to device

```http
POST /api/devices/:deviceId/sync-schedule
Content-Type: application/json
```

Request:

```json
{
  "scheduleId": "uuid"
}
```

Notes:

- Endpoint nay gan lich cho dung thiet bi trong `device_schedule_assignments`.
- Mot thiet bi co the duoc gan nhieu lich; backend khong tao trung cap `(deviceId, scheduleId)`.
- Backend chan gan lich `enabled=true` neu bi trung khung gio voi lich dang bat da gan cho thiet bi.
- Lich phat tu dong chi phat den cac thiet bi da duoc gan lich bang endpoint nay va dang `playAllowed=true`.
- Lich den gio nhung chua gan cho thiet bi nao se khong phat va duoc ghi log `SKIPPED`.
- Response tra `{ device }`.

### Remove schedule from device

```http
DELETE /api/devices/:deviceId/schedules/:scheduleId
```

Response tra `{ device }`.

## TTS

Tat ca endpoint trong phan nay can admin cookie.

### List voices

```http
GET /api/tts/voices
```

Response:

```json
{
  "provider": "fpt",
  "defaultVoice": "banmai",
  "defaultSpeed": "0",
  "voices": [
    {
      "code": "banmai",
      "label": "Ban Mai - Nữ miền Bắc"
    }
  ]
}
```

### Generate TTS

```http
POST /api/tts/generate
Content-Type: application/json
```

Request:

```json
{
  "title": "Thông báo",
  "text": "Nội dung cần đọc",
  "voice": "banmai",
  "speed": "0"
}
```

Response:

```json
{
  "file": {
    "fileId": "uuid",
    "originalName": "Thong bao.mp3",
    "storagePath": "audio/uuid.mp3",
    "size": 12345,
    "mimetype": "audio/mpeg",
    "url": "/files/uuid",
    "createdAt": "2026-06-12T00:00:00.000Z",
    "updatedAt": "2026-06-12T00:00:00.000Z"
  },
  "voice": "banmai",
  "speed": "0",
  "characters": 16
}
```

## Socket.IO admin events

Ket noi Socket.IO toi same origin. Cac event bat dau bang `admin_` can cookie admin hop le.

```js
const socket = io();
```

### Events admin gui len server

```text
admin_file_uploaded
```

Payload:

```json
{
  "fileId": "uuid"
}
```

Server se emit `FILE_AVAILABLE` cho clients.

```text
admin_play_cached
```

Payload:

```json
{
  "fileId": "uuid",
  "resetPosition": true
}
```

Server emit `PLAY_CACHED`.

```text
admin_play_hls_file
```

Payload:

```json
{
  "fileId": "uuid",
  "resetPosition": true
}
```

Server start HLS stream and emit `client_update`.

```text
admin_play_live
```

Payload:

```json
{
  "targetType": "AREA",
  "targetArea": "Khu A",
  "targetDeviceIds": []
}
```

Or target one or more devices:

```json
{
  "targetType": "DEVICE",
  "targetArea": null,
  "targetDeviceIds": ["uuid"]
}
```

Start live mic stream for the selected area/device rooms.

```text
admin_mic_chunk
```

Payload: binary `ArrayBuffer` chunk tu `MediaRecorder`.

```text
admin_stop
```

Stop current media stream.

```text
admin_request_schedule_status
```

Request current schedule status.

```text
admin_pause_schedule
```

Pause active schedule.

```text
admin_resume_schedule
```

Resume paused schedule.

### Events server gui ve admin/client

```text
admin_status
```

Example:

```json
{
  "status": "STARTED",
  "type": "FILE",
  "streamVersion": 123
}
```

```text
admin_error
```

Example:

```json
{
  "message": "Khong phat duoc file HLS."
}
```

```text
FILE_AVAILABLE
```

Payload: audio file record.

```text
PLAY_CACHED
```

Payload:

```json
{
  "fileId": "uuid",
  "resetPosition": true
}
```

```text
client_update
```

Payload:

```json
{
  "action": "START",
  "streamVersion": 123
}
```

or:

```json
{
  "action": "STOP"
}
```

```text
STOP
```

Notify clients to stop playback.

## Error format

NestJS default error example:

```json
{
  "message": "Vui long dang nhap.",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Common HTTP status:

- `400`: request invalid.
- `401`: missing/invalid admin session.
- `404`: record not found.
- `500`: backend/Supabase/media error.
