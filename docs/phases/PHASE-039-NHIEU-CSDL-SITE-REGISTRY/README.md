# PHASE-039 — Nhiều CSDL: mỗi site một database, một bản mã dùng chung
<!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — W0: đề bài chủ dự án 2026-11-21 — Open Kế Toán là ứng dụng dùng chung, mỗi site một database PostgreSQL; thêm Site Registry, Database Router, Site Provisioner, Migration Runner, Backup Manager; Frappe (repo bizcity-open-setup) chỉ là Site Manager gọi Provisioning API -->

<!-- [2026-11-21 07:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chủ dự án chốt: bizcity-llm-router quản lý API key; thêm D039-17, Q039-5; Provisioning API không cấp khoá cho khách -->
<!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chủ dự án chốt Q039-5: khoá biz-… chỉ để cảnh báo hết hạn (khoá mềm), site vẫn dùng được; D039-17 viết lại, D039-18 tên miền gốc động -->
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng, chờ đưa vào lộ trình)
> **Phân hệ:** he-thong
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 đề xuất 2026-11-21** — chờ chủ dự án duyệt D039-1..16 và trả Q039-1..4 (D039-17, D039-18, Q039-5 đã chốt 2026-11-21). Chưa có mã.
> **Tệp:** [00 — Kế hoạch & thiết kế](00-MASTER-PLAN.md) · [30 — Hợp đồng Provisioning](30-HOP-DONG-PROVISIONING.md) · [40 — Checklist](40-MASTER-CHECKLIST.md)

## Đề bài (chủ dự án, 2026-11-21)

1. **Ba vai, không lẫn.** Frappe = giao diện điều hành và quản lý site. Open Kế Toán = ứng dụng kế toán dùng chung, độc lập với Frappe. PostgreSQL = mỗi site một database; một chuỗi có thể có hàng trăm cửa hàng trong một site.
2. **Một bản mã cho mọi site.** Mã nghiệp vụ, Accounting Kernel, Module SDK và các Rulepack dùng chung. Tạo một kế toán mới là cấp một database mới, không dựng thêm một ứng dụng.
3. **Năm thành phần cần thêm:** Site Registry (domain → database), Database Router (chọn pool theo site đã xác thực), Site Provisioner (tạo DB, chạy migration), Migration Runner (nâng cấp DB từng site), Backup Manager (sao lưu / khôi phục riêng từng site).
4. **Quy trình cập nhật mong muốn:** GitHub `open-ketoan` → kéo / build / test → một phiên bản mới → migration từng site → chuyển ứng dụng sang phiên bản mới → mọi site dùng chung mã mới.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Hôm nay ra sao? | Một `DATABASE_URL`, một `pg.Pool` (tối đa 10 kết nối) cho cả ứng dụng. Nhiều đơn vị ở chung một database, tách bằng RLS theo `bizcity.tenant_id` (PHASE-007). Migration, sao lưu, cập nhật đều giả định **một** database | [00 §1](00-MASTER-PLAN.md) |
| "Site" là gì, khác "đơn vị" thế nào? | **Site** = một tên miền + một database riêng (một doanh nghiệp hoặc một chuỗi). **Đơn vị** (`tenant_id`) và chi nhánh nằm **trong** site, giữ nguyên như hôm nay. Hai lớp cô lập: database theo site, RLS theo đơn vị | D039-1 |
| Mã nghiệp vụ phải sửa không? | **Không.** `db` vẫn là một biến như hôm nay; bên dưới nó tự chọn pool theo site của yêu cầu đang chạy (AsyncLocalStorage, cùng chỗ đang giữ `tenantId`). Kernel, module, Rulepack không biết có nhiều database | D039-4 |
| Bản cài một công ty (Docker, cPanel) có bị ảnh hưởng? | Không. Mặc định `SITE_MODE=single`: một site ngầm định lấy từ `DATABASE_URL`, đi **cùng một đường mã** với chế độ nhiều site | D039-3 |
| Site Registry nằm ở đâu? | Trong một **database điều khiển** PostgreSQL của chính Open Kế Toán (`CONTROL_DATABASE_URL`), không nằm trong Frappe. Open Kế Toán chạy được khi không có Frappe | D039-2 |
| Biết yêu cầu thuộc site nào bằng gì? | Tên miền của yêu cầu (`Host`) → registry → database. Vé đăng nhập mang thêm mã site; vé của site A gửi tới tên miền site B bị từ chối | D039-4, D039-5 |
| Thiếu ngữ cảnh site thì sao? | Ở chế độ nhiều site: **báo lỗi `SITE_CONTEXT_MISSING`**, không rơi về database mặc định | D039-6 |
| Tạo site mất bao lâu? | Vài giây: `CREATE DATABASE … TEMPLATE` từ một database mẫu đã chạy đủ migration | D039-9 |
| Nâng cấp thế nào khi có hàng trăm site? | Một luật: ứng dụng chỉ phục vụ site có **lược đồ đúng bản nó cần**. Migration chạy từng site; site lỗi bị chặn riêng, site khác chạy tiếp | D039-11, [00 §6](00-MASTER-PLAN.md) |
| Sao lưu riêng một site? | `pg_dump` riêng database của site; khôi phục vào database tạm, kiểm, rồi mới đổi chỗ | D039-13 |
| Frappe gọi vào bằng gì? | Provisioning API `/_sites/v1` (hợp đồng `bizcity_site_provisioning@1`), khoá `prov_…`, mọi lệnh ghi có `Idempotency-Key` | [30](30-HOP-DONG-PROVISIONING.md) |
| Làm theo thứ tự nào? | **Bước thắng nhỏ**, mỗi bước một PR: B1 ngữ cảnh site ở chế độ một site (hành vi không đổi) → B2 registry + router → B3 migration theo site → B4 provisioner + CLI → B5 Provisioning API → B6 sao lưu theo site → B7 cập nhật nhiều site + nghiệm thu | [00 §8](00-MASTER-PLAN.md) |

## Quyết định đề xuất

| Mã | Quyết định | Vì sao |
|---|---|---|
| **D039-1** | Site = **database** riêng (không phải schema, không phải thêm cột). Đơn vị và chi nhánh trong site giữ nguyên; RLS giữ nguyên | Sao lưu, khôi phục, chuyển máy, xoá theo từng khách là thao tác có sẵn của PostgreSQL; chuỗi lớn không làm chậm chuỗi nhỏ |
| **D039-2** | Site Registry ở **database điều khiển** của Open Kế Toán (`ketoan_control`): `sites`, `site_domains`, `site_jobs`, `site_backups`, `provision_keys` | Open Kế Toán độc lập với Frappe; một chủ cho sự thật "domain → database" |
| **D039-3** | `SITE_MODE=single` (mặc định) / `multi`. Chế độ một site = registry trong bộ nhớ có đúng một site lấy từ `DATABASE_URL`. **Một đường mã**, không rẽ nhánh `if multi` trong nghiệp vụ | Bản cài hiện có không đổi gì; không nuôi hai đường mã |
| **D039-4** | Database Router: `Host` → site (bộ đệm registry 30 giây, xoá khi có lệnh đổi) → pool của site. `db` thành lớp uỷ quyền đọc site từ ngữ cảnh yêu cầu | Mã nghiệp vụ, Kernel, SDK không đổi một dòng |
| **D039-5** | Vé đăng nhập (JWT) và vé ứng dụng thêm claim `sid`. `sid` khác site của tên miền → 401 | `JWT_SECRET` dùng chung giữa các site; thiếu `sid` thì vé site A dùng được ở site B |
| **D039-6** | **Đóng khi thiếu.** Chế độ `multi` mà không có site trong ngữ cảnh → lỗi `SITE_CONTEXT_MISSING`. Tên miền lạ → 404 `SITE_NOT_FOUND`, không lộ tên site khác | Rơi về mặc định là cách lộ dữ liệu chéo |
| **D039-7** | Pool theo site: tạo khi cần, tối đa 4 kết nối / site, đóng sau 5 phút rảnh, có trần tổng. Vượt trần thì đóng pool rảnh lâu nhất | Hàng trăm site × 10 kết nối sẽ vượt `max_connections` |
| **D039-8** | Tiến trình nền (dispatcher sự kiện, đồng hồ) chạy theo vòng `forEachSite`: mỗi lượt đặt ngữ cảnh site; site lỗi không chặn site khác. Bộ đệm trong bộ nhớ có khoá theo đơn vị phải thêm mã site | Hôm nay hai `setInterval` ở `events.ts` chạy trên một pool; `tenant_id` có thể trùng giữa hai database |
| **D039-9** | Site Provisioner tạo database bằng `CREATE DATABASE kt_<slug> TEMPLATE kt_template`; `kt_template` được Migration Runner giữ ở bản mới nhất. Sau đó tạo đơn vị đầu + tài khoản quản trị mang email của khách | Vài giây thay vì chạy hơn 170 migration; site mới luôn ở đúng bản |
| **D039-10** | Tạo site là **việc có trạng thái** (`site_jobs`): `queued → running → done / failed`, ghi từng bước. Hỏng trước khi `active` thì xoá database dở. Cùng `Idempotency-Key` → trả việc cũ | Frappe gửi lại không tạo hai site; không để database mồ côi |
| **D039-11** | **Cổng lược đồ:** registry ghi `schema_version` của từng site. Router chỉ phục vụ site có bản đúng bằng bản ứng dụng cần; khác thì 503 `SITE_UPGRADING` | Một luật cho mọi tình huống: mã cũ không chạy trên lược đồ mới và ngược lại |
| **D039-12** | Migration Runner theo site: `runMigrations(connectionString)`; lệnh `site migrate --all` chạy tuần tự, sao lưu trước, ghi kết quả vào registry. Site lỗi → `migration_failed`, bị chặn riêng, chạy lại được. Migration của module đi cùng | `runMigrations` hôm nay đã gần đủ, chỉ cần nhận chuỗi kết nối |
| **D039-13** | Backup Manager: sao lưu riêng database của site (`pg_dump -Fc`), tự kiểm như `sao-luu.sh --kiem`, ghi `site_backups`. Khôi phục: vào database tạm → kiểm → đổi tên. PITR (PHASE-008) vẫn là mức cả cụm | Khôi phục một khách không đụng khách khác |
| **D039-14** | Provisioning API ở tiền tố riêng `/_sites/v1`, **chỉ** trả lời trên tên miền điều hành (`SITE_ADMIN_HOST`), khoá `prov_…` (lưu dạng băm), danh sách IP cho phép | Cửa tạo / xoá database không được nằm chung với cửa nghiệp vụ |
| **D039-15** | Xoá site = **xoá mềm**: yêu cầu site đang khoá và có bản sao lưu ≤ 24 giờ đã kiểm; đổi tên database thành `kt_<slug>_xoa_<ngày>`, giữ 30 ngày rồi mới `DROP` | Sổ kế toán: xoá nhầm không lấy lại được |
| **D039-16** | Mức thay đổi **K3** (đụng `db/client.ts`, xác thực, migration runner). Cần ADR (số kế tiếp) ở W0 và chủ dự án duyệt; mỗi bước có "đường lùi" trong PR | Lớp CSDL nền của toàn bộ Core |
| **D039-17** | **Khoá `biz-…` là khoá bản quyền của site, chỉ để cảnh báo** (chủ dự án chốt 2026-11-21). `bizcity-llm-router` cấp và quản lý khoá. Mỗi site gắn một khoá; Open Kế Toán hỏi `bizcity-llm-router` trạng thái khoá (bộ đệm 1 giờ). Khoá hết hạn, bị thu hồi, hoặc site chưa gắn khoá → **site vẫn dùng đầy đủ**, chỉ hiện **dải đỏ cảnh báo** trên mọi màn. Không hỏi được `bizcity-llm-router` → giữ trạng thái đã biết, **không** chặn, **không** hiện đỏ oan | Sổ kế toán không được dừng vì chuyện gia hạn; dấu đỏ đủ khó chịu để nhắc |
| **D039-18** | **Tên miền gốc là cấu hình động** (chủ dự án chốt 2026-11-21): `btnet.vn`, `bizcity.vn` hay bất kỳ `*.<miền>` nào đã khai. Registry nhận mọi tên miền; Site Resolver chỉ tra `site_domains`, không ghi cứng tên miền gốc nào. Một site có thể có nhiều tên miền | Đổi hoặc thêm tên miền gốc không phải sửa mã |

## Câu còn mở

| Mã | Câu hỏi | Đề nghị |
|---|---|---|
| **Q039-1** | Lệnh khoá site (do người vận hành ra, không phải do hết hạn) thì **chỉ đọc** hay **chặn hẳn**? | Chỉ đọc: khách vẫn xem, in, xuất sổ; không ghi được. Hết hạn thì **không** khoá, chỉ cảnh báo (D039-17) |
| **Q039-2** | Mỗi site một vai trò PostgreSQL riêng, hay dùng chung `ketoan` / `ketoan_app`? | v1 dùng chung (đơn giản, database đã tách); vai trò riêng khi có site đặt ở máy chủ khác |
| **Q039-3** | Thêm PgBouncer ngay hay để sau? | Để sau; D039-7 đủ cho vài chục site. Thêm khi vượt 50 site |
| **Q039-4** | Bản cài một công ty đang chạy có được chuyển thành một site của cụm nhiều site không? | Có, bằng sao lưu → khôi phục vào `kt_<slug>` → ghi registry; làm thành lệnh CLI ở B4 |
| ~~Q039-5~~ | ~~Khoá `biz-…` mang vai nào trong site?~~ | **Đã chốt 2026-11-21:** khoá không mang quyền truy cập. Nó là khoá bản quyền để cảnh báo hết hạn (D039-17) |

## Phía gọi

Repo `bizcity-open-setup` (app Frappe `bizcity_site_manager`): giữ khách hàng và danh sách site; gọi Provisioning API ở [30](30-HOP-DONG-PROVISIONING.md). Phase này là **chủ hợp đồng**; phía gọi đổi theo.

Plugin WordPress `bizcity-llm-router`: chủ khoá `biz-…`. Việc cần ở phía plugin: một cửa trả trạng thái khoá (còn hạn / sắp hết / hết hạn) cho máy chủ gọi máy chủ.
