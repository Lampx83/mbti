# MBTI Career NEU — Backend

Backend Express cho MBTI Career NEU. Lưu trữ kết quả người dùng làm trắc nghiệm và lời tư vấn AI vào PostgreSQL với **schema riêng** (`mbti_career`). Hỗ trợ 2 chế độ:

- **Standalone:** tự kết nối PostgreSQL theo `.env`, listen cổng 4000.
- **Embedded (AI Portal):** mount như Express router vào ứng dụng Portal, dùng DB của Portal qua `PORTAL_DATABASE_URL`.

## Chạy local

```bash
cd backend
cp .env.example .env   # chỉnh POSTGRES_*, ADMIN_*, MinIO, AI provider...
npm install
npm start              # listen :4000
```

Schema và bảng được tạo tự động khi khởi động (nếu DB tồn tại).

## Endpoints

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/health` | Healthcheck |
| `GET` | `/api/ai-consultation?mbtiType=INTJ&sessionId=123` | Tải tư vấn AI; nếu có `sessionId` thì lưu vào `ai_consultations` |
| `POST` | `/api/mbti/sessions` | Lưu một lần làm bài (session + 20 answers); trả về `session.id` |
| `POST` | `/api/admin/login` | Đăng nhập admin (mặc định `admin / admin123`) |
| `GET` | `/api/admin/stats` | Tổng số session + phân bố 16 nhóm |
| `GET` | `/api/admin/sessions` | Danh sách session (pagination) |
| `GET` | `/api/admin/sessions/:id` | Chi tiết 1 session + answers + AI consultation |
| `GET` | `/api/admin/export` | Tải CSV toàn bộ dữ liệu |

Các endpoint `/api/admin/*` dùng **HTTP Basic Auth** (`admin/admin123` mặc định, đổi qua `ADMIN_USERNAME`/`ADMIN_PASSWORD`).

## Schema

3 bảng chính trong schema `mbti_career`:

- `mbti_sessions` — mỗi lần làm bài
- `mbti_answers` — 20 câu trả lời/sessions
- `ai_consultations` — kết quả AI bóc tách 7 mục, gắn theo `session_id`

Xem [`schema/schema.sql`](schema/schema.sql).
