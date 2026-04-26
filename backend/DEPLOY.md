# Deploy MBTI Backend Standalone

Khi AI Portal proxy `/api/apps/<id>/*` không hoạt động (yêu cầu Bearer token mà không inject), giải pháp là **deploy backend tách riêng** trên server NEU bạn quản lý, frontend sẽ gọi cross-origin tới đó.

## Mô hình

```
┌────────────────────────────┐         ┌──────────────────────────────────┐
│ Frontend (Portal embed)    │         │ Backend MBTI (server NEU riêng)  │
│ ai.neu.edu.vn/tuyen-sinh/  │ ──HTTPS─→ │ research.neu.edu.vn/mbti-api/  │
│ embed/mbti-career-neu/     │   CORS    │ + PostgreSQL                    │
└────────────────────────────┘         └──────────────────────────────────┘
```

## Bước 1 — Chuẩn bị server backend

Yêu cầu trên server:
- Node.js 18+
- PostgreSQL 14+ (hoặc dùng DB của Portal qua `PORTAL_DATABASE_URL`)
- Domain công khai có HTTPS (vd `https://research.neu.edu.vn` hoặc subdomain riêng)

```bash
# Trên server đích
git clone <repo MBTI>
cd MBTI/backend
cp .env.example .env
nano .env   # điền POSTGRES_*, ADMIN_*, MINIO_*, AI provider
npm install
```

`.env` ví dụ:

```ini
PORT=4000
RUN_MODE=standalone
DB_SCHEMA=mbti_career

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=mbti
POSTGRES_PASSWORD=<mật-khẩu>
POSTGRES_DB=mbti_career

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<đổi-mật-khẩu>

MINIO_ENDPOINT=203.113.132.48
MINIO_PORT=8008
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=syllabus

AI_PROVIDER=ollama
OLLAMA_BASE_URL=https://research.neu.edu.vn/ollama
OLLAMA_MODEL=qwen3:8b
```

## Bước 2 — Chạy backend dưới PM2

```bash
sudo npm install -g pm2
pm2 start src/server.js --name mbti-backend --cwd /path/to/MBTI/backend
pm2 save
pm2 startup   # tự khởi động sau reboot
```

Backend listen `0.0.0.0:4000`. Schema PostgreSQL được `ensureDatabase()` tạo tự động lần đầu.

## Bước 3 — Đặt nginx/caddy reverse proxy với HTTPS

Ví dụ `/etc/nginx/sites-available/mbti-api.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name research.neu.edu.vn;       # hoặc mbti-api.neu.edu.vn

    ssl_certificate     /etc/letsencrypt/live/research.neu.edu.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/research.neu.edu.vn/privkey.pem;

    location /mbti-api/ {
        # rewrite /mbti-api/api/... → /api/...
        rewrite ^/mbti-api/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Test:

```bash
curl https://research.neu.edu.vn/mbti-api/health
# → {"status":"ok","service":"mbti-career-neu","database":"connected"}
```

## Bước 4 — Build frontend với VITE_API_BASE trỏ về backend

Trên máy dev:

```bash
cd /path/to/MBTI
sudo chown -R $(whoami):staff dist dist-base 2>/dev/null   # fix quyền sudo cũ

# QUAN TRỌNG: KHÔNG sudo
VITE_API_BASE=https://research.neu.edu.vn/mbti-api npm run pack:basepath
```

ZIP `dist/mbti-career-neu-basepath.zip` đã hard-code URL backend bên trong bundle.

## Bước 5 — Cài ZIP lên Portal

Vào Portal admin → **Cài từ gói** → upload `mbti-career-neu-basepath.zip`. Vì `manifest.json` đã có `hasBackend: true` nhưng giờ ta không dùng backend của Portal, có thể đổi:

```json
{
  "hasBackend": false,
  "hasFrontendOnly": true
}
```

→ Portal chỉ serve static, không chạy backend embedded. Frontend tự gọi cross-origin tới backend NEU.

## Bước 6 — Verify

1. Mở `https://ai.neu.edu.vn/tuyen-sinh/embed/mbti-career-neu/`
2. F12 → Network → tab "Fetch/XHR"
3. Làm 1 bài trắc nghiệm
4. Quan sát các request:
   - POST `https://research.neu.edu.vn/mbti-api/api/mbti/sessions` → 201
   - GET `https://research.neu.edu.vn/mbti-api/api/ai-consultation?...` → 200
5. Vào `#/admin` → đăng nhập admin/admin123 → xem phân bố + tải CSV

## CORS

Backend đã set `cors({ origin: true, credentials: true })` ([server.js:24](src/server.js#L24)) — reflects request origin và cho phép credentials. Không cần config gì thêm.

## Bảo mật

- **Đặt firewall** chỉ cho phép Postgres bind localhost (`listen_addresses = 'localhost'` trong `postgresql.conf`).
- **Đổi `ADMIN_PASSWORD`** mặc định `admin123`.
- **Rate limit** cho `/api/admin/login` (nginx `limit_req_zone`) để tránh brute force.
- **Backup Postgres** định kỳ (`pg_dump`).

## Update version

Mỗi lần deploy code mới:

```bash
# Trên server backend
cd /path/to/MBTI/backend
git pull
npm install   # nếu có dep mới
pm2 restart mbti-backend

# Trên máy dev
VITE_API_BASE=https://research.neu.edu.vn/mbti-api npm run pack:basepath
# Upload ZIP mới lên Portal
```
