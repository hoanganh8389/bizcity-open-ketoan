# Dòng lệnh (CLI)

## 1. Hiện có

| Lệnh | Làm gì |
|---|---|
| `npm install` | Cài thư viện (Node ≥ 22.12) |
| `npm run dev` | API :4100 + giao diện :4180, mọi phân hệ (`scripts/dev.mjs`) |
| `npm run dev:<phân hệ>` / `npm run dev -- kho,ban-hang` | Chỉ bật phân hệ đó (+ lõi) |
| `npm run dev -- <phân hệ> --api=<url>` | Chỉ giao diện, gọi API dev dùng chung |
| `npm run dev -- <phân hệ> --api-only` | Chỉ API |
| `npm run db:migrate` · `npm run db:seed` | Áp migration · migration + dữ liệu khởi tạo |
| `npm test` | Test API trên PostgreSQL thật |
| `npm run typecheck` | Kiểm kiểu cả ba gói |
| `npm run build` | Build contracts → api → web |
| `docker compose up -d --build` | Dựng và chạy bản cài |
| `docker compose up db-migrate` | Chỉ chạy job migration + seed |
| `./scripts/cap-nhat.sh` | Cập nhật máy chủ (sao lưu → pull → dựng → kiểm) |
| `./scripts/sao-luu.sh` | Sao lưu CSDL (`BACKUP_KEEP`, `BACKUP_DIR`) |
| `./scripts/tao-ban-test.sh …` | Tạo bản cài test riêng từ bản đang chạy |
| `./scripts/xoa-chung-tu.sh [mã đơn vị]` | Xoá sạch chứng từ + sổ của một đơn vị (chỉ khi `BOOK_MODE=tax`, sau sao lưu) |
| `node scripts/mau-chuyen-kho.mjs [--xoa]` | Nạp / xoá dữ liệu mẫu chuyển kho |
| `node scripts/cai-preset.mjs <id> --api <url> (--token … | --tenant … --email …)` | Cài nhanh preset theo ngành qua HTTP API: chế độ ghi sổ + dữ liệu mẫu hư cấu; `--list`, `--dry-run`, `--no-sample` ([bizcity_preset@1](../contracts/BIZCITY-PRESET-v1.md)) |
| `node scripts/gan-nhan-lop.mjs [--write]` | Đếm / ghi nhãn lớp `// @bizcity-layer` đầu mọi tệp `apps/api/src` theo bảng lớp (R-BOUND-10) |
| `node scripts/do-thi-phu-thuoc.mjs [--date YYYY-MM-DD]` | Dựng đồ thị phụ thuộc theo lớp → `docs/audits/deps-<ngày>.{svg,md,json}` (PHASES 1.4) |

## 2. Đích: lệnh `bizcity` (gói `@bizcity/cli`, Giai đoạn 2)

Gom các script trên về một lệnh, thêm các lệnh kiểm framework. Mọi lệnh in kết quả theo khuôn ở [DIAGNOSTICS.md](DIAGNOSTICS.md) §3 và trả mã thoát 0 / 1 để dùng được trong CI.

| Lệnh | Làm gì | Thay cho |
|---|---|---|
| `bizcity doctor` | Kiểm môi trường: Node, Docker, `.env` (bí mật mặc định?), cổng, kết nối CSDL, migration chưa áp, `/system/health` | — |
| `bizcity dev [phân hệ…] [--api=url] [--api-only]` | Như `npm run dev` | `scripts/dev.mjs` |
| `bizcity db migrate \| seed \| status` | Áp / nạp / liệt kê migration đã áp và chưa áp | `npm run db:*` |
| `bizcity db new <mo_ta> [--module <key>]` | Tạo tệp migration số kế tiếp, khuôn có `COMMENT ON` | tay |
| `bizcity module new <key>` | Sinh khung phân hệ: hai thư mục, `bizcity.module.json`, `index.ts`, `manifest.ts`, route mẫu, test mẫu, dòng CODEOWNERS | tay (mục 4b `phat-trien.md`) |
| `bizcity addin new <id>` | Sinh khung add-in | tay |
| `bizcity contract check` | Sinh JSON Schema từ zod, so với `docs/contracts/*.schema.json`; kiểm registry cấu hình phủ mọi khoá đọc trong code | — |
| `bizcity contract send <file.json> [--dry]` | Gửi một sự việc mẫu vào bản cài (dùng khoá API), in `IngestResult` | curl tay |
| `bizcity ledger verify [--tenant <mã>] [--from --to]` | Chạy kiểm toàn vẹn sổ (như `/system/diagnostics`) trực tiếp trên CSDL | — |
| `bizcity backup` · `bizcity restore <file>` | Sao lưu / khôi phục | `sao-luu.sh` |
| `bizcity update` | Cập nhật máy chủ | `cap-nhat.sh` |
| `bizcity tenant purge <mã> --confirm` | Xoá sạch sổ một đơn vị (chỉ `BOOK_MODE=tax`) | `xoa-chung-tu.sh` |

Luật cho CLI: không chứa luật nghiệp vụ; ghi dữ liệu nghiệp vụ chỉ qua API (trừ `db *`, `tenant purge`); lệnh phá huỷ đòi `--confirm` và sao lưu trước.
