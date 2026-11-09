# PHASE-032 · 40 — Checklist
<!-- [2026-11-09 10:38 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chỉ đạo: giao Võ Hoàng (nhóm POS TGS) mở phase phần UI / UX, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031; quy trình pull → phân tích → phase → bản mẫu duyệt → checklist → code trên nhánh PR (chưa duyệt nội dung) -->
<!-- [2026-11-09 09:30 PM Võ Hoàng] PHASE-032 — việc con S032-*, ca T032-*, nhật ký (đóng góp) -->
<!-- [2026-11-10 09:00 AM Võ Hoàng] PHASE-032 — chốt W0: D032-1..7 và Q032-1..4 theo phương án ở 00 §5 (khoá module chinh-sach-ban); tài liệu viết thuần nghiệp vụ (đóng góp) -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S032-1 | README, [00](00-MASTER-PLAN.md), [10](10-THIET-KE.md), checklist, bản mẫu [mockups/ban-hang-chinh-sach.html](mockups/ban-hang-chinh-sach.html) | W0 | P0 | không | ✅ 2026-11-09 |
| S032-2 | Chốt bản mẫu, D032-1..7, Q032-1..4 ([00](00-MASTER-PLAN.md) §4–5) | W0 | P0 | không | ✅ 2026-11-09 |
| S032-3 | Kế toán trưởng trả Q032-5 (trần NĐ81 chặn hay cảnh báo); xác nhận bảng `reasonCode` cùng S031-14. Q032-6 đã chốt 09/11: quà theo Core (`XTA1.4`) | W2 | P0 | không | ⛔ kế toán trưởng |
| S032-4 | Khung `modules/chinh-sach-ban` (`npx bizcity module new`), manifest, menu *Chương trình khuyến mại* | W1 | P0 | có | ☐ sau S032-18 |
| S032-5 | Màn *Chương trình KM*: danh sách từ `GET /api/v1/policy-registry` lọc `domain = sale`, trạng thái 4 loại, lọc chi nhánh / kênh / loại | W1 | P0 | có | ☐ |
| S032-6 | Màn *Soạn & phát hành*: form sinh từ `describe().params`, lỗi theo `path`, hộp xác nhận, `Idempotency-Key` | W1 | P0 | có | ☐ |
| S032-7 | Bản nháp: migration của module `mod_chinh_sach_ban_drafts` + action `chinh-sach-ban.draft.*` | W1 | P1 | có | ☐ |
| S032-8 | Màn *Một chương trình*: dòng thời gian bản, nội dung từng bản, chứng từ đã áp (`core.policy.applications`), nút *Sửa → bản mới* | W1 | P0 | có | ☐ |
| S032-9 | Đề xuất P032-1..4 thành issue / ADR theo VERSIONING §5 | W2 | P0 | không | ☐ |
| S032-10 | `sale.promo.discount@1` + vectors + `publishChecks` (sau P032-1, P032-2) | W2 | P0 | có | ☐ |
| S032-11 | *Thử tính* bản nháp (P032-3), *Ngừng* (P032-4), *So sánh bản* (khác nhau theo trường) | W2 | P1 | có | ☐ |
| S032-12 | Bản viết lại TS dùng chung cho POS React + PHP cho plugin; bài kiểm chạy hết `describe().vectors` | W3 | P0 | có (repo POS) | ☐ |
| S032-13 | POS React / `tgs_selling_policy` đọc chính sách từ Core (`etag`, sự kiện), gửi `sale` / `sale_return` kèm `policyRefs` (S031-16) | W3 | P0 | có (repo POS) | ☐ |
| S032-14 | Màn *Kênh POS*: đơn vào theo chi nhánh, tỉ lệ có `policyRefs`, lệch IN-POL theo mã, độ trễ bản theo máy | W3 | P1 | có | ☐ |
| S032-15 | Script chuyển CTKM đang chạy (D032-7) + bảng ánh xạ; chạy song song 1 tuần, so kết quả từng đơn | W4 | P0 | có | ☐ |
| S032-16 | Tắt luật riêng của plugin sau ngày chuyển; đóng S031-16 | W4 | P0 | có (repo POS) | ☐ |
| S032-17 | Hướng dẫn `docs/huong-dan/chinh-sach-ban.md` (SC-DOC-6 khi thêm menu) | W1 | P1 | không | ☐ |
| S032-18 | Phiếu nghiệm thu bán hàng ở `docs/nghiem-thu/` (chép `_MAU.md`), **Đã chốt** với kế toán trước khi code từng đợt: NT-BH-001 phát hành / sửa / ngừng CTKM mua X tặng Y; NT-BH-002 giảm giá theo dòng / theo đơn; NT-BH-003 đơn POS mang `policyRefs` (bán, hoàn trả quà kèm, bán lúc mất mạng) — số liệu, bút toán Nợ / Có mong đợi, trường hợp lệch chuẩn | W1–W3 | P0 | không | ☐ |

## Ca bằng chứng (golden)

| Mã | Ca | Đợt |
|---|---|---|
| T032-UI-1 | Phát hành *mua 2 A tặng 1 B* từ màn → `GET /api/v1/policies` ra bản 1, băm khớp băm trên hộp xác nhận | W1 |
| T032-UI-2 | Sửa → bản 2 từ ngày D: bản 1 đóng ở D−1, không hở, không chồng; màn hiện cả hai trên dòng thời gian | W1 |
| T032-UI-3 | Áp lùi không lý do → 422, lỗi dưới ô lý do; có lý do → phát hành được | W1 |
| T032-UI-4 | Người thiếu `settings:write` không thấy nút *Phát hành / Ngừng* | W1 |
| T032-RC-1 | `sale.promo.discount@1`: % theo dòng, tiền theo đơn có ngưỡng, `maxDiscount`, số lẻ — vectors chạy qua hàm thuần và qua `evaluate` | W2 |
| T032-POS-1 | Bản viết lại TS + PHP đạt 100 % vectors của mọi Rule Contract `sale.*` | W3 |
| T032-POS-2 | Đơn POS bán bằng bản 2 sau khi đã có bản 3 → ghi sổ, IN-POL-003 cảnh báo, vào hàng việc *Chờ kế toán xem* | W3 |
| T032-POS-3 | Hoàn hàng mang `policyRefs` đơn gốc; quà trả kèm theo tỉ lệ | W3 |
| T032-MIG-1 | Chuyển CTKM: mỗi CTKM loại 1 / 2 / 5 / 10 đang chạy ra đúng một chính sách Registry; 1 tuần chạy song song lệch 0 đơn | W4 |

## Nhật ký

<!-- [2026-11-09 11:15 PM Võ Hoàng] PHASE-032 — Q032-6 chốt (quà theo Core: XTA1.4); thêm đề xuất trả lời Q032-1..4; áp sổ tay HUONG-DAN-LAM-VIEC (phiếu nghiệm thu trước khi code, quy ước giao diện §7) (đóng góp) -->

- 2026-11-09 — mở phase: phần giao diện, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031. Đọc PHASE-031 trên `main` `0bef7c87`: W1–W4 đã vào, W2b đang làm (giữ `rule-contracts/**`, `policy.routes.ts`, `core/policies.ts`) → phase này không đụng các tệp đó, thiếu gì ghi đề xuất P032-*. Soạn tài liệu + bản mẫu 4 màn.
- 2026-11-09 — chốt Q032-6: quà làm giống Core (`XTA1.4`). Thêm đề xuất trả lời Q032-1..4 (00 §5). Áp sổ tay `docs/HUONG-DAN-LAM-VIEC.md`: thêm S032-18 (phiếu nghiệm thu Đã chốt trước khi code), quy tắc màn §7 vào 10 §5, bản mẫu thêm nút Hướng dẫn, chú thích rê chuột, ô tìm thay ô chọn nhiều dòng.
- 2026-11-09 — **W0 xong**: chốt D032-1..7 và Q032-1..4 theo phương án ở [00](00-MASTER-PLAN.md) §5 — khoá module `chinh-sach-ban`, Rule Contract dời xuống Platform (P032-1), giá / giảm trước thuế, `stacking` + `priority`. Bước kế: phiếu NT-BH-001 (S032-18) rồi giữ chỗ W1.
