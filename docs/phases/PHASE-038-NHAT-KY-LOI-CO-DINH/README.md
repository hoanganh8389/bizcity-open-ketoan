# PHASE-038 — Nhật ký lỗi cố định của bản cài: một thư mục, một lệnh gom, gửi về là đọc được
<!-- [2026-11-21 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — W0: sự cố go-live ketoan.btnet.vn 2026-11-21 (mọi /api/v1/* trả 503, giao diện chỉ báo INTERNAL_ERROR "không có mã"); bản cài chưa có tệp log cố định để gửi về -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-018 giám sát vận hành, PHASE-019 bàn điều tra; [OBSERVABILITY.md](../../ops/OBSERVABILITY.md) §2)
> **Phân hệ:** he-thong (vận hành)
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 đề xuất 2026-11-21**, chờ chủ dự án duyệt D038-1..4. Chưa có mã.
> **Phụ trách cần phối hợp:** nhóm Lõi (Platform: logger, `env`, hợp đồng lỗi) · người vận hành bản cài (aaPanel).
> **Tệp:** [10 — Nghiên cứu chuẩn ghi log lỗi](10-NGHIEN-CUU-GHI-LOG.md) · [40 — Checklist](40-MASTER-CHECKLIST.md)

## 1. Đề bài (chủ dự án, 2026-11-21)

Kéo `main` về máy chủ thật (ketoan.btnet.vn), dựng lại thì mọi lời gọi `/api/v1/*` trả **503**: `presence/ping`, `purchase/todo`, `system/addins`, `system/modules`, `apps`, `man-hinh`, `settings/…`. Giao diện hiện một chồng khay *Lỗi kỹ thuật · INTERNAL_ERROR · Mã tra cứu: (không có mã)*.

Cần: **một chỗ cố định trên máy chủ** chứa log lỗi, và một cách lấy về gửi cho người sửa (người hoặc trợ lý AI) đọc — không phải mỗi lần lại dò `docker compose logs`.

## 2. Sự thật đọc mã (origin/main 69e0c848)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Thân phản hồi 503 không phải JSON lỗi của API → giao diện rơi về `INTERNAL_ERROR` không `requestId` / `traceId`. Tức là **API không trả lời**; 503 do cổng vào (nginx aaPanel hoặc container `web`) sinh | `apps/web/src/lib/api.ts:91` |
| F2 | API chỉ tự trả 503 ở `/system/health/ready` (`NOT_READY`, có thân JSON) | `system.routes.ts:12`, `contracts/src/errors.ts:37` |
| F3 | Job `db-migrate` lỗi → API **không khởi động** (`depends_on: service_completed_successfully`); còn migration chưa áp → `main.ts` ném lỗi, `console.error`, thoát 1 → `restart: unless-stopped` khởi động lại mãi | `docker-compose.yml`, `apps/api/src/main.ts` |
| F4 | Log API: pino JSON một dòng ra **stdout**. Chỉ vào Loki khi bật bộ giám sát (9 container) — bản cài aaPanel thường không bật | [OBSERVABILITY §2](../../ops/OBSERVABILITY.md) |
| F5 | stdout nằm trong tệp json-file của Docker `/var/lib/docker/containers/<id>/<id>-json.log` — **id đổi mỗi lần dựng lại**, mất khi xoá container, **không giới hạn dung lượng** (compose không khai `logging:`) | `docker-compose.yml` |
| F6 | nginx của `web` không khai `error_log` / `access_log` riêng; lỗi upstream (api chết) chỉ ra stdout của `web` | `docker/nginx.conf` |
| F7 | Lỗi khởi động (F3) đi qua `console.error`, không qua pino → không có `level`, `time`, khó lọc | `apps/api/src/main.ts` |
| F8 | Giao diện bắn một khay cho **mỗi** yêu cầu hỏng (29 lỗi / vài giây khi `presence/ping` gọi lặp); không phân biệt "API sập" với "API trả lỗi" | `apps/web/src/lib/api.ts`, khay lỗi |

**Kết luận:** chưa có cơ chế log lỗi cố định cho bản cài. Có log, có trace, có bằng chứng — nhưng đều cần bộ giám sát hoặc thao tác Docker mới lấy được, và lỗi quan trọng nhất (API không lên được) lại là lỗi khó thấy nhất.

## 3. Một câu chốt

**Mọi bản cài có thư mục `logs/` ngay trong thư mục cài, đường dẫn không đổi qua mọi lần cập nhật; một lệnh `./scripts/lay-log.sh` gom thành một tệp nén gửi được.** Bộ giám sát (Loki, Tempo) vẫn là đường điều tra sâu; `logs/` là đường tối thiểu luôn có.

## 4. Thiết kế

### 4.1 Thư mục và tệp

```
<thư mục cài>/logs/            (bind mount, .gitignore; LOG_DIR trong container = /app/logs)
  api-loi.log                  API: dòng pino mức ≥ warn (5xx có err.stack, reqId, traceId, route) + lỗi khởi động (fatal)
  db-migrate.log               job db-migrate: mỗi lần chạy một khối — giờ, commit, migration áp / lỗi đầy đủ
  web-loi.log                  nginx web: error_log + dòng truy cập có mã ≥ 500 (biết 502/503/504 sinh ở đâu, upstream nào)
  goi-bao-loi-<YYYYMMDD-HHMM>.tar.gz   do lay-log.sh tạo
```

- Xoay vòng theo ngày **hoặc** dung lượng; **cả thư mục ≤ 200 MB** (D038-2), chia tệp ở [10 §7.3](10-NGHIEN-CUU-GHI-LOG.md). Không bao giờ lớn vô hạn.
- Docker: mọi dịch vụ khai `logging: json-file, max-size 10m, max-file 3` (F5) — stdout vẫn đủ, chỉ có trần.
- Nội dung tuân R-SEC-10 / R-TEN-8 như log stdout: **không** thân yêu cầu, token, mật khẩu, MST / SĐT cá nhân, số tài khoản. Cùng bộ lọc `redact` của pino, không viết bộ lọc thứ hai.

### 4.2 API

- Logger Platform dùng `pino.multistream`: stdout (như cũ, mức `LOG_LEVEL`) + tệp `api-loi.log` (mức `LOG_FILE_LEVEL`, mặc định `warn`). `LOG_DIR` trống = tắt tệp (dev, test).
- `main.ts`: lỗi khởi động đi qua pino `fatal` **và** ghi đồng bộ vào `api-loi.log` trước `process.exit(1)` (F3, F7). Dòng có `evt: bizcity.system.start_failed`, `reason` (`MIGRATION_PENDING`, `DB_UNREACHABLE`, `ENV_INVALID`, …).
- `db/setup.js` (job): ghi `db-migrate.log` — đầu khối có commit (`BIZCITY_GIT_SHA`), danh sách migration sẽ áp; lỗi có tên tệp migration, mã PG, câu thông báo.

### 4.3 Cổng vào (container `web`)

- `error_log /var/log/ketoan/web-loi.log warn;` và `access_log … if=$loi5xx` (map `$status ~ ^5`).
- Khi api không trả lời: nginx trả **JSON** `{"error":{"code":"GATEWAY_UNAVAILABLE",…}}` qua `error_page 502 503 504` → giao diện có mã để hiện (F1). Mã mới vào `packages/contracts/src/errors.ts` theo R-ERR (sinh bằng `scripts/sinh-ma-loi.mjs`).
- Proxy aaPanel phía trước vẫn có thể tự trả 503 — sổ tay ghi cách xem log aaPanel (`/www/wwwlogs/<tên miền>.error.log`).

### 4.4 Lệnh gom `scripts/lay-log.sh`

Một lệnh, không tham số bắt buộc, chạy được cả khi API chết:

1. `git rev-parse HEAD`, nhánh, `git status --short` (chỉ tên tệp).
2. `docker compose ps -a` (thấy `db-migrate Exit 1`, `api Restarting`).
3. `curl` `/api/v1/system/health` và `/health/ready` qua `127.0.0.1:${WEB_PORT}`.
4. `docker compose logs --no-color --timestamps --tail 2000` cho `db-migrate`, `api`, `web`, `db`.
5. Ba tệp `logs/*.log` (14 ngày gần nhất hoặc `--tu YYYY-MM-DD`).
6. Tên biến trong `.env` (**không** giá trị).
7. Nén → `logs/goi-bao-loi-<giờ>.tar.gz`, in đường dẫn và kích thước.

Người vận hành tải tệp đó về (aaPanel → Files) và gửi kèm mô tả. Người sửa / trợ lý AI đọc được ngay, không cần vào máy chủ.

### 4.5 Giao diện

- Lỗi `GATEWAY_UNAVAILABLE` (hoặc 5xx không phải JSON): **một** khay "Không kết nối được máy chủ phần mềm" thay cho N khay `INTERNAL_ERROR`; hướng dẫn: báo quản trị chạy `./scripts/lay-log.sh` (F8). Thuật ngữ cho người dùng, không mã kỹ thuật trên dòng chính.
- `presence/ping` và các lời gọi lặp: lùi dần (backoff) khi gặp 5xx liên tiếp, không dội cổng vào.

## 5. Quyết định chờ duyệt

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| D038-1 | Thư mục cố định ở đâu | `./logs` trong thư mục cài (cùng chỗ `backups/`), đổi được bằng `LOG_HOST_DIR` trong `.env` |
| D038-2 | Giữ bao lâu, trần dung lượng | ✅ **chủ dự án duyệt 2026-11-21: tối đa 200 MB** cho thư mục `logs/`; chia tệp ở [10 §7.3](10-NGHIEN-CUU-GHI-LOG.md) <!-- [2026-11-21 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — D038-2 chốt 200 MB --> |
| D038-3 | Tệp API ghi từ mức nào | `warn` (đủ 4xx bất thường + 5xx + fatal); `info` chỉ ở stdout / Loki |
| D038-4 | Nút "Báo lỗi" trên khay có tự đính gói log không | **Không** ở phase này (cần quyền quản trị, có rủi ro lộ dữ liệu); chỉ hướng dẫn chạy `lay-log.sh` |

## 6. Ngoài phạm vi

- Thay bộ giám sát, đổi Loki / Tempo, đổi định dạng log stdout.
- Gửi log ra dịch vụ ngoài (Sentry…).
- Log của trình duyệt gửi về máy chủ (khi API chết thì cũng không gửi được).
