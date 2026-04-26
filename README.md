# Trắc nghiệm MBTI – Định hướng nghề nghiệp | NEU

Công cụ trắc nghiệm MBTI cho sinh viên **Đại học Kinh tế Quốc dân (NEU)**, gợi ý nhóm tính cách + ngành/nghề phù hợp. Có **backend Express + PostgreSQL** lưu lịch sử bài làm và lời tư vấn AI; có **trang quản trị** xem trực quan hoá và xuất CSV.

## Cấu trúc

```
MBTI/
├── src/                  Frontend React + Vite + Tailwind v4
│   ├── App.tsx           Trang trắc nghiệm (intro/quiz/result)
│   ├── admin.tsx         Trang quản trị (login + dashboard + export)
│   ├── mbti-data.ts      20 câu hỏi + 16 nhóm
│   └── mbti-score.ts     Tính điểm 4 chiều
├── backend/              Backend Express + PostgreSQL (xem backend/README.md)
│   ├── src/              Mã nguồn JS thuần (ESM)
│   └── schema/schema.sql Schema dùng placeholder __SCHEMA__
├── package/manifest.json Manifest cho AI Portal
└── scripts/pack.mjs      Đóng gói ZIP cho AI Portal (gồm cả backend)
```

## Chạy local (dev)

**Cần 2 terminal:**

```bash
# Terminal 1 — backend (cổng 4000)
cd backend
cp .env.example .env   # chỉnh POSTGRES_*, ADMIN_*, MinIO, AI provider
npm install
npm start

# Terminal 2 — frontend (cổng 3001)
npm install
npm run dev
```

Vite dev server đã proxy `/api` và `/health` về `localhost:4000` nên frontend không cần `VITE_API_BASE`.

Mở trình duyệt: **http://localhost:3001** — và **http://localhost:3001/#/admin** cho trang quản trị (mặc định `admin / admin123`).

## Đóng gói cho AI Portal

### Trường hợp A — Portal proxy hoạt động (lý thuyết)

```bash
npm run pack            # → dist/mbti-career-neu.zip
npm run pack:basepath   # → dist/mbti-career-neu-basepath.zip (cho /tuyen-sinh/embed/...)
```

Frontend dùng `window.__WRITE_API_BASE__` (Portal inject) để gọi backend embedded qua proxy `/api/apps/mbti-career-neu/*`.

### Trường hợp B — Portal proxy lỗi 401 "No token provided" → deploy backend tách

Đây là cách thực tế đang dùng vì Portal proxy yêu cầu Bearer token mà không inject. Xem [`backend/DEPLOY.md`](backend/DEPLOY.md) — TL;DR:

```bash
# Build frontend với URL backend cố định
VITE_API_BASE=https://research.neu.edu.vn/mbti-api npm run pack:basepath
```

Sửa `package/manifest.json` thành `"hasBackend": false, "hasFrontendOnly": true` rồi upload ZIP. Backend chạy độc lập trên server NEU bạn quản lý (PM2 + nginx + Postgres riêng).

Script `pack` tự build cả frontend (Vite) lẫn backend (copy `src` → `dist`), rồi tạo ZIP gồm:

- `manifest.json` — `hasBackend: true`
- `package.json` — từ `backend/package.json` (Portal sẽ `npm install` để có `pg`, `express`, `mammoth`, `minio`, `openai`)
- `public/` — frontend đã build
- `dist/` — backend (Portal chạy `dist/embed.js` qua main field)
- `schema/schema.sql` — bản gốc với `__SCHEMA__`
- `schema/portal-embedded.sql` — bản đã thay `__SCHEMA__ = mbti_career` để Portal có thể chạy 1 lần

## Mô hình dữ liệu

3 bảng chính trong schema **`mbti_career`** của database AI Portal:

| Bảng | Vai trò |
|---|---|
| `mbti_sessions` | Mỗi lần làm bài (user_name, user_profile_id, mbti_result, created_at) |
| `mbti_answers` | 20 câu trả lời/sessions (1..7) |
| `ai_consultations` | Kết quả AI bóc tách 7 mục, gắn theo `session_id` (provider, sections JSONB, consultation text, object_name) |

Khi user xem kết quả: frontend POST `/api/mbti/sessions` (tạo session_id) → GET `/api/ai-consultation?mbtiType=X&sessionId=Y` (backend lưu vào `ai_consultations`).

## Trang quản trị (`#/admin`)

Truy cập qua link **"Quản trị"** ở footer hoặc thẳng `#/admin`.

- Đăng nhập **HTTP Basic** với `admin / admin123` (đổi qua `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `backend/.env`).
- Dashboard:
  - Tổng số bài làm + số nhóm MBTI xuất hiện
  - Biểu đồ phân bố 16 nhóm
  - Bảng danh sách session (có pagination, click để xem chi tiết: 20 câu trả lời + AI consultation)
- Nút **Tải CSV toàn bộ** (`/api/admin/export`) — gồm sessions + answers + AI consultation flatten.

## Biến môi trường

**Frontend** (build-time, prefix `VITE_`):

- `VITE_API_BASE` — URL gốc của backend. Để trống = same-origin (Portal đã mount, hoặc dev có vite proxy).

**Backend** — xem [`backend/.env.example`](backend/.env.example).

## Công nghệ

- Frontend: Vite + React 18 + TypeScript + Tailwind v4
- Backend: Node.js (ESM JS thuần) + Express + pg + mammoth + minio + openai
- DB: PostgreSQL (schema riêng `mbti_career`)

## Lưu ý

Kết quả trắc nghiệm chỉ mang tính **tham khảo**, không thay thế tư vấn hướng nghiệp chuyên nghiệp.
