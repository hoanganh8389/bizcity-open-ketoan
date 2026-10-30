# Sao lưu và khôi phục tới một thời điểm (PITR)

Luật: [R-BAK-1..6](../../docs/rules/RULE-INFRASTRUCTURE.md). Phase: [PHASE-008](../../docs/phases/PHASE-008-SAO-LUU-PITR/README.md).
**Chỉ dùng PostgreSQL**: lưu WAL bằng `archive_command`, sao lưu gốc bằng `pg_basebackup`, khôi phục bằng `recovery_target_time`. Không cần wal-g / pgBackRest ([ADR-0007](../../docs/adr/ADR-0007-goi-chia-se-va-ha-tang.md)); dùng chúng khi muốn đẩy thẳng lên S3.

| Lớp | Công cụ | Khôi phục được | Lịch |
|---|---|---|---|
| Bản logic hằng ngày | `scripts/sao-luu.sh` (`pg_dump`, R-BAK-1) | về đúng lúc sao lưu | hằng đêm |
| Bản gốc + WAL liên tục | lớp này (R-BAK-2) | **tới một thời điểm bất kỳ** sau bản gốc; mất tối đa ~1 phút (RPO) | bản gốc hằng tuần; WAL liên tục |
| Kiểm khôi phục | `scripts/kiem-khoi-phuc.sh` (R-BAK-3), `scripts/dien-tap-pitr.sh` (G3-07) | — | hằng tuần; trước mỗi lần nâng cấp |

## 1. Bật lưu WAL

```bash
docker compose -f docker-compose.yml -f infrastructure/backup/docker-compose.pitr.yml up -d db
docker compose -f docker-compose.yml -f infrastructure/backup/docker-compose.pitr.yml exec db psql -U ketoan -d ketoan -c "SHOW archive_mode"   # on
```

- `db` khởi động lại vài giây; dữ liệu không đổi.
- Từ đây mọi lệnh `docker compose` của bản cài nên kèm cả hai tệp `-f` (hoặc đặt `COMPOSE_FILE=docker-compose.yml:infrastructure/backup/docker-compose.pitr.yml` trong `.env`).
- WAL và bản gốc nằm ở ổ `walbackup`, tách khỏi ổ dữ liệu `pgdata`.

## 2. Sao lưu gốc

```bash
./scripts/sao-luu-goc.sh                   # /backup/base/<ngày-giờ>/  (base.tar.gz + pg_wal.tar.gz)
BASE_KEEP=4 ./scripts/sao-luu-goc.sh       # giữ 4 bản gốc; WAL cũ hơn bản gốc cũ nhất được dọn (pg_archivecleanup)
```

Cron đề xuất: `0 2 * * 0 cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu-goc.sh >> backups/sao-luu-goc.log 2>&1`.

**Đưa ra ngoài máy chủ (bắt buộc ở bản cài thật):** chép ổ `walbackup` sang nơi khác, có mã hoá (R-BAK-1, R-BAK-6).
- Ví dụ `rclone sync` với remote `crypt` mỗi 5 phút.
- Hoặc gắn `/backup` vào ổ mạng.

Hỏng cả máy mà `/backup` chỉ nằm trên chính máy đó thì PITR không cứu được.

## 3. Khôi phục tới thời điểm T

1. Dừng API (`docker compose stop api`). Giữ nguyên ổ `pgdata` cũ cho tới khi khôi phục xong và đã kiểm.
2. Chọn bản gốc **mới nhất trước T** trong `/backup/base/`.
3. Tạo ổ dữ liệu mới, giải nén bản gốc, ghi cấu hình khôi phục:

   ```bash
   docker volume create ketoan_pgdata_restore
   docker run --rm -v ketoan_walbackup:/backup -v ketoan_pgdata_restore:/var/lib/postgresql/data postgres:16-alpine sh -c '
     D=/var/lib/postgresql/data; B=/backup/base/<bản-gốc>
     tar xzf $B/base.tar.gz -C $D && mkdir -p $D/pg_wal && tar xzf $B/pg_wal.tar.gz -C $D/pg_wal
     echo "restore_command = '"'"'cp /backup/wal/%f %p'"'"'" >> $D/postgresql.auto.conf
     echo "recovery_target_time = '"'"'2026-10-30 14:05:00+07'"'"'" >> $D/postgresql.auto.conf
     echo "recovery_target_action = '"'"'promote'"'"'" >> $D/postgresql.auto.conf
     touch $D/recovery.signal && chown -R postgres:postgres $D && chmod 700 $D'
   ```
4. Trỏ service `db` vào ổ mới (đổi `pgdata` → `ketoan_pgdata_restore` trong override), `up -d db`, chờ `SELECT pg_is_in_recovery()` = `f`.
5. **Kiểm trước khi mở lại:**

   ```bash
   BIZCITY_PSQL="docker compose exec -T db psql -U ketoan -d ketoan" node tests/conformance/selfcheck.mjs
   ```

   Lane diagnostics phải ĐẠT (Nợ = Có, chuỗi bằng chứng, trigger).
6. `docker compose start api`. Ghi lại: T, bản gốc dùng, thời gian khôi phục, kết quả kiểm.

`scripts/dien-tap-pitr.sh` làm đúng các bước 3–5 trên container tạm. Đọc script để thấy lệnh chạy được thật.

## 4. Diễn tập (G3-07)

```bash
./scripts/dien-tap-pitr.sh                      # dữ liệu từ CSDL ketoan của bản cài
SRC_DB=ketoan_test ./scripts/dien-tap-pitr.sh   # máy dev
```

Script làm trên **container tạm**, không đụng CSDL đang chạy:
1. Chép dữ liệu thật, sao lưu gốc.
2. Ghi dấu trước mốc T, rồi ghi dấu sau mốc + một "sự cố" (xoá bảng).
3. Bỏ máy nguồn, khôi phục tới T.
4. Kiểm: dấu trước mốc còn, dấu sau mốc không có, bảng bị xoá còn nguyên, số bút toán bằng lúc T, lane diagnostics ĐẠT.
5. In RTO / RPO, ghi `backups/dien-tap-pitr.log`.

Biên bản mỗi lần diễn tập: `docs/audits/PITR-<ngày>.md`.

| Mục tiêu (R-BAK-2) | Đo được ở máy dev 2026-10-30 ([biên bản](../../docs/audits/PITR-2026-10-30.md)) |
|---|---|
| RPO ≤ 15 phút | ≤ 60 giây (`archive_timeout`) |
| RTO ≤ 4 giờ | 8 giây với 445 MB / 13.428 bút toán (chưa tính thời gian chép bản gốc từ ngoài máy chủ về) |
