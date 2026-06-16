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

1. App mo lan dau, lay `androidId` va neu co thi lay them `macAddress`; browser simulator co the dung `deviceId` cua thiet bi da tao.
2. Goi `POST /api/device-client/register`.
3. Luu `deviceToken` tu response.
4. Goi `POST /api/device-client/heartbeat` moi `heartbeatIntervalSeconds` giay.
5. Poll `GET /api/device-client/config`, `GET /api/device-client/schedule`, va `GET /api/device-client/commands` moi `pollIntervalSeconds` giay.
6. Khi bat dau phat, dung phat, hoac gap loi, goi `POST /api/device-client/playback-state`.
7. Khi tai/sync lich xong, goi `POST /api/device-client/sync-result`.
8. Khi can test mic cua Android, thu mot doan ngan va upload bang `POST /api/device-client/mic-test-upload`.
9. Khi thiet bi bat dau phat, tu ghi toi da 60 giay dau va upload bang `POST /api/device-client/playback-recording-upload` de lam bang chung phat thanh.

## Endpoint reference

### Register device

Dang ky hoac claim thiet bi Android. Endpoint nay khong can bearer token.

```http
POST /api/device-client/register
```

Request body:

```json
{
  "deviceId": "11111111-1111-1111-1111-111111111111",
  "androidId": "a1b2c3d4e5f6",
  "macAddress": "22:22:E5:6C:16:F4",
  "name": "Android Box Test 01",
  "connectionType": "LAN",
  "appVersion": "1.0.0"
}
```

Notes:

- Gui `deviceId`, `androidId`, hoac `macAddress` bat buoc co it nhat mot truong.
- `deviceId` dung cho thiet bi da ton tai trong he thong, phu hop browser simulator va test theo UUID.
- `macAddress` la optional. Neu Android khong lay duoc MAC, chi can gui `androidId`.
- `connectionType` nhan `LAN`, `4G`, hoac `UNKNOWN`. Neu khong gui, backend luu `UNKNOWN` cho thiet bi moi.
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
  "connectionType": "LAN",
  "networkType": "WIFI",
  "batteryLevel": 87
}
```

Notes:

- `batteryLevel` se duoc clamp trong khoang `0..100`.
- `connectionType` la optional. Neu khong gui, backend se suy luan tu `networkType`: `wifi/ethernet` thanh `LAN`, `cellular/mobile/4g/lte/5g` thanh `4G`.
- App nen goi heartbeat moi 30 giay. Neu backend khong nhan heartbeat trong 90 giay, thiet bi se duoc danh dau mat ket noi nhung `lastSeenAt` van giu moc heartbeat cuoi.

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
    "connectionType": "LAN",
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

Lay cac lich da sync/gan cho thiet bi trong `device_schedule_assignments`.

```http
GET /api/device-client/schedule
Authorization: Bearer <deviceToken>
```

Response khi chua co lich:

```json
{
  "serverTime": "2026-06-05T03:01:10.000Z",
  "assignments": [],
  "schedules": [],
  "playlistsByScheduleId": {},
  "filesByScheduleId": {}
}
```

Response khi co nhieu lich:

```json
{
  "serverTime": "2026-06-05T03:01:10.000Z",
  "assignments": [
    {
      "assignmentId": "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa",
      "scheduleId": "33333333-3333-3333-3333-333333333333",
      "syncStatus": "SYNCED",
      "lastSyncedAt": "2026-06-05T03:00:00.000Z",
      "syncMessage": "Downloaded schedule"
    }
  ],
  "schedules": [
    {
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
    }
  ],
  "playlistsByScheduleId": {
    "33333333-3333-3333-3333-333333333333": null
  },
  "filesByScheduleId": {
    "33333333-3333-3333-3333-333333333333": null
  },
}
```

Notes:

- Backend chi tra cac lich da duoc admin gan cho thiet bi qua `POST /api/devices/:deviceId/sync-schedule`.
- Lich phat tu dong tren Socket.IO cung chi phat den cac thiet bi co assignment va dang `playAllowed=true`; lich chua gan thiet bi se bi bo qua.
- Voi `sourceType=RTSP`, app dung `schedule.rtspUrl`.
- Voi `sourceType=FILE` va `fileMode=PLAYLIST`, app lay playlist tai `playlistsByScheduleId[scheduleId]`.
- Voi `sourceType=FILE` va `fileMode=SINGLE_FILE`, app lay file tai `filesByScheduleId[scheduleId]`.
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
recordingId: "99999999-9999-9999-9999-999999999999"  # optional, khi upload file cho phien ghi am do admin yeu cau
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
- Neu gui `recordingId`, backend gan file vao phien ghi am va admin co the nghe lai trong man hinh thiet bi.

Loi thuong gap:

- `400`: Thieu file field `audio`.
- `400`: Dinh dang file khong duoc ho tro.
- `401`: Thieu bearer token hoac token khong hop le.

### Upload playback recording

Upload file ghi am bang chung phat thanh do thiet bi tu ghi khi bat dau phat. Endpoint nay khong can admin bam ghi am.

```http
POST /api/device-client/playback-recording-upload
Authorization: Bearer <deviceToken>
Content-Type: multipart/form-data
```

Form fields:

```yaml
audio: <binary audio file>       # required
scheduleId: "uuid"               # optional, neu biet lich dang phat
fileId: "uuid"                   # optional, neu dang phat file cached
playStatus: "PLAYING"            # optional
startedAt: "2026-06-05T03:00:00.000Z"
endedAt: "2026-06-05T03:01:00.000Z"
durationSeconds: "60"
message: "Playback proof from Android"
```

Notes:

- Thiet bi nen bat dau recorder cung luc bat dau phat va ghi toi da 60 giay dau.
- File duoc luu trong Storage path `recordings/<deviceId>/<yyyy-mm-dd>/...`.
- Backend tao ban ghi `device_recording_sessions` voi `recording_source = AUTO_PLAYBACK`; admin xem file trong cot `File ghi am` cua man hinh Van hanh thiet bi.

### Get commands

Poll lenh tu backend. Neu admin chua gui lenh moi, endpoint tra `NOOP`. Cac lenh hien co gom `SET_VOLUME`, `START_RECORDING`, `STOP_RECORDING`, `PLAY_SCHEDULE`, `STOP_PLAYBACK`, `PLAY_EMERGENCY`, va `STOP_EMERGENCY`.

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

Response voi lenh am luong:

```json
{
  "serverTime": "2026-06-05T03:04:00.000Z",
  "deviceId": "11111111-1111-1111-1111-111111111111",
  "command": {
    "commandId": "99999999-9999-9999-9999-999999999999",
    "type": "SET_VOLUME",
    "payload": {
      "volumeLevel": 7
    }
  }
}
```

Response voi lenh bat dau ghi am:

```json
{
  "serverTime": "2026-06-05T03:04:00.000Z",
  "deviceId": "11111111-1111-1111-1111-111111111111",
  "command": {
    "commandId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "type": "START_RECORDING",
    "payload": {
      "recordingId": "99999999-9999-9999-9999-999999999999",
      "maxDurationSeconds": 60
    }
  }
}
```

Response voi lenh dung ghi am:

```json
{
  "serverTime": "2026-06-05T03:04:20.000Z",
  "deviceId": "11111111-1111-1111-1111-111111111111",
  "command": {
    "commandId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "type": "STOP_RECORDING",
    "payload": {
      "recordingId": "99999999-9999-9999-9999-999999999999"
    }
  }
}
```

Notes:

- `SET_VOLUME.payload.volumeLevel` la so nguyen tu `0` den `15`.
- `PLAY_SCHEDULE.payload.scheduleId` la lich can phat ngay; `sourceType` giup app chon player phu hop. Android nen goi `GET /api/device-client/schedule` neu can lay chi tiet RTSP/file/playlist moi nhat, bat dau phat, goi `POST /api/device-client/playback-state` voi `PLAYING`, roi goi `POST /api/device-client/command-result`.
- `STOP_PLAYBACK` yeu cau Android dung player hien tai, goi `POST /api/device-client/playback-state` voi `STOPPED`, roi goi `POST /api/device-client/command-result`.
- Khi nhan `START_RECORDING`, Android bat dau ghi am tu mic va goi `POST /api/device-client/recording-status` voi `RECORDING`.
- Khi nhan `STOP_RECORDING` hoac den `maxDurationSeconds`, Android dung ghi, bao `UPLOADING`, roi upload file bang `mic-test-upload` kem `recordingId`.
- Sau khi ap dung lenh vao thiet bi that, Android phai goi `POST /api/device-client/command-result`.
- Neu thiet bi khong ap dung duoc am luong, gui `status=FAILED` kem `message`.

cURL:

```bash
curl "https://<backend-host>/api/device-client/commands" \
  -H "Authorization: Bearer <deviceToken>"
```

### Update recording status

Bao trang thai ghi am do admin yeu cau.

```http
POST /api/device-client/recording-status
Authorization: Bearer <deviceToken>
Content-Type: application/json
```

Request examples:

```json
{
  "recordingId": "99999999-9999-9999-9999-999999999999",
  "status": "RECORDING",
  "message": "Recording started"
}
```

```json
{
  "recordingId": "99999999-9999-9999-9999-999999999999",
  "status": "UPLOADING",
  "message": "Recording stopped, uploading"
}
```

```json
{
  "recordingId": "99999999-9999-9999-9999-999999999999",
  "status": "FAILED",
  "message": "Microphone permission denied"
}
```

Allowed `status`:

- `RECORDING`
- `UPLOADING`
- `FAILED`

### Update command result

Bao ket qua thuc thi lenh tu Android ve backend.

```http
POST /api/device-client/command-result
Authorization: Bearer <deviceToken>
Content-Type: application/json
```

Request thanh cong voi `SET_VOLUME`:

```json
{
  "commandId": "99999999-9999-9999-9999-999999999999",
  "status": "SUCCEEDED",
  "appliedVolumeLevel": 7,
  "message": "Volume applied"
}
```

Request that bai:

```json
{
  "commandId": "99999999-9999-9999-9999-999999999999",
  "status": "FAILED",
  "message": "Android volume API failed"
}
```

Allowed `status`:

- `SUCCEEDED`
- `FAILED`

cURL:

```bash
curl -X POST "https://<backend-host>/api/device-client/command-result" \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"commandId":"99999999-9999-9999-9999-999999999999","status":"SUCCEEDED","appliedVolumeLevel":7}'
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
  "playbackUpdatedAt": "2026-06-05T03:02:00.000Z",
  "volumeLevel": 7,
  "desiredVolumeLevel": 7,
  "volumeSyncStatus": "SYNCED",
  "volumeSyncMessage": "Thiet bi da ap dung am luong.",
  "volumeUpdatedAt": "2026-06-05T03:04:10.000Z"
}
```

### Enum values

- `playStatus`: `IDLE | PLAYING | STOPPED | ERROR`
- `syncStatus`: `SYNCED | FAILED`
- `connectionType`: `LAN | 4G | UNKNOWN`
- `volumeSyncStatus`: `PENDING | SYNCED | FAILED`
- `command.type`: `NOOP | SET_VOLUME | START_RECORDING | STOP_RECORDING | PLAY_SCHEDULE | STOP_PLAYBACK | PLAY_EMERGENCY | STOP_EMERGENCY`

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
