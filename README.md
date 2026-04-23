# Trắc nghiệm MBTI – Định hướng nghề nghiệp | NEU

Công cụ trắc nghiệm MBTI dành cho sinh viên **Đại học Kinh tế Quốc dân (NEU)**, giúp khám phá nhóm tính cách và gợi ý hướng nghề nghiệp, ngành học phù hợp.

## Tính năng

- **20 câu hỏi** trắc nghiệm 4 chiều MBTI: E–I, S–N, T–F, J–P
- **16 nhóm tính cách** với tên tiếng Việt và mô tả ngắn
- **Gợi ý nghề nghiệp** phù hợp sinh viên khối kinh tế
- **Gợi ý ngành / chuyên ngành** tại NEU (Kinh tế, QTKD, Tài chính – Ngân hàng, Kế toán, Marketing, v.v.)

## Chạy dự án

```bash
npm install
npm run dev
```

Mở trình duyệt tại: **http://localhost:3001**

## Cấu hình AI (không cần API key)

- Dùng Ollama server: cấu hình trong `.env`:
  - `AI_PROVIDER=ollama`
  - `OLLAMA_BASE_URL=https://research.neu.edu.vn/ollama`
  - `OLLAMA_MODEL` chọn theo danh sách model ở `.../ollama/api/tags`

## Build

```bash
npm run build
```

Kết quả build nằm trong thư mục `dist/`.

## Cấu hình API khi deploy

Frontend dùng 2 biến môi trường (set lúc build):

- `VITE_AI_API_BASE`: base URL cho tính năng **"Tư vấn từ AI"** (`/api/ai-consultation`). Ví dụ: `https://<vercel-app>.vercel.app`
- `VITE_LOG_API_BASE`: base URL cho tính năng **lưu kết quả MBTI vào PostgreSQL** (`/api/mbti/sessions`). Ví dụ: `http://101.96.66.232:8088`

Nếu không set biến nào, mặc định frontend sẽ gọi API theo **same-origin** (ví dụ bạn serve frontend chung với API).

## Đóng gói ZIP (AI Portal)

```bash
npm run pack
```

Tạo file **`dist/mbti-career-neu.zip`** chứa `manifest.json` và thư mục `public/` (build) để tải lên AI Portal. **Không dùng `sudo`** khi chạy; nếu gặp lỗi quyền, sửa quyền thư mục: `sudo chown -R $(whoami) dist .`

## Công nghệ

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** (v4)

## Lưu ý

Kết quả trắc nghiệm chỉ mang tính **tham khảo**, không thay thế tư vấn hướng nghiệp chuyên nghiệp.
