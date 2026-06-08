# Admin Web

Frontend quản trị tách riêng khỏi NestJS backend.

## Chạy local

Terminal 1, chạy backend ở thư mục gốc:

```bash
npm run start:dev
```

Terminal 2, chạy frontend:

```bash
cd admin-web
npm install
npm run dev
```

Mở `http://localhost:5173`. Vite proxy sẽ chuyển các request `/api`, `/upload`, `/files` và Socket.IO về backend `http://localhost:3000`.

## Ghi chú triển khai

- Frontend dùng cookie session `admin_session`, nên mọi request API đều gửi `credentials: 'include'`.
- Khi production, nên đặt admin web và API cùng domain, ví dụ `/admin` và `/api`, để cookie/session đơn giản hơn.
- Bản frontend này là bước tách nền tảng. Các màn có thể được mở rộng dần thay cho HTML inline trong `PagesController`.
