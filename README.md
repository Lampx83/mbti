# Trắc nghiệm MBTI – Định hướng nghề nghiệp | NEU

Công cụ trắc nghiệm MBTI dành cho sinh viên **Đại học Kinh tế Quốc dân (NEU)**, giúp khám phá nhóm tính cách và gợi ý hướng nghề nghiệp, ngành học phù hợp.

## Tính năng

- **20 câu hỏi** trắc nghiệm 4 chiều MBTI: E–I, S–N, T–F, J–P
- **16 nhóm tính cách** với tên tiếng Việt và mô tả ngắn
- **Gợi ý nghề nghiệp** phù hợp sinh viên khối kinh tế
- **Gợi ý ngành / chuyên ngành** tại NEU (Kinh tế, QTKD, Tài chính – Ngân hàng, Kế toán, Marketing, v.v.)

## Chạy dự án

```bash
cd Tools/MBTI-Career-NEU
npm install
npm run dev
```

Mở trình duyệt tại: **http://localhost:3001**

## Build

```bash
npm run build
```

Kết quả build nằm trong thư mục `dist/`.

Nếu deploy dưới AI Portal có base path (ví dụ `/tuyen-sinh`), dùng:

```bash
npm run build:basepath
```

## Đóng gói ZIP (AI Portal)

```bash
npm run pack
```

Tạo file **`dist/mbti-career-neu.zip`** chứa `manifest.json` và thư mục `public/` (build) để tải lên AI Portal.

Với môi trường base path `/tuyen-sinh`, dùng:

```bash
npm run pack:basepath
```

Lệnh này tạo file **`dist/mbti-career-neu-basepath.zip`**.

**Không dùng `sudo`** khi chạy; nếu gặp lỗi quyền, sửa quyền thư mục: `sudo chown -R $(whoami) dist .`

## Công nghệ

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** (v4)

## Lưu ý

Kết quả trắc nghiệm chỉ mang tính **tham khảo**, không thay thế tư vấn hướng nghiệp chuyên nghiệp.
