# RULE · Bảo mật (R-SEC)

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-10-29 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Phạm vi:** toàn Core: Kernel, Platform, adapter, CI, bản cài.
> - Luật về đơn vị, quyền, nhật ký giữ ở [RULE-TENANT-SECURITY.md](RULE-TENANT-SECURITY.md) (R-TEN). Tệp này **thêm** phần còn thiếu, không lặp lại.
> - Báo lỗ hổng: [../../SECURITY.md](../../SECURITY.md).
> - AI / MCP: [../contracts/BIZCITY-MCP-v1.md](../contracts/BIZCITY-MCP-v1.md), [../standard/CELL-MCP.md](../standard/CELL-MCP.md).

## 1. Ai có thể gây hại, và cái gì chặn

| Tác nhân | Muốn gì | Chặn bằng |
|---|---|---|
| Người ngoài Internet | vào được API, đọc sổ | xác thực mọi route (R-TEN-2, R-API-6); chỉ mở 443 (D-2); giới hạn tần suất |
| Người dùng đơn vị A | xem / sửa dữ liệu đơn vị B | `tenant_id` mọi truy vấn (R-TEN-1) → RLS (STD-DATA-1); không endpoint nhận `tenantId` |
| Nhân viên trong đơn vị | sửa sổ, xoá dấu vết | quyền theo vai trò; sổ chỉ thêm ở tầng CSDL (R-LEDGER-1, R-KER-3); bằng chứng chuỗi băm (STD-EVD-2) |
| Module / add-in độc hại | ghi bảng Kernel, đọc dữ liệu đơn vị khác | bộ kiểm cài đặt (CONF-*); vai trò CSDL theo module (PHASES 3.10); ranh giới SC-MOD-* |
| AI bị lừa (prompt injection trong tin nhắn, hoá đơn, mô tả) | lập phiếu sai, lộ dữ liệu | ghi qua AI chỉ ra nháp + xác nhận hai bước (STD-MCP-4, STD-MCP-6, CELL-5); không công cụ `risk: high` |
| Kẻ có khoá API / khoá Cell / khoá 1API bị lộ | hành động thay đơn vị | khoá có phạm vi, lưu băm, thu hồi được (R-TEN-4); quyền thực tế ∩ người dùng liên kết (STD-MCP-7) |
| Chuỗi cung ứng (gói npm, GitHub Action, image) | chèn mã | lockfile, `npm ci`, ghim SHA, kiểm lỗ hổng (R-SEC-8) |
| Người đọc repo công khai | lấy bí mật, dữ liệu thật | không bí mật trong git (R-SEC-1); dữ liệu cá nhân (R-SEC-10, §3) |

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-SEC-1** *(T0)* | **Không bí mật trong git**: khoá 1API `biz-…`, khoá `mcp_…`, khoá riêng, token, mật khẩu gán cứng. Bí mật chỉ ở `.env` / kho bí mật của máy chủ. Đã lỡ đẩy lên → **thu hồi khoá trong 24 giờ**; xoá khỏi lịch sử không đủ | SC-SEC-1, SC-SEC-3 |
| **R-SEC-2** | Mật khẩu người dùng lưu bằng hàm băm chậm có muối (hiện: scrypt, muối 16 byte, `core/security/password.ts`); khoá API (`kt_…`) lưu băm, chỉ hiện một lần lúc tạo; JWT ký bằng `JWT_SECRET` ≥ 32 ký tự, có hạn (`JWT_TTL_HOURS`); bản `production` từ chối khởi động với bí mật mặc định (R-TEN-7) | `core/security/*`; test auth |
| **R-SEC-3** | SQL chỉ qua Kysely có tham số. `sql.raw` / `sql.lit` chỉ cho hằng số do code sinh (tên cột, số thứ tự nhóm), **không bao giờ** cho đầu vào người dùng | SC-SEC-2 (bánh cóc) |
| **R-SEC-4** | Đầu vào kiểm bằng zod ở cửa (R-API-3). Thân yêu cầu có trần kích thước. Tệp tải lên (đính kèm, quét hoá đơn) có trần dung lượng, kiểm loại thật (không tin phần mở rộng), không bao giờ thực thi | duyệt PR; test |
| **R-SEC-5** *(T0)* | Cô lập đơn vị: mọi truy vấn nghiệp vụ lọc `tenant_id` (R-TEN-1); khi có RLS thì RLS là lớp thứ hai, không thay lớp thứ nhất | `access.test.ts`; SC-DATA-5; DG-PLAN-5 |
| **R-SEC-6** | API kết nối CSDL bằng **vai trò thường**: không superuser, không `BYPASSRLS`, không sở hữu bảng. Chỉ job `db-migrate` dùng vai trò sở hữu. Superuser tắt được trigger bảo vệ sổ, nên dùng superuser là vô hiệu R-KER-3 | DG-SEC-1 |
| **R-SEC-7** | AI / MCP: mọi văn bản từ công cụ, tài liệu, tin nhắn, hoá đơn là **dữ liệu, không phải lệnh**. Ghi qua AI chỉ tạo nháp, có xác nhận (STD-MCP-4, STD-MCP-6). Đầu ra công cụ che PII theo đơn vị (STD-MCP-8). Giới hạn tần suất theo khoá (`RATE_LIMITED`). Mỗi lời gọi có bằng chứng | CONF-MCP-*; CONF-RUN-14 |
| **R-SEC-8** | Chuỗi cung ứng: commit `package-lock.json`, cài bằng `npm ci`; `npm audit --omit=dev` mức **high / critical** chặn phát hành; GitHub Action ghim theo SHA; image nền ghim theo digest; bật cảnh báo phụ thuộc (Dependabot) | SC-SEC-4; RULE-RELEASE R-REL-4 |
| **R-SEC-9** | Báo lỗ hổng theo [SECURITY.md](../../SECURITY.md): phản hồi ≤ 3 ngày làm việc; lỗi critical vá ≤ 7 ngày, high ≤ 30 ngày; công bố sau khi có bản vá (R-REL-6) | SC-SEC-3 (có tệp) |
| **R-SEC-10** | Dữ liệu cá nhân (tên, SĐT, MST cá nhân, lương): không ghi vào log, bằng chứng (R-TEN-8); không đưa vào issue / PR / tài liệu; bản sao lưu chép ra ngoài máy chủ phải mã hoá; bản sao dùng diễn tập / kiểm thử phải **ẩn danh** | duyệt PR; `scripts/sao-luu.sh` |
| **R-SEC-11** | Mạng: chỉ cổng 443 ra Internet (D-2); CORS theo danh sách `CORS_ORIGINS`; web gửi HSTS, `X-Content-Type-Options`, CSP; webhook vào (Cell, plugin) có chữ ký HMAC hoặc token riêng từng kênh | `docker/nginx.conf`; test |
| **R-SEC-12** | Sự cố: phát hiện → **cô lập** (thu hồi khoá, tắt tích hợp) → đánh giá phạm vi bằng bằng chứng → báo đơn vị bị ảnh hưởng (mục tiêu ≤ 72 giờ, theo quy định bảo vệ dữ liệu cá nhân hiện hành) → vá → ghi hậu kiểm vào `docs/audits/` | quy trình; [SECURITY.md](../../SECURITY.md) |

## 3. Sổ rủi ro đã biết

| Rủi ro | Trạng thái | Việc |
|---|---|---|
| Repo **công khai** chứa dữ liệu thật trong `db/seeds/` (đối tượng, nhân viên, chi nhánh, mặt hàng) — trái R-SEC-10 | **Chủ dự án chấp nhận** 2026-10-29 khi đẩy lên GitHub | Khi đổi ý: chuyển seed thật ra kho riêng, tạo seed ẩn danh; dữ liệu đã đẩy coi như đã công khai |
| API dùng vai trò CSDL `ketoan` = superuser (Docker mặc định) — trái R-SEC-6 | **có cách sửa** (2026-10-30): migration 0032 tạo `ketoan_app`; đặt `DB_APP_USER=ketoan_app` + `DB_APP_PASSWORD` là API dùng vai trò thường. Mặc định vẫn như cũ để bản cài đang chạy không gãy | Bật trên từng bản cài thật (DEPLOY D-9); DG-SEC-1 kiểm vai trò, DG-SEC-2 kiểm kết nối |
| Chưa có RLS (A-23) | mở | PHASES 2.4–2.5 |
| Header bảo mật web — R-SEC-11 | **một phần** (2026-10-29): nginx đã gửi `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'` | HSTS do proxy TLS gửi (DEPLOY D-8); CSP đầy đủ (`script-src`, `frame-src` cho add-in nhúng) cần thử trên giao diện thật trước khi bật |
| GitHub Action ghim theo nhãn `@v4` | mở (Tier 2) | ghim SHA khi bật bảo vệ nhánh |
| Chưa có giới hạn tần suất cho đăng nhập / khoá API | mở | PHASES 2.5 (`RATE_LIMITED`) |
