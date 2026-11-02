# Dòng lệnh (CLI)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk. -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->

## 1. Hiện có

| Lệnh | Làm gì |
|---|---|
| `npm install` | Cài thư viện (Node ≥ 22.12) |
| `npm run dev` | API :4100 + giao diện :4180, mọi phân hệ (`scripts/dev.mjs`) |
| `npm run dev:<phân hệ>` / `npm run dev -- kho,ban-hang` | Chỉ bật phân hệ đó (+ lõi) |
| `npm run dev -- <phân hệ> --api=<url>` | Chỉ giao diện, gọi API dev dùng chung |
| `npm run dev -- <phân hệ> --api-only` | Chỉ API |
| `npm run db:migrate` · `npm run db:seed` | Áp migration · migration + dữ liệu khởi tạo |
| `npm test` | Test API trên PostgreSQL thật — CSDL riêng `ketoan_test` (tự tạo); `DATABASE_URL` phải trỏ CSDL tên có "test", không thì dừng |
| `npm run typecheck` | Kiểm kiểu cả ba gói |
| `npm run build` | Build contracts → api → web |
| `docker compose up -d --build` | Dựng và chạy bản cài |
| `docker compose up db-migrate` | Chỉ chạy job migration + seed |
| `./scripts/cap-nhat.sh` | Cập nhật máy chủ (sao lưu → pull → dựng → kiểm) |
| `./scripts/sao-luu.sh` | Sao lưu CSDL (`BACKUP_KEEP`, `BACKUP_DIR`) |
| `./scripts/tao-ban-test.sh …` | Tạo bản cài test riêng từ bản đang chạy |
| `./scripts/xoa-chung-tu.sh [mã đơn vị]` | Xoá sạch chứng từ + sổ của một đơn vị (chỉ khi `BOOK_MODE=tax`, sau sao lưu) |
| `node scripts/mau-chuyen-kho.mjs [--xoa]` | Nạp / xoá dữ liệu mẫu chuyển kho |
| `./scripts/kiem-nang-cap.sh [git-ref]` | Kiểm nâng cấp (R-DB-15): CSDL tạm chạy migration + dữ liệu mẫu của bản trước (mặc định tag v* mới nhất), rồi migration bản này, rồi kiểm toàn vẹn; CI job `migrate-upgrade` |
| `./scripts/kiem-khoi-phuc.sh [tệp hoặc --fresh]` | Kiểm khôi phục (R-BAK-3): khôi phục bản sao lưu vào CSDL tạm, chạy kiểm toàn vẹn (Nợ = Có, chuỗi bằng chứng, trigger, migration), so số dòng, xoá CSDL tạm; ghi `backups/kiem-khoi-phuc.log` |
| `node scripts/cai-preset.mjs <id> --api <url> (--token … | --tenant … --email …)` | Cài nhanh preset theo ngành qua HTTP API: chế độ ghi sổ + dữ liệu mẫu hư cấu; `--list`, `--dry-run`, `--no-sample` ([bizcity_preset@1](../contracts/BIZCITY-PRESET-v1.md)) |
| `npm run module -w @ketoan/api -- list | sync | activate <key> | deactivate <key> | verify` <!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — lệnh module (3.13) --> | Registry module của bản cài (ADR-0011 D2): xem trạng thái + hash; đồng bộ module đi kèm bản dựng (job `db-migrate` tự chạy); bật / tắt trên cả bản cài; `verify` thoát mã 1 khi hash lệch. Chạy bằng vai trò sở hữu CSDL. Dev: `module:dev` |
| `npm run module -w @ketoan/api -- migrate <key> [dir]` <!-- [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — module migrate (3.10) --> | Migration của module (`modules/<key>/migrations`) bằng vai trò `mod_<key>_owner` (ADR-0011 D4): tạo vai trò + schema `mod_<key>` nếu chưa có, mỗi tệp một giao dịch, chạm bảng Kernel bị từ chối, thiếu RLS → huỷ. Cần vai trò sở hữu có CREATEROLE |
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
