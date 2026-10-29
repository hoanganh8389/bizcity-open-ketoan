# Phần mềm kế toán

Kế toán doanh nghiệp lấy **sổ cái** làm trung tâm: nhận chứng từ từ hệ thống nghiệp vụ qua API, tự định khoản theo cấu hình, ghi sổ ngay, lên sổ sách và báo cáo thuế. Một cài đặt phục vụ nhiều đơn vị (multi-tenant), mở rộng bằng add-in.

- **API**: Node 22, TypeScript, Fastify, PostgreSQL 16 (Kysely)
- **Giao diện**: React 18, Vite, TypeScript
- **Chạy**: Docker Compose

## Chạy nhanh

```bash
cp .env.example .env          # sửa JWT_SECRET, mật khẩu quản trị
docker compose up -d --build
```

| Địa chỉ | Nội dung |
|---|---|
| http://localhost:8088 | Giao diện (đơn vị `demo`, `admin@ketoan.local` / `Admin@123` — đổi ngay) |
| http://localhost:8088/api/docs | Tài liệu API (OpenAPI) |
| http://localhost:8088/api/v1/system/health | Kiểm tra sống |

Lần chạy đầu tự tạo bảng (migration) và dữ liệu khởi tạo: đơn vị, người quản trị, hệ thống tài khoản TT200, loại thuế, lý do, nhóm hạch toán, hình thức thanh toán. Khoá API cho hệ thống bán hàng: đặt `SEED_API_KEY` trong `.env`, hoặc xem log `docker compose logs api` (khoá sinh ngẫu nhiên chỉ in một lần).

## Cấu trúc

```
apps/
  api/                 API
    migrations/        Khai báo cơ sở dữ liệu (SQL, đánh số, có chú thích từng bảng)
    seeds/             Dữ liệu khởi tạo (hệ thống tài khoản)
    src/
      config/          Biến môi trường
      core/            Lõi dùng chung: lỗi, khuôn phản hồi, xác thực, nhật ký, add-in
      db/              Kết nối, kiểu bảng, chạy migration, seed
      modules/<ten>/   Mỗi nghiệp vụ một thư mục: schemas · repository · service · routes
      addins/<ma>/     Phần mở rộng
    test/              Kiểm thử luồng nghiệp vụ trên PostgreSQL thật
  web/                 Giao diện
    src/
      lib/             Gọi API, đăng nhập, định dạng
      layout/          Thanh menu ngang, khung trang
      components/      Thành phần dùng chung
      features/<nhom>/ Màn hình theo nhóm chức năng
      addins/<ma>/     Giao diện của add-in
packages/
  contracts/           Hợp đồng dữ liệu dùng chung: khuôn chứng từ, khuôn phản hồi, hằng số
docs/                  Tài liệu (kiến trúc, cơ sở dữ liệu, API tích hợp, add-in, hướng dẫn sử dụng)
docker/                Dockerfile, nginx
```

## Tài liệu

**Bắt đầu ở [docs/README.md](docs/README.md)** — bản đồ tài liệu theo vai trò. Luật và hợp đồng của framework: [docs/00-CANON.md](docs/00-CANON.md). Agent AI: [AGENTS.md](AGENTS.md).

| Tệp | Cho ai |
|---|---|
| [docs/kien-truc.md](docs/kien-truc.md) | Lập trình viên mới: các tầng, luồng một chứng từ, quy ước code |
| [docs/co-so-du-lieu.md](docs/co-so-du-lieu.md) | Bảng, quan hệ, ràng buộc, cách thêm migration |
| [docs/api-tich-hop.md](docs/api-tich-hop.md) | Hệ thống bên ngoài gửi chứng từ: khuôn dữ liệu, ví dụ, mã lỗi |
| [docs/add-in.md](docs/add-in.md) | Viết phần mở rộng |
| [docs/phat-trien.md](docs/phat-trien.md) | Chạy máy dev, kiểm thử, thêm module, thêm màn hình |
| [docs/huong-dan/](docs/huong-dan/) | Hướng dẫn sử dụng từng chức năng (cũng hiện trong giao diện, nút "Hướng dẫn") |

## Chức năng hiện có

| Nhóm | Chức năng |
|---|---|
| Chứng từ | Nhận hoá đơn bán, hàng bán trả lại qua API (chống trùng, có phiên bản); ghi sổ lại; huỷ |
| Sổ cái | Hai bộ sổ (nội bộ, thuế); chỉ thêm; sửa bằng ghi số âm; số dư cập nhật cùng lúc |
| Sổ sách | Bút toán, sổ chi tiết tài khoản (có đối ứng), bảng cân đối số phát sinh |
| Thuế | Sổ hoá đơn, bảng kê hoá đơn bán ra theo thuế suất |
| Danh mục | Tài khoản, chi nhánh, đối tượng, loại thuế |
| Cấu hình | Lý do, nhóm hạch toán mặt hàng, hình thức thanh toán, tài khoản ngầm định, kỳ và khoá sổ |
| Hệ thống | Đăng nhập, vai trò và quyền, khoá API, nhật ký thao tác, add-in (xuất Excel, bảng tính AI) |

## Lệnh thường dùng

```bash
npm install                    # cài thư viện (Node ≥ 22.12)
docker compose up -d db        # chỉ chạy PostgreSQL (cổng 5434)
npm run db:seed                # migration + dữ liệu khởi tạo
npm run dev:api                # API  http://localhost:4100
npm run dev:web                # Web  http://localhost:4180
npm test                       # chạy test
npm run typecheck              # kiểm tra kiểu toàn bộ
```
