# Android Device Client API

Tai lieu nay mo ta API danh cho app Android/WebView dong vai tro thiet bi phat thanh. Admin API va cookie dang nhap admin khong dung cho Android.

## Tong quan

- Base URL vi du: `https://<backend-host>`
- API prefix: `/api/device-client`
- Content type: `application/json`
- Tat ca endpoint, tru `POST /register`, can header:

```http
Authorization: Bearer <deviceToken>
```

`deviceToken` chi duoc tra ve khi register. App Android can luu token vao storage local an toan va dung lai cho cac lan goi sau.

Neu app bi mat token, goi lai `POST /register` bang cung `androidId` hoac `macAddress`; backend se cap token moi cho cung thiet bi neu tim thay.

## Luong tich hop de xuat

1. App mo lan dau, lay `androidId` va neu co thi lay them `macAddress`.
2. Goi `POST /api/device-client/register`.
3. Luu `deviceToken` tu response.
4. Goi `POST /api/device-client/heartbeat` moi `heartbeatIntervalSeconds` giay.
5. Poll `GET /api/device-client/config`, `GET /api/device-client/schedule`, va `GET /api/device-client/commands` moi `pollIntervalSeconds` giay.
6. Khi bat dau phat, dung phat, hoac gap loi, goi `POST /api/device-client/playback-state`.
7. Khi tai/sync lich xong, goi `POST /api/device-client/sync-result`.
8. Khi can test mic cua Android, thu mot doan ngan va upload bang `POST /api/device-client/mic-test-upload`.

## Endpoint reference

### Register device

Dang ky hoac claim thiet bi Android. Endpoint nay khong can bearer token.

```http
POST /api/device-client/register
```

Request body:

```json
{
  "androidId": "a1b2c3d4e5f6",
  "macAddress": "22:22:E5:6C:16:F4",
  "name": "Android Box Test 01",
  "connectionType": "LAN",
  "appVersion": "1.0.0"
}
```

Notes:

- `androidId` hoac `macAddress` bat buoc co it nhat mot truong.
- `macAddress` la optional. Neu Android khong lay duoc MAC, chi can gui `androidId`.
- `connectionType` chi nhan `LAN` hoac `4G`; gia tri khac se duoc xem nhu `4G`.
- Neu thiet bi chua ton tai, backend tu tao thiet bi moi voi area mac dinh `Chưa phân khu`.
- Neu da ton tai theo `androidId` hoac `macAddress`, backend tai su dung thiet bi cu va cap token moi.

Response example:

```json
{
  "device": {
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "name": "Android Box Test 01",
    "macAddress": "22:22:E5:6C:16:F4",
    "androidId": "a1b2c3d4e5f6",
    "area": "Chưa phân khu",
    "connectionType": "LAN",
    "online": true,
    "lastSeenAt": "2026-06-05T03:00:00.000Z",
    "playAllowed": true,
    "playStatus": "IDLE",
    "currentSchedule": null,
    "activeSchedule": null,
    "syncStatus": null,
    "lastSyncedAt": null,
    "syncMessage": null,
    "appVersion": "1.0.0",
    "networkType": null,
    "batteryLevel": null,
    "updatedAt": "2026-06-05T03:00:00.000Z"
  },
  "deviceToken": "device_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "heartbeatIntervalSeconds": 30,
  "serverTime": "2026-06-05T03:00:00.000Z"
}
```

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/register" \
  -H "Content-Type: application/json" \
  -d '{"androidId":"a1b2c3d4e5f6","name":"Android Box Test 01","connectionType":"LAN","appVersion":"1.0.0"}'
```

Loi thuong gap:

- `400`: Thieu ca `androidId` va `macAddress`.

### Heartbeat

Cap nhat thiet bi dang online, `lastSeenAt`, va metadata app/network.

```http
POST /api/device-client/heartbeat
Authorization: Bearer <deviceToken>
```

Request body:

```json
{
  "appVersion": "1.0.0",
  "networkType": "WIFI",
  "batteryLevel": 87
}
```

Notes:

- `batteryLevel` se duoc clamp trong khoang `0..100`.

Response example:

```json
{
  "device": {
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "name": "Android Box Test 01",
    "online": true,
    "lastSeenAt": "2026-06-05T03:00:30.000Z",
    "playAllowed": true,
    "playStatus": "IDLE",
    "appVersion": "1.0.0",
    "networkType": "WIFI",
    "batteryLevel": 87
  },
  "heartbeatIntervalSeconds": 30,
  "serverTime": "2026-06-05T03:00:30.000Z"
}
```

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/heartbeat" \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"appVersion":"1.0.0","networkType":"WIFI","batteryLevel":87}'
```

Loi thuong gap:

- `401`: Thieu bearer token hoac token khong hop le.

### Get config

Lay cau hinh hien tai cua thiet bi, lich dang gan, lich dang phat, URL WebView va thoi gian poll.

```http
GET /api/device-client/config
Authorization: Bearer <deviceToken>
```

Response example:

```json
{
  "serverTime": "2026-06-05T03:01:00.000Z",
  "device": {
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "name": "Android Box Test 01",
    "area": "Chưa phân khu",
    "playAllowed": true,
    "playStatus": "IDLE",
    "activeSchedule": null,
    "currentSchedule": null
  },
  "playAllowed": true,
  "activeSchedule": null,
  "currentSchedule": null,
  "webviewUrl": "/client",
  "hlsUrl": null,
  "pollIntervalSeconds": 10
}
```

Notes:

- `webviewUrl` hien tai la `/client`. Android nen resolve thanh `https://<backend-host>/client`.
- `hlsUrl` co the la `null` neu backend chua cau hinh `PUBLIC_HLS_BASE_URL`.
- App nen dung `serverTime` de xu ly lech gio khi so sanh lich.

cURL:

```bash
curl "https://<backend-host>/api/device-client/config" \
  -H "Authorization: Bearer <deviceToken>"
```

Loi thuong gap:

- `401`: Thieu bearer token hoac token khong hop le.
- `404`: Token hop le nhung thiet bi khong con ton tai.

### Get schedule

Lay lich da sync/gan cho thiet bi trong `device_schedule_assignments`.

```http
GET /api/device-client/schedule
Authorization: Bearer <deviceToken>
```

Response khi chua co lich:

```json
{
  "serverTime": "2026-06-05T03:01:10.000Z",
  "assignment": null,
  "schedule": null,
  "playlist": null,
  "file": null
}
```

Response voi lich RTSP/HTTP:

```json
{
  "serverTime": "2026-06-05T03:01:10.000Z",
  "assignment": {
    "syncStatus": "SYNCED",
    "lastSyncedAt": "2026-06-05T03:00:00.000Z",
    "syncMessage": "Da tai lich xuong thiet bi demo."
  },
  "schedule": {
    "scheduleId": "33333333-3333-3333-3333-333333333333",
    "name": "Tiếp sóng URL",
    "sourceType": "RTSP",
    "priority": "NORMAL",
    "playlistId": null,
    "fileId": null,
    "fileMode": null,
    "rtspUrl": "https://example.com/live/index.m3u8",
    "startDate": "2026-06-05",
    "startTime": "06:00",
    "endTime": "06:30",
    "repeatType": "DAILY",
    "enabled": true
  },
  "playlist": null,
  "file": null
}
```

Response voi lich FILE playlist:

```json
{
  "serverTime": "2026-06-05T03:01:10.000Z",
  "assignment": {
    "syncStatus": "SYNCED",
    "lastSyncedAt": "2026-06-05T03:00:00.000Z",
    "syncMessage": "Android da dong bo lich."
  },
  "schedule": {
    "scheduleId": "44444444-4444-4444-4444-444444444444",
    "name": "Phát file buổi sáng",
    "sourceType": "FILE",
    "priority": "NORMAL",
    "playlistId": "55555555-5555-5555-5555-555555555555",
    "fileId": null,
    "fileMode": "PLAYLIST",
    "rtspUrl": null,
    "startDate": "2026-06-05",
    "startTime": "06:00",
    "endTime": "06:30",
    "repeatType": "DAILY",
    "enabled": true
  },
  "playlist": {
    "playlistId": "55555555-5555-5555-5555-555555555555",
    "name": "Danh sách phát sáng",
    "totalFiles": 1,
    "totalSize": 1234567,
    "items": [
      {
        "playlistItemId": "66666666-6666-6666-6666-666666666666",
        "playlistId": "55555555-5555-5555-5555-555555555555",
        "fileId": "77777777-7777-7777-7777-777777777777",
        "sortOrder": 0,
        "file": {
          "fileId": "77777777-7777-7777-7777-777777777777",
          "originalName": "ban-tin.mp3",
          "size": 1234567,
          "mimetype": "audio/mpeg",
          "url": "https://signed-url.example.com/audio.mp3"
        }
      }
    ]
  },
  "file": null
}
```

Notes:

- Voi `sourceType=RTSP`, app dung `schedule.rtspUrl`.
- Voi `sourceType=FILE` va `fileMode=PLAYLIST`, app dung `playlist.items[].file.url`.
- Voi `sourceType=FILE` va `fileMode=SINGLE_FILE`, app dung `file.url`.
- Cac `url` la signed URL, co thoi han theo backend config `SIGNED_URL_TTL_SECONDS`.

cURL:

```bash
curl "https://<backend-host>/api/device-client/schedule" \
  -H "Authorization: Bearer <deviceToken>"
```

### Update playback state

Bao trang thai phat thuc te cua Android ve backend de admin nhin thay.
Backend luu `message`, `positionSeconds`, va thoi diem cap nhat lam thong tin playback moi nhat tren thiet bi.

```http
POST /api/device-client/playback-state
Authorization: Bearer <deviceToken>
```

Request body:

```json
{
  "playStatus": "PLAYING",
  "currentScheduleId": "33333333-3333-3333-3333-333333333333",
  "positionSeconds": 12,
  "message": "Started playback"
}
```

Allowed `playStatus`:

- `IDLE`
- `PLAYING`
- `STOPPED`
- `ERROR`

Response example:

```json
{
  "device": {
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "playStatus": "PLAYING",
    "playbackMessage": "Started playback",
    "playbackPositionSeconds": 12,
    "playbackUpdatedAt": "2026-06-05T03:02:00.000Z",
    "currentSchedule": {
      "scheduleId": "33333333-3333-3333-3333-333333333333",
      "name": "Tiếp sóng URL"
    }
  },
  "playback": {
    "playStatus": "PLAYING",
    "currentScheduleId": "33333333-3333-3333-3333-333333333333",
    "positionSeconds": 12,
    "message": "Started playback"
  },
  "serverTime": "2026-06-05T03:02:00.000Z"
}
```

Vi du bao loi:

```json
{
  "playStatus": "ERROR",
  "currentScheduleId": "33333333-3333-3333-3333-333333333333",
  "message": "Player failed to open stream"
}
```

Notes:

- `message` la optional, nhung nen gui khi `playStatus=ERROR` de admin/debug biet ly do loi.
- Backend chi luu playback moi nhat tren bang `devices`; message cu se bi ghi de boi lan update sau.
- `positionSeconds` la optional va nen la vi tri phat hien tai neu Android player co cung cap.

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/playback-state" \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"playStatus":"PLAYING","currentScheduleId":"33333333-3333-3333-3333-333333333333","positionSeconds":12}'
```

Loi thuong gap:

- `400`: `playStatus` khong thuoc `IDLE | PLAYING | STOPPED | ERROR`.
- `401`: Token khong hop le.

### Update sync result

Bao ket qua Android da tai/sync lich.

```http
POST /api/device-client/sync-result
Authorization: Bearer <deviceToken>
```

Request body:

```json
{
  "scheduleId": "33333333-3333-3333-3333-333333333333",
  "syncStatus": "SYNCED",
  "syncMessage": "Downloaded schedule and media files"
}
```

Allowed `syncStatus`:

- `SYNCED`
- `FAILED`

Response example:

```json
{
  "device": {
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "syncStatus": "SYNCED",
    "lastSyncedAt": "2026-06-05T03:03:00.000Z",
    "syncMessage": "Downloaded schedule and media files"
  },
  "serverTime": "2026-06-05T03:03:00.000Z"
}
```

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/sync-result" \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"scheduleId":"33333333-3333-3333-3333-333333333333","syncStatus":"SYNCED","syncMessage":"Downloaded schedule"}'
```

Loi thuong gap:

- `400`: Thieu `scheduleId`.
- `400`: `syncStatus` khong phai `SYNCED` hoac `FAILED`.

### Upload mic test

Android tu thu mot doan audio ngan tu mic va upload len backend de kiem tra file thu duoc. API nay chi test luong thu/upload mic, chua tu dong phat ra loa.

```http
POST /api/device-client/mic-test-upload
Authorization: Bearer <deviceToken>
Content-Type: multipart/form-data
```

Form-data:

```text
audio: <recorded audio file>
durationSeconds: 3
message: "Mic self-test from Android"
```

Allowed formats:

- `audio/webm`
- `audio/ogg`
- `audio/mpeg`
- `audio/mp4`
- `audio/aac`
- `application/octet-stream` neu Android/WebView khong set MIME chuan

Response example:

```json
{
  "upload": {
    "uploadId": "88888888-8888-8888-8888-888888888888",
    "deviceId": "11111111-1111-1111-1111-111111111111",
    "fileName": "mic-test.webm",
    "mimetype": "audio/webm",
    "size": 123456,
    "durationSeconds": 3,
    "message": "Mic self-test from Android",
    "url": "https://signed-url.example.com/mic-test.webm",
    "createdAt": "2026-06-05T03:03:30.000Z"
  },
  "serverTime": "2026-06-05T03:03:30.000Z"
}
```

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/mic-test-upload" \
  -H "Authorization: Bearer <deviceToken>" \
  -F "audio=@mic-test.webm;type=audio/webm" \
  -F "durationSeconds=3" \
  -F "message=Mic self-test from Android"
```

Kotlin/OkHttp note:

```kotlin
val body = MultipartBody.Builder()
  .setType(MultipartBody.FORM)
  .addFormDataPart(
    "audio",
    "mic-test.webm",
    audioBytes.toRequestBody("audio/webm".toMediaType())
  )
  .addFormDataPart("durationSeconds", "3")
  .addFormDataPart("message", "Mic self-test from Android")
  .build()
```

Notes:

- File duoc luu rieng trong Storage path `mic-tests/<deviceId>/<uploadId>.<ext>`.
- File test mic khong xuat hien trong danh sach `/api/files` va khong tu dong them vao playlist.
- Muon test loa phat ra am thanh tu file nay se can flow rieng o v2.

Loi thuong gap:

- `400`: Thieu file field `audio`.
- `400`: Dinh dang file khong duoc ho tro.
- `401`: Thieu bearer token hoac token khong hop le.

### Get commands

Poll lenh tu backend. MVP hien tai chua co command queue, nen endpoint luon tra `NOOP`.

```http
GET /api/device-client/commands
Authorization: Bearer <deviceToken>
```

Response example:

```json
{
  "serverTime": "2026-06-05T03:04:00.000Z",
  "deviceId": "11111111-1111-1111-1111-111111111111",
  "command": {
    "commandId": "noop",
    "type": "NOOP"
  }
}
```

Notes:

- Android nen van tich hop polling endpoint nay de sau nay nang cap command queue ma khong can doi flow.
- Cac lenh du kien cho v2: `PLAY_NOW`, `STOP`, `SYNC_SCHEDULE`, `RELOAD_WEBVIEW`.
- V2 se bo sung ack endpoint rieng neu co command queue.

cURL:

```bash
curl "https://<backend-host>/api/device-client/commands" \
  -H "Authorization: Bearer <deviceToken>"
```

## Data notes

### Device object

Mot so response co `device`. Cac field quan trong:

```json
{
  "deviceId": "uuid",
  "name": "Android Box Test 01",
  "macAddress": "22:22:E5:6C:16:F4",
  "androidId": "a1b2c3d4e5f6",
  "area": "Chưa phân khu",
  "connectionType": "LAN",
  "online": true,
  "lastSeenAt": "2026-06-05T03:00:00.000Z",
  "playAllowed": true,
  "playStatus": "IDLE",
  "activeSchedule": null,
  "currentSchedule": null,
  "syncStatus": null,
  "appVersion": "1.0.0",
  "networkType": "WIFI",
  "batteryLevel": 87,
  "playbackMessage": "Started playback",
  "playbackPositionSeconds": 12,
  "playbackUpdatedAt": "2026-06-05T03:02:00.000Z"
}
```

### Enum values

- `playStatus`: `IDLE | PLAYING | STOPPED | ERROR`
- `syncStatus`: `SYNCED | FAILED`
- `connectionType`: `LAN | 4G`
- `command.type` MVP: `NOOP`

### Android ID va MAC

- Nen uu tien gui `androidId`.
- `macAddress` la optional vi Android hien dai co the khong cho doc MAC that.
- Neu khong co MAC, backend luu fallback `macAddress` dang `ANDROID:<androidId>` de phu hop schema hien tai.

### WebView

- Goi `GET /config` de lay `webviewUrl`.
- Hien tai `webviewUrl` la `/client`.
- Android nen load URL day du: `https://<backend-host>/client`.

## Error format

NestJS mac dinh tra loi dang:

```json
{
  "message": "Device token khong hop le.",
  "error": "Unauthorized",
  "statusCode": 401
}
```

HTTP status can xu ly:

- `400`: request body sai hoac thieu field bat buoc.
- `401`: thieu token hoac token khong hop le.
- `404`: thiet bi/lich khong ton tai.
- `500`: loi backend/Supabase.

## Quick smoke test

```bash
BASE_URL="https://<backend-host>"

REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/device-client/register" \
  -H "Content-Type: application/json" \
  -d '{"androidId":"android-test-001","name":"Android Test 001","connectionType":"LAN","appVersion":"1.0.0"}')

echo "$REGISTER_RESPONSE"

# Copy deviceToken tu response roi gan vao bien TOKEN.
TOKEN="device_xxx"

curl "$BASE_URL/api/device-client/config" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE_URL/api/device-client/heartbeat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"networkType":"WIFI","batteryLevel":90}'
```
