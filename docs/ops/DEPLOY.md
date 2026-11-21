# Triển khai — chuẩn
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1. -->
<!-- [2026-10-30 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-001 — migration đúng chuẩn, vai trò CSDL thường cho API, bộ test xanh. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — PITR: lưu WAL, sao lưu gốc, diễn tập khôi phục. -->

> Runbook cụ thể cho máy chủ aaPanel hiện tại: [../trien-khai.md](../trien-khai.md). Tệp này là **chuẩn** mọi bản cài phải theo.

## 1. Hình dạng một bản cài

```
reverse proxy (HTTPS, tên miền) ──► web (nginx, 127.0.0.1:WEB_PORT) ──► api (Node 22, :4100) ──► db (PostgreSQL 16)
                                                                         ▲
                                         db-migrate (job một lần, cùng image api) ── chạy xong mới bật api
```

| Dịch vụ | Image | Cổng | Ghi chú |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `127.0.0.1:${DB_PORT:-5434}` | volume `pgdata`; `TZ=Asia/Ho_Chi_Minh` |
| `db-migrate` | `docker/api.Dockerfile` | — | `node dist/db/setup.js`: migration + seed, rồi thoát |
| `api` | `docker/api.Dockerfile` | nội bộ 4100 | `AUTO_MIGRATE=0`: còn migration chưa áp thì không khởi động |
| `web` | `docker/web.Dockerfile` | `${WEB_BIND}:${WEB_PORT:-8088}` | phục vụ giao diện + chuyển `/api/` |

## 2. Loại bản cài

| Loại | `BOOK_MODE` | `ENV_LABEL` | Ghi chú |
|---|---|---|---|
| Sổ nội bộ (thật) | `internal` | trống | Nhận mọi sự việc |
| Sổ thuế (thật) | `tax` | trống | Thư mục, Docker project, CSDL riêng; chỉ phiếu bán / hoàn có hoá đơn; `consumer=tax` |
| Bản test | như bản nguồn | `BẢN TEST` | Tạo bằng `scripts/tao-ban-test.sh`; khoá API, JWT riêng |
| Dev | `internal` | tuỳ | `npm run dev`, `AUTO_MIGRATE=1` |

### 2.1 Thư mục cơ sở dữ liệu
<!-- [2026-10-30 11:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — khai DB_DIR, SEEDS_DIR, PACKS_DIR (gói định khoản nền db/packs). -->

Image API chép `db/migrations`, `db/seeds`, `db/packs` vào `/app/db` (`apps/api/src/db/paths.ts`). Chỉ đặt các biến dưới khi dựng khác chỗ:

| Biến | Mặc định | Dùng cho |
|---|---|---|
| `DB_DIR` | `<gốc repo>/db` (Docker: `/app/db`) | gốc của ba thư mục dưới |
| `SEEDS_DIR` | `$DB_DIR/seeds` | hệ thống tài khoản, danh mục chuẩn |
| `PACKS_DIR` | `$DB_DIR/packs` | gói định khoản; seed cài gói nền `vn-tt99-nen.posting-pack.json` (thiếu thư mục → job `db-migrate` lỗi) |
| `PRESETS_DIR` | `<gốc repo>/presets` (Docker: `/app/presets`) | gói mẫu theo ngành (`bizcity_preset@1`) cho máy chủ chạy — Thiết lập nhanh, `scripts/cai-preset.mjs` (PHASE-036 · 00 §11) <!-- [2026-11-14 06:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-4 --> |
| `BIZCITY_SAMPLE` | trống (tắt); `scripts/cai-nhanh.sh` đặt `thuong-mai-ban-le` | job `db-migrate`: cài **mới** (CSDL chưa có đơn vị) thì tạo Công ty Mẫu và nạp gói này (PHASE-036 · 00 §14) <!-- [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 --> |
| `SAMPLE_TENANT_CODE` | `mau` | mã đơn vị của Công ty Mẫu (`tenants.is_sample`, cùng tài khoản quản trị; không gửi được ra ngoài) |
| `BIZCITY_SAMPLE_ON_DEMAND` | trống (tắt); `scripts/cai-nhanh.sh` đặt `1` | API: chủ đơn vị tạo Công ty Mẫu ở Thiết lập nhanh (TI15) khi bản cài chưa có (`POST /api/v1/setup/sample-tenant`, PHASE-036 · 00 §15) — bản cài nhiều công ty để trống. Xoá: `scripts/xoa-cong-ty-mau.sh` (ADR-0034) <!-- [2026-11-17 09:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 B5b --> |
| `VN_RULEPACKS_DIR` <!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Conformance Engine: gói @bizcity/vn-rulepacks trong image. --> | gói `packages/vn-rulepacks` (image chép nguyên thư mục) | kho rulepack + nguồn pháp lý cho Kiểm chuẩn (ADR-0012); chỉ đặt khi dùng kho khác |
| `BIZCITY_GIT_SHA` | trống | mã commit ghi vào báo cáo Kiểm chuẩn; đặt lúc build image (`--build-arg` → `ENV`) |

## 3. Luật triển khai

| Mã | Luật |
|---|---|
| D-1 | Bí mật (`JWT_SECRET`, `DB_PASSWORD`, `SEED_API_KEY`, `WP_SSO_SECRET`) chỉ ở `.env` trên máy chủ, không vào git |
| D-2 | Không mở cổng 8088, 5434 ra Internet; người dùng chỉ đi qua 443 |
| D-3 | **Không bao giờ** `docker compose down -v` trên bản thật |
| D-4 | Cập nhật bằng `scripts/cap-nhat.sh` (sao lưu → pull → dựng → chờ khoẻ → in migration vừa áp), ngoài giờ làm việc |
| D-5 | Sao lưu hằng đêm `scripts/sao-luu.sh` (giữ 14 bản) **và** chép ra ngoài máy chủ; thử khôi phục ít nhất mỗi quý. Bật PITR (lưu WAL + bản gốc hằng tuần): [infrastructure/backup/](../../infrastructure/backup/README.md) |
| D-6 | Một bản cài = một `name:` Docker Compose riêng; không đổi `name:` của bản đang chạy (đổi tên volume) |
| D-7 | Phát hành gắn nhãn phiên bản (`git tag vX.Y.Z`); image ghi nhãn `org.opencontainers.image.version` (Giai đoạn 3). Bản đang chạy: `GET /api/v1/system/health` trả `version`, `kernel`, `standard` |
| D-8 | Proxy TLS phía trước (cổng 443) gửi `Strict-Transport-Security: max-age=15552000`. nginx của container `web` đã gửi `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'`. Không đặt `X-Frame-Options` vì phần mềm được nhúng trong trang quản trị WP (R-SEC-11) |
| D-9 | API dùng vai trò CSDL thường `ketoan_app` (R-SEC-6) — **mặc định từ 2026-11-01** (P0-3): `.env` phải có `DB_APP_PASSWORD` (≥ 16 ký tự chữ và số; `scripts/cai-nhanh.sh` / `scripts/cap-nhat.sh` tự sinh nếu thiếu), thiếu thì `docker compose` dừng; job `db-migrate` bật đăng nhập cho vai trò, API kết nối bằng nó. <!-- [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3 -->  Kiểm: `BIZCITY_PSQL="docker exec -i <db> psql -U ketoan_app -d ketoan" node tests/conformance/selfcheck.mjs --lane diagnostics` → DG-SEC-2 đạt |
| D-10 | Không có mật khẩu viết sẵn trong mã (SC-SEC-5, PHASE-027 CK-3). `SEED_ADMIN_PASSWORD` bỏ trống thì lần chạy seed đầu tự sinh mật khẩu quản trị và **in một lần** ra log (lưu lại, đăng nhập xong đổi ngay). `PURCHASE_SEED_PASSWORD` là mật khẩu công cụ dữ liệu mẫu (nạp / xoá dữ liệu tình huống, quét cha – con cả danh mục): chưa đặt thì các công cụ đó **tắt** và báo cách bật — bản thật nên để trống <!-- [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3 + Q027-5 --> |

## 4. Kiểm sau triển khai (bắt buộc — R-QG-10)

```bash
docker compose ps                                   # db, api, web Up; api healthy; db-migrate Exit 0
docker compose logs db-migrate | tail -20           # migration vừa áp
curl -s http://127.0.0.1:${WEB_PORT:-8088}/api/v1/system/health/ready              # L1: status "ready" (503 NOT_READY nếu chưa)
curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:${WEB_PORT:-8088}/api/v1/system/diagnostics   # L3, khoá reports:read: summary.error = 0
```

Ghi kết quả vào phần "Bằng chứng" của phiếu phát hành theo [DIAGNOSTICS.md](DIAGNOSTICS.md) §4.

## 5. Máy hay lỗi Docker "overlay2 … device or resource busy" (cPanel/VPS có dịch vụ giữ mount)
<!-- [2026-11-21 01:40 PM Johnny Chu - Chu Hoàng Anh] DEPLOY — ghi nhận khi cài demo lên VPS cPanel; kèm scripts/cap-nhat-cpanel.sh -->

**Triệu chứng.** `docker compose up -d` (hoặc `--build`, `--force-recreate`) dừng ở bước tạo lại container `web` với
`driver "overlay2" failed to remove root filesystem … unlinkat …/merged: device or resource busy`. Sau lỗi, `web` biến mất khỏi `docker compose ps`
(Compose đã đổi tên container cũ, nhưng không xoá được và không tạo được bản mới) → trang trả 503 qua reverse proxy. `docker rm -f` lặp lại,
`systemctl restart docker` đều không gỡ được. Dữ liệu **không** mất (nằm ở volume `pgdata` / `appdata`).

**Nguyên nhân.** Một dịch vụ khác trên máy (thường là máy có panel quản trị, web server hoặc công cụ bảo mật chạy với mount namespace riêng) giữ bản sao mount của
container. Không do phần mềm kế toán. Chỉ **khởi động lại máy** mới nhả hẳn.

**Cách tránh: dùng `scripts/cap-nhat-cpanel.sh` thay `scripts/cap-nhat.sh`** trên máy đã từng gặp lỗi này.
Script không bao giờ để Compose xoá/tạo lại `web`:

1. sao lưu → `git pull` → `docker compose build api web` (chưa đụng bản đang chạy);
2. `docker compose up -d db api` (db-migrate chạy qua `depends_on`; **không** gọi `up -d` cho cả bộ);
3. dừng mọi container web cũ, tạo container mới **tên khác** (`ketoan-web-<ngày-giờ>`, nhãn `ketoan.role=web`) trong cùng mạng Compose, cùng cổng `WEB_BIND:WEB_PORT`;
4. gỡ container cũ theo kiểu "cố gắng": lỗi busy chỉ cảnh báo vì bản cũ đã dừng;
5. kiểm web và `/api/v1/system/health/ready`.

Hậu quả cần biết:
- `docker compose ps` không còn hiện `web` (nó chạy ngoài Compose); dùng `docker ps --filter name=ketoan`.
- Không chạy `docker compose up -d` trần trên máy này cho đến khi container `web` cũ bị xoá hẳn (thường sau một lần khởi động lại máy); chạy thì Compose sẽ lại cố xoá và kẹt. Cần khởi động riêng một dịch vụ thì gọi đích danh (`docker compose up -d db api`).
- Container `web` không có biến môi trường nào; script dùng đúng ảnh Compose vừa build (`docker compose config --images`) nên giữ nguyên hành vi.
- Sau khi máy khởi động lại và `docker ps -a` không còn container web cũ ở trạng thái `Dead`, quay về `scripts/cap-nhat.sh` bình thường: `docker stop` mọi `ketoan-web-*` rồi `docker rm` chúng trước, để Compose tự tạo `web` của nó.

**Đừng làm:** lặp `docker rm -f`/`up`, xoá tay trong `/var/lib/docker/overlay2`, dừng cả dịch vụ Docker khi máy còn chạy dịch vụ khác dùng Docker.
