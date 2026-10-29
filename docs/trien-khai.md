# Triển khai lên máy chủ

Hướng dẫn cho máy chủ **Ubuntu có aaPanel và Docker**. Phần mềm chạy trong ba container (`db`, `api`, `web`); aaPanel làm cổng vào: tên miền, HTTPS và chuyển tiếp tới container `web`.

```
Trình duyệt ──HTTPS──▶ aaPanel (Nginx, tên miền, chứng chỉ) ──▶ 127.0.0.1:8088 (web) ──▶ api ──▶ db
Hệ thống bán hàng cùng máy chủ ─────────────────────────────▶ 127.0.0.1:8088/api/v1/...
```

## 1. Chuẩn bị

- Cài Docker nếu chưa có: aaPanel → **Docker** → Install. Kiểm tra bằng `docker compose version`.
- Chọn một tên miền con cho phần mềm, ví dụ `ketoan.tencongty.vn`, trỏ bản ghi A về máy chủ.
- Ổ đĩa còn trống ít nhất 5 GB cho ảnh Docker; dữ liệu kế toán tăng chậm (vài trăm MB mỗi năm ở quy mô vài chục cửa hàng).

## 2. Cài lần đầu

Mở **Terminal** trong aaPanel (hoặc SSH):

```bash
cd /www/wwwroot
git clone https://github.com/Thuy2k/tgs-ketoan.git
cd tgs-ketoan
cp .env.example .env
chmod +x scripts/*.sh
nano .env
```

Sửa các dòng sau trong `.env`:

| Biến | Đặt thành | Ghi chú |
|---|---|---|
| `JWT_SECRET` | Chuỗi ngẫu nhiên, lấy bằng `openssl rand -hex 32` | Bắt buộc. Đổi chuỗi này thì mọi người phải đăng nhập lại |
| `DB_PASSWORD` | Mật khẩu mạnh, lấy bằng `openssl rand -hex 16` | Đặt **trước** lần chạy đầu; đổi sau phải đổi cả trong PostgreSQL |
| `WEB_BIND` | `127.0.0.1` | Chỉ cho aaPanel và các phần mềm cùng máy gọi vào, không mở cổng 8088 ra Internet |
| `WEB_PORT` | `8088` (đổi nếu cổng đã có phần mềm khác dùng) | Kiểm tra bằng `ss -ltnp \| grep 8088` |
| `CORS_ORIGINS` | `https://ketoan.tencongty.vn` | Đúng địa chỉ người dùng sẽ mở |
| `SEED_TENANT_CODE`, `SEED_TENANT_NAME` | Mã và tên đơn vị thật | Ví dụ `tgs`, tên công ty. Không dùng `demo` cho dữ liệu thật |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Email và mật khẩu quản trị | Đăng nhập xong đổi mật khẩu ngay |
| `SEED_API_KEY` | Chuỗi bắt đầu bằng `kt_`, ví dụ `kt_` + `openssl rand -hex 24` | Khoá để hệ thống bán hàng gửi chứng từ |

Chạy:

```bash
docker compose up -d --build
docker compose ps          # ba dịch vụ đều Up, api "healthy"
curl -s http://127.0.0.1:8088/api/v1/system/health
```

Lần đầu mất vài phút để dựng. Cơ sở dữ liệu được tạo và nạp hệ thống tài khoản, loại thuế, cấu hình định khoản mặc định.

## 3. Tên miền và HTTPS (aaPanel)

1. **Website → Add site**: nhập tên miền con, không cần PHP, không cần cơ sở dữ liệu.
2. Mở site vừa tạo → **Reverse proxy → Add**: Target URL `http://127.0.0.1:8088`, Send domain `$host`.
3. **SSL → Let's Encrypt**: cấp chứng chỉ, bật **Force HTTPS**.
4. Mở `https://ketoan.tencongty.vn`, đăng nhập bằng mã đơn vị, email và mật khẩu đã đặt.

Không mở cổng 8088 và 5434 trong tường lửa; người dùng chỉ đi qua cổng 443.

## 4. Nối hệ thống bán hàng

### Máy chủ hiện tại (cùng máy với trang quản trị bán hàng)

| Mục | Giá trị |
|---|---|
| Thư mục WordPress | `/www/wwwroot/quantri.thegioisua.com` |
| Thư mục phần mềm kế toán | `/www/wwwroot/tgs-ketoan` (ngang hàng, **không** đặt trong thư mục WordPress) |
| Plugin nối | `wp-content/plugins/tgs_accounting_bridge` (bản 0.3.0 trở lên) |
| Địa chỉ gọi nội bộ | `http://127.0.0.1:8088` (WordPress gọi thẳng, không qua tên miền) |

Trước khi chạy `docker compose up` lần đầu: kiểm tra cổng `8088` và `5434` chưa có phần mềm nào dùng (`ss -ltnp | grep -E '8088|5434'`); trùng thì đổi `WEB_PORT` / `DB_PORT` trong `.env`. Docker không đụng tới Nginx, PHP, MySQL của aaPanel.

Sau khi cài plugin bản mới, trong trang quản trị bán hàng có:
- **Quản trị → Kế toán → Cổng kế toán**: cài đặt kết nối, kiểm tra kết nối, gửi chứng từ, nhật ký, danh mục API;
- nút **⇄ Đẩy sang Kế toán** ở màn Quản lý phiếu xuất bán (VAT).

### Khai kết nối

Trong `wp-config.php` của WordPress (cùng máy chủ thì gọi nội bộ, không ra Internet):

```php
define('TGS_KETOAN_API_URL', 'http://127.0.0.1:8088');
define('TGS_KETOAN_API_KEY', 'kt_...');   // đúng giá trị SEED_API_KEY
```

Thử một shop, một ngày, chưa gửi thật:

```bash
php wp-content/plugins/tgs_accounting_bridge/tools/day-ke-toan.php --blog=<id> --from=2026-10-01 --to=2026-10-01 --dry
```

Thấy đúng thì bỏ `--dry`. Cũng làm được trên giao diện: Cổng kế toán → **Cài đặt → Kiểm tra kết nối**, rồi tab **Gửi chứng từ → Xem trước**. Sau đó đặt lịch ở aaPanel → **Cron** (Shell script), ví dụ mỗi 30 phút:

```bash
cd /www/wwwroot/<thư mục WordPress> && php wp-content/plugins/tgs_accounting_bridge/tools/day-ke-toan.php --all --days=2
```

## 4b. Chuyển máy chủ đang chạy bản khoá UUID sang bản `id` số tự tăng (làm một lần, 10/2026)

Bản mới vẫn dùng **PostgreSQL**, nhưng khoá chính là `id` số tự tăng (1, 2, 3…) thay cho chuỗi UUID. Cơ sở dữ liệu được tạo mới trên ổ dữ liệu mới (`pgdata`); ổ cũ (`dbdata`) giữ nguyên để tra lại. Dữ liệu bán hàng gửi lại từ hệ thống bán hàng (gửi lại không ghi trùng). Làm ngoài giờ làm việc, dán **từng dòng**.

**1. Trước khi lấy code mới:**

```bash
cd /www/wwwroot/tgs-ketoan
```
```bash
./scripts/sao-luu.sh
```
```bash
docker compose exec -T db psql -U ketoan -d ketoan -At -c "select format('INSERT INTO users (tenant_id,email,full_name,password_hash,role,is_active) SELECT id,%L,%L,%L,%L,%L FROM tenants WHERE code=%L ON CONFLICT (tenant_id,email) DO UPDATE SET full_name=EXCLUDED.full_name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, is_active=EXCLUDED.is_active;', u.email, u.full_name, u.password_hash, u.role, u.is_active, t.code) from users u join tenants t on t.id = u.tenant_id" > backups/nguoi-dung.sql
```
Xuất người dùng **kèm mật khẩu đã băm**: các chị đăng nhập lại bằng đúng mật khẩu cũ.

```bash
docker compose exec -T db psql -U ketoan -d ketoan -c "select t.code, d.doc_type, d.doc_no, d.doc_date from source_documents d join tenants t on t.id = d.tenant_id where d.source_system = 'manual' and d.status = 'posted' order by 1, 4"
```
Phiếu nhập tay (thu, chi, phiếu kế toán, số dư đầu kỳ) đã lập: nếu có, chụp lại danh sách để lập lại trên bản mới.

**2. Lấy code mới và dựng** (`.env` giữ nguyên, khoá API giữ nguyên nên WordPress không phải sửa gì):

```bash
git pull
```
```bash
docker compose up -d --build
```
```bash
curl -s http://127.0.0.1:8088/api/v1/system/health
```

**3. Nạp lại người dùng:**

```bash
docker compose exec -T db psql -U ketoan -d ketoan < backups/nguoi-dung.sql
```

**4. Gửi lại chứng từ bán hàng:** trang quản trị bán hàng → Quản trị → Kế toán → **Cổng kế toán** → **Gửi chứng từ**: chọn tất cả shop, từ ngày bắt đầu dùng tới hôm nay, **tích "Gửi lại cả chứng từ không đổi"** → Xem trước → Gửi.

**5. Đối chiếu:**

```bash
cd /www/wwwroot/quantri.thegioisua.com && php wp-content/plugins/tgs_accounting_bridge/tools/doi-chieu-ke-toan.php --all --from=2026-10-01 --to=2026-10-31
```

**6. Sau 1–2 tuần chạy ổn:** `docker volume rm ketoan_dbdata` để lấy lại chỗ trống (bản sao lưu ở bước 1 vẫn còn trong `backups/`).

## 5. Sao lưu

aaPanel → **Cron** → Shell script, chạy 01:30 hằng đêm:

```bash
cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu.sh >> backups/sao-luu.log 2>&1
```

Bản sao lưu nằm ở `backups/`, giữ 14 bản gần nhất. **Nên chép thêm ra ngoài máy chủ** (ổ khác, máy khác hoặc lưu trữ đám mây): máy chủ hỏng ổ thì bản sao lưu cùng ổ cũng mất. Cách khôi phục ghi ở đầu `scripts/sao-luu.sh`.

Thử khôi phục một lần trên máy khác trước khi tin vào bản sao lưu.

## 6. Cập nhật phiên bản

```bash
cd /www/wwwroot/tgs-ketoan && ./scripts/cap-nhat.sh
```

Kịch bản làm lần lượt: sao lưu → `git pull` → dựng lại → chờ API lên khoẻ → in các migration vừa áp. Phần mềm gián đoạn chừng vài chục giây, nên cập nhật ngoài giờ làm việc.

## 7. Vận hành

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `docker compose ps` |
| Xem nhật ký API | `docker compose logs -f --tail 100 api` |
| Khởi động lại | `docker compose restart api` |
| Dừng, **giữ** dữ liệu | `docker compose down` |
| Vào cơ sở dữ liệu | `docker compose exec db psql -U ketoan -d ketoan` |

**Không bao giờ chạy `docker compose down -v`**: tham số `-v` xoá luôn toàn bộ dữ liệu kế toán.

## 8. Kiểm tra sau khi cài

- [ ] `https://…` mở được, có ổ khoá HTTPS.
- [ ] Đăng nhập được; đã đổi mật khẩu quản trị; đã tạo người dùng riêng cho từng kế toán (Tiện ích → Người dùng).
- [ ] Từ ngoài Internet **không** mở được `http://<IP máy chủ>:8088`.
- [ ] Đẩy thử một ngày của một shop: chứng từ hiện ở Định khoản tự động (ACC14), không có dòng Lỗi.
- [ ] Bản sao lưu đầu tiên có trong `backups/` và có dung lượng.
- [ ] Đã khai danh mục, cấu hình định khoản, số dư đầu kỳ (xem hướng dẫn "Bắt đầu" trong phần mềm).
