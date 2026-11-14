# Sao lưu, khôi phục và nâng cấp bản cài <!-- [2026-11-13 08:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-9: sổ tay sao lưu, kiểm, khôi phục thử, khôi phục thật, nâng cấp -->

Sổ tay cho người vận hành một bản cài chạy bằng Docker Compose (`docker-compose.yml`: service `db`, `db-migrate`, `api`, `web`). Mọi lệnh chạy từ thư mục gốc của bản cài (vd `/www/wwwroot/tgs-ketoan`).

Nguyên tắc: **bản sao lưu chỉ có giá trị khi đã kiểm và khôi phục thử được** (R-BAK-3, `docs/rules/RULE-INFRASTRUCTURE.md`). Trước mỗi lần nâng cấp phải có một bản sao lưu vừa tạo và đã kiểm — `scripts/cap-nhat.sh` tự làm việc này.

## 1. Công cụ

| Lệnh | Làm gì | Chạm CSDL đang chạy? |
|---|---|---|
| `./scripts/sao-luu.sh` | `pg_dump` CSDL `ketoan` ra `backups/ketoan-<ngày-giờ>.sql.gz`, tự kiểm bản vừa tạo; nén thư mục dữ liệu của API ra `backups/tep-<ngày-giờ>.tar.gz` | chỉ đọc |
| `./scripts/sao-luu.sh --kiem <tệp>` | kiểm một bản: tệp có, khác rỗng, `gunzip -t` đọc hết, có đầu và dòng kết thúc của `pg_dump`, có đoạn dữ liệu sổ cái (`COPY public.ledger_entries`), đếm bảng / đoạn dữ liệu | không |
| `./scripts/khoi-phuc-thu.sh <tệp>` | nạp vào CSDL tạm `ketoan_khoi_phuc_thu` trong container `db`, đếm dòng các bảng chính, kiểm Nợ = Có, rồi xoá CSDL tạm | không |
| `./scripts/kiem-khoi-phuc.sh [<tệp> \| --fresh]` | kiểm sâu hơn: nạp vào CSDL tạm, chạy lane diagnostics của bộ kiểm chuẩn (số dư, đảo, chuỗi bằng chứng, trigger…), so số dòng với nguồn, ghi `backups/kiem-khoi-phuc.log` | không |
| `./scripts/sao-luu-goc.sh` | sao lưu gốc cho khôi phục tới một thời điểm (PITR) — cần bật lưu WAL, xem `infrastructure/backup/README.md` | chỉ đọc |
| `./scripts/cap-nhat.sh [--yes]` | nâng cấp: sao lưu → kiểm → in "Sắp đổi gì" → xác nhận → lấy code → dựng lại → chờ API khoẻ; lỗi thì in lệnh lùi | nâng cấp CSDL qua `db-migrate` |

## 2. Lịch sao lưu và giữ bao lâu

Cron hằng đêm (01:30), ghi nhật ký:

```cron
30 1 * * * cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu.sh >> backups/sao-luu.log 2>&1
0  3 * * 0 cd /www/wwwroot/tgs-ketoan && ./scripts/kiem-khoi-phuc.sh >> backups/kiem-khoi-phuc-cron.log 2>&1
```

- Thư mục: `./backups` (đổi bằng `BACKUP_DIR=/duong/dan`).
- Giữ **14 bản** gần nhất mỗi loại (`ketoan-*.sql.gz`, `tep-*.tar.gz`); đổi bằng `BACKUP_KEEP=30`. Bản cũ hơn bị xoá **chỉ khi** bản mới đã kiểm đạt.
- Bản vừa tạo mà kiểm hỏng: đổi đuôi thành `.sql.gz.hong`, script thoát lỗi, bản cũ giữ nguyên. Cron nên gửi thư / cảnh báo khi mã thoát khác 0 (vd `|| curl …` tới kênh cảnh báo).
- Mỗi tuần một lần chạy `scripts/kiem-khoi-phuc.sh` (dòng thứ hai ở trên) hoặc ít nhất `scripts/khoi-phuc-thu.sh`.

## 3. Chép ra máy khác

Bản sao lưu nằm cùng ổ với CSDL thì mất máy là mất cả hai. Sau sao lưu đêm, chép thư mục `backups/` ra máy / kho khác, vd:

```bash
rsync -a --include='ketoan-*.sql.gz' --include='tep-*.tar.gz' --exclude='*' backups/ backup@may-khac:/kho/ketoan/
# hoặc: rclone copy backups/ kho-s3:ketoan-backups --include 'ketoan-*.sql.gz' --include 'tep-*.tar.gz'
```

Giữ ở máy khác lâu hơn (vd 90 ngày + bản cuối mỗi tháng). Tệp sao lưu chứa toàn bộ sổ sách và danh mục: chép qua kênh mã hoá, giới hạn người đọc.

## 4. Kiểm một bản sao lưu

```bash
./scripts/sao-luu.sh --kiem backups/ketoan-20261113-013000.sql.gz
# ✔ ĐẠT: backups/ketoan-….sql.gz (12M) — 250 bảng, 250 đoạn dữ liệu, có sổ cái
```

Không cần CSDL chạy. Mã thoát khác 0 = bản hỏng (rỗng, nén cắt cụt, không phải `pg_dump`, dừng giữa chừng, thiếu sổ cái). `sao-luu.sh` và `cap-nhat.sh` tự gọi bước này.

## 5. Khôi phục thử

```bash
./scripts/khoi-phuc-thu.sh backups/ketoan-20261113-013000.sql.gz
```

- Nạp vào CSDL tạm `ketoan_khoi_phuc_thu` trong container `db` đang chạy; **từ chối** nếu tên CSDL tạm trùng CSDL đang chạy (`ketoan`) hoặc không chứa `khoi_phuc`.
- In số dòng: `tenants`, `accounting_events`, `ledger_entries`, `ledger_lines`, `partners`, `products`, `items`, `document_attachments` (bảng không có thì ghi "không có bảng").
- Kiểm `ledger_lines`: tổng `debit` = tổng `credit` và không bút toán (`entry_id`) nào lệch.
- Luôn xoá CSDL tạm khi kết thúc, cả khi lỗi giữa chừng. Mã thoát 0 = khôi phục được và sổ cân.

Muốn kiểm sâu (toàn bộ bộ chẩn đoán) thì dùng `scripts/kiem-khoi-phuc.sh`.

## 6. Khôi phục thật (GHI ĐÈ toàn bộ dữ liệu)

Bản sao lưu tạo bằng `--clean --if-exists`: nạp vào CSDL `ketoan` sẽ **xoá và tạo lại mọi bảng** — mọi thứ ghi sau giờ sao lưu mất hết.

Danh sách kiểm trước khi khôi phục:

1. Đã chọn đúng tệp (giờ sao lưu trước sự cố) và `./scripts/sao-luu.sh --kiem <tệp>` ĐẠT.
2. Đã chạy `./scripts/khoi-phuc-thu.sh <tệp>` ĐẠT (số dòng hợp lý, sổ cân).
3. Đã sao lưu **trạng thái hiện tại** (`./scripts/sao-luu.sh`) — để còn đường quay lại nếu chọn nhầm bản.
4. Đã báo người dùng ngừng nhập liệu; ghi lại các chứng từ nhập sau giờ sao lưu để nhập lại.
5. Code đang chạy cùng phiên bản (hoặc mới hơn) với lúc sao lưu: lùi code thì `git checkout <commit lúc đó>` trước.

Lệnh:

```bash
docker compose stop api
gunzip -c backups/ketoan-20261113-013000.sql.gz | docker compose exec -T db psql -U ketoan -d ketoan
docker compose start api
# tệp dữ liệu của API (trợ lý, tệp đính kèm, bằng chứng niêm phong) — cùng giờ với bản CSDL:
docker compose exec -T api sh -c 'tar xzf - -C /app/apps/api/data' < backups/tep-20261113-013000.tar.gz
```

Sau khi khôi phục: chạy tự chẩn đoán sổ (GET /api/v1/system/diagnostics, `docs/ops/DIAGNOSTICS.md`), đăng nhập thử, xem bảng cân đối số phát sinh.

## 7. Những gì KHÔNG nằm trong bản sao lưu CSDL

| Thứ | Ở đâu | Cách giữ |
|---|---|---|
| `.env` (mật khẩu CSDL, `JWT_SECRET`, `DB_APP_PASSWORD`, khoá dịch vụ) | gốc bản cài | chép riêng vào kho bí mật; mất `JWT_SECRET` thì mọi phiên đăng nhập hết hạn, mất `DB_APP_PASSWORD` thì đặt lại |
| Bộ dữ liệu gốc của công ty (`SEEDS_DIR`) | thư mục ngoài repo, vd `/srv/bizcity/seeds` | sao lưu riêng thư mục đó (xem `db/seeds/README.md`) |
| Tệp đính kèm chứng từ, bằng chứng niêm phong, dữ liệu trợ lý | ổ `appdata` → `/app/apps/api/data` trong container `api` (`DATA_DIR`, `packages/platform/src/core/documents.ts`) | `sao-luu.sh` nén riêng ra `tep-*.tar.gz` **khi container `api` đang chạy**; CSDL chỉ giữ siêu dữ liệu + sha256 (`document_attachments`) |
| WAL / khôi phục tới thời điểm | ổ `walbackup` (khi bật PITR) | `scripts/sao-luu-goc.sh`, `infrastructure/backup/README.md` |
| Cấu hình cổng vào (nginx, chứng chỉ TLS), cron | máy chủ | chép riêng |

## 8. Nâng cấp bằng `cap-nhat.sh`

```bash
./scripts/cap-nhat.sh          # hỏi xác nhận
./scripts/cap-nhat.sh --yes    # không hỏi (cron / ssh không tty bắt buộc --yes)
```

Các bước:

1. **Sao lưu** (khi `db` đang chạy) rồi `sao-luu.sh --kiem` bản mới nhất — hỏng thì **dừng**, chưa đổi gì.
2. **Sắp đổi gì** (sau `git fetch`, chưa đổi code): số commit mới, migration mới trong `db/migrations` (áp vào CSDL, không tự lùi được), tệp `db/seeds` đổi, `SEEDS_DIR` trong `.env` có đặt không, và **cảnh báo** khi `db/seeds` là bộ giả lập (dòng đầu `"_nguon": "gia-lap"`) mà chưa đặt `SEEDS_DIR`.
3. **Xác nhận** (`c` để tiếp tục). Không có bàn phím mà thiếu `--yes` thì thoát, chưa đổi gì.
4. `git pull --ff-only`, thêm `DB_APP_PASSWORD` vào `.env` nếu bản cài cũ chưa có, `docker compose up -d --build` (job `db-migrate` áp migration trước khi API chạy), chờ API khoẻ tối đa 2 phút.
5. Lỗi ở bước dựng / khởi động / khoẻ: script in nhật ký và **lệnh lùi** đúng commit cũ và đúng tệp vừa sao lưu:

```bash
git checkout <commit cũ>
docker compose stop api
gunzip -c backups/ketoan-<giờ vừa sao lưu>.sql.gz | docker compose exec -T db psql -U ketoan -d ketoan
docker compose up -d --build
```

Sau khi lùi, bản cài ở trạng thái "HEAD tách" (detached); sửa xong nguyên nhân thì `git checkout main` rồi chạy lại `cap-nhat.sh`.

## 9. Rủi ro mất dữ liệu: "Quay về dữ liệu gốc" (TI08)

Nút *Quay về dữ liệu gốc* (màn TI08, nút ở đầu các màn danh mục) chép đè danh mục của đơn vị bằng các tệp trong thư mục dữ liệu gốc. Từ S030-53, `db/seeds` trên repo là **bộ giả lập** cho 11 danh mục định danh / tổ chức / mặt hàng. Bản cài thật chưa đặt `SEEDS_DIR` mà bấm nút này sẽ nạp đối tượng, nhân viên, ngân hàng, chi nhánh, kho, mặt hàng **giả** vào đơn vị thật.

- Đặt `SEEDS_DIR` tới bộ danh mục của công ty, ngoài repo — cách làm ở `db/seeds/README.md`.
- Đặt trong `.env`; `docker-compose.yml` gắn thư mục chỉ đọc vào `api` và `db-migrate` (S036-11) <!-- [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: compose truyền SEEDS_DIR -->. Kiểm ở TI08: dải *Đang đọc bộ danh mục của công ty*.
- `cap-nhat.sh` **dừng** trước khi kéo mã nếu `SEEDS_DIR` đặt mà thư mục không có (Docker sẽ tạo thư mục rỗng thay vào) hoặc thiếu tệp so với `db/seeds` của bản mới.
- `cap-nhat.sh` cảnh báo ở bước "Sắp đổi gì" khi chưa đặt `SEEDS_DIR` mà `db/seeds` là bộ giả lập.
- Luôn có bản sao lưu đã kiểm trước khi bấm nút này.
