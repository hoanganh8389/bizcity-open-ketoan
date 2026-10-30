# Triển khai — chuẩn

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

## 3. Luật triển khai

| Mã | Luật |
|---|---|
| D-1 | Bí mật (`JWT_SECRET`, `DB_PASSWORD`, `SEED_API_KEY`, `WP_SSO_SECRET`) chỉ ở `.env` trên máy chủ, không vào git |
| D-2 | Không mở cổng 8088, 5434 ra Internet; người dùng chỉ đi qua 443 |
| D-3 | **Không bao giờ** `docker compose down -v` trên bản thật |
| D-4 | Cập nhật bằng `scripts/cap-nhat.sh` (sao lưu → pull → dựng → chờ khoẻ → in migration vừa áp), ngoài giờ làm việc |
| D-5 | Sao lưu hằng đêm `scripts/sao-luu.sh` (giữ 14 bản) **và** chép ra ngoài máy chủ; thử khôi phục ít nhất mỗi quý |
| D-6 | Một bản cài = một `name:` Docker Compose riêng; không đổi `name:` của bản đang chạy (đổi tên volume) |
| D-7 | Phát hành gắn nhãn phiên bản (`git tag vX.Y.Z`); image ghi nhãn `org.opencontainers.image.version` (Giai đoạn 3). Bản đang chạy: `GET /api/v1/system/health` trả `version`, `kernel`, `standard` |
| D-8 | Proxy TLS phía trước (cổng 443) gửi `Strict-Transport-Security: max-age=15552000`. nginx của container `web` đã gửi `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'`. Không đặt `X-Frame-Options` vì phần mềm được nhúng trong trang quản trị WP (R-SEC-11) |
| D-9 | API dùng vai trò CSDL thường `ketoan_app` (R-SEC-6): trong `.env` đặt `DB_APP_USER=ketoan_app` và `DB_APP_PASSWORD=<openssl rand -hex 24>` → `docker compose up -d` (job `db-migrate` bật đăng nhập cho vai trò, API kết nối bằng nó). Kiểm: `BIZCITY_PSQL="docker exec -i <db> psql -U ketoan_app -d ketoan" node tests/conformance/selfcheck.mjs --lane diagnostics` → DG-SEC-2 đạt |

## 4. Kiểm sau triển khai (bắt buộc — R-QG-10)

```bash
docker compose ps                                   # db, api, web Up; api healthy; db-migrate Exit 0
docker compose logs db-migrate | tail -20           # migration vừa áp
curl -s http://127.0.0.1:${WEB_PORT:-8088}/api/v1/system/health/ready              # L1: status "ready" (503 NOT_READY nếu chưa)
curl -s -H "X-Api-Key: $KEY" http://127.0.0.1:${WEB_PORT:-8088}/api/v1/system/diagnostics   # L3, khoá reports:read: summary.error = 0
```

Ghi kết quả vào phần "Bằng chứng" của phiếu phát hành theo [DIAGNOSTICS.md](DIAGNOSTICS.md) §4.
