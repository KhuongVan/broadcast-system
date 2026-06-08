# Deploy demo Truyen thanh xa

## Production khuyen nghi: chay tu source tong

1. Cai Docker va Docker Compose plugin.
2. Tao Supabase private bucket `broadcast-audio`.
3. Chay SQL trong `supabase.sql` tren Supabase SQL Editor.
4. Tao file `backend-api/.env` tu `backend-api/.env.example` va dien `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
5. Copy source len server.
6. Trong source tong cua project, chay:

```sh
docker compose up -d --build
```

7. Mo firewall:

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Duong dan truy cap

- Admin React: `http://<SERVER_IP>/`
- Admin backend page: `http://<SERVER_IP>/admin`
- Client loa: `http://<SERVER_IP>/client`
- HLS: `http://<SERVER_IP>/hls/loacuaxa/index.m3u8`

## Backend-only/debug

Neu chi can debug backend va muon public truc tiep cong `3000` va `8888`, co the chay compose rieng trong thu muc nay:

```sh
cd backend-api
docker compose up -d --build
```

Khi do duong dan se la:

- Admin backend page: `http://<SERVER_IP>:3000/admin`
- Client loa: `http://<SERVER_IP>:3000/client`
- HLS debug: `http://<SERVER_IP>:8888/loacuaxa/index.m3u8`

## Ghi chu van hanh

- Live mic lay am thanh tu trinh duyet Admin, vi vay khi dung domain public nen cau hinh HTTPS de trinh duyet cho phep truy cap micro.
- MediaMTX nhan RTSP noi bo tu backend qua `rtsp://mediamtx:8554/loacuaxa`.
- Khi chay root compose production, dat `PUBLIC_HLS_BASE_URL=/hls` trong `backend-api/.env`.
- Khi chay backend-only/debug va client loa can truy cap HLS truc tiep, dat `PUBLIC_HLS_BASE_URL=http://<SERVER_IP>:8888` trong `.env`.
- Co the tang do on dinh cho tiep song URL bang `HLS_READY_TIMEOUT_MS`, `FFMPEG_RECONNECT_DELAY_MAX_SECONDS`, `SCHEDULE_STREAM_RESTART_MAX_ATTEMPTS`, va `SCHEDULE_STREAM_RESTART_DELAY_MS`.
- Cong RTSP `8554` khong public mac dinh. Neu can debug RTSP tu ben ngoai, them mapping `8554:8554` vao service `mediamtx`.
- Thu muc `uploads` duoc mount ra ngoai container de file MP3 khong mat khi rebuild.
- MP3 duoc luu trong Supabase Storage private bucket; backend chi cap signed URL tam thoi cho client tai ve cache.
- `ADMIN_PASSWORD` phai la mat khau rieng tren VPS, khong de gia tri mau `change-me`.
