# PHASE-036 · 40 — Checklist
<!-- [2026-11-10 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — việc con S036-*, ca T036-*, nhật ký -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S036-1 | README, [00](00-MASTER-PLAN.md), checklist, [bản mẫu hộp thoại](mockups/thiet-lap-nhanh.html) | W0 | P0 | không | ✅ 2026-11-10 |
| S036-2 | Chủ dự án duyệt D036-1..12, trả Q036-1..6 | W0 | P0 | không | ✅ 2026-11-13 (chủ dự án: "theo đề nghị") |
| S036-3 | B1 — `tenantEmptiness()` + `core.setup.status`; biểu ngữ đơn vị trắng ở Tổng quan | W1 | P0 | có | ☐ sau S036-2 |
| S036-4 | B2 — `core.setup.plan` / `core.setup.apply` chạy preset ở máy chủ (chạy nền, tiến độ, chạy lại không nhân đôi); `cai-preset.mjs` gọi qua đây | W1 | P0 | có | ☐ |
| S036-5 | B3 — hộp thoại 4 bước `modules/thiet-lap/` (TI09) + `Steps` ở ui-kit; `docs/huong-dan/thiet-lap-nhanh.md` | W2 | P0 | có | ☐ |
| S036-6 | B4 — `bizcity_preset@1` 1.1.0 (khối openings, vouchers, assets, close, returns, settings) + gói `thuong-mai-ban-le` 1.1; SC-PRESET-1 kiểm khối mới | W2 | P0 | có | ☐ |
| S036-7 | B5 — đơn vị mẫu riêng (`tenants.is_sample`, migration, tạo / chuyển đơn vị) + tự nạp ở `db-migrate` (`BIZCITY_SAMPLE`); chặn gửi ra ngoài ở đơn vị mẫu | W3 | P1 | có | ☐ sau Q036-1, Q036-4 |
| S036-8a | B6 — TI08 an toàn: xem trước bắt buộc có `previewToken`, `default_data_backups` (0134) tự sao lưu trước khi ghi, chặn bộ giả lập trên đơn vị có bút toán, hộp thoại xem trước ([00 §9](00-MASTER-PLAN.md)) | W1 | P0 | có | ☐ |
| S036-8b | B6 — *Lấy lại bản trước* từ `default_data_backups`; `org-units/restore-defaults` theo cùng khuôn; đơn vị trắng đổi nút thành *Thiết lập nhanh* (sau B3) | W2 | P1 | có | ☐ sau S036-8a |
| S036-9 | B6 — `cap-nhat.sh` kiểm bản sao lưu + bảng "cái gì có thể đổi" + cảnh báo `SEEDS_DIR`; `sao-luu.sh --kiem`, `khoi-phuc-thu.sh`; `docs/ops/SAO-LUU-KHOI-PHUC.md` | W1 | P0 | có | ☐ |
| S036-10 | B7 — nghiệm thu T036-1..8 trên CSDL sạch, ảnh màn, cập nhật `docs/huong-dan/` | W3 | P1 | có | ☐ |

## Ca kiểm

| ID | Ca | Bước |
|---|---|---|
| T036-1 | Nạp gói mẫu trên đơn vị sạch → 18 báo cáo đích khác rỗng; `doi-chieu-ke-toan.sql` ĐẠT; `apply` lần hai thêm 0 dòng | B4 |
| T036-2 | Đơn vị có 1 chứng từ nháp → `core.setup.apply` trả `SETUP-NOT-EMPTY`, không ghi gì | B1, B2 |
| T036-3 | Hai lệnh `apply` cùng lúc trên một đơn vị → một lệnh chạy, lệnh kia `CONFLICT`; không nhân đôi | B2 |
| T036-4 | Đơn vị mẫu: action gửi tờ khai / hoá đơn ra ngoài bị chặn ở máy chủ | B5 |
| T036-5 | TI08 không xem trước → API từ chối; xem trước trả đúng số thêm / sửa / đổi mã / xoá / khoá | B6 |
| T036-6 | TI08 ghi xong → *Lấy lại bản trước* trả danh mục về đúng như trước | B6 |
| T036-7 | Tệp gốc `_nguon: "gia-lap"` + đơn vị có chứng từ → quay về gốc bị chặn, báo dùng `SEEDS_DIR` | B6 |
| T036-8 | `cap-nhat.sh` với bản sao lưu hỏng (tệp rỗng) → dừng trước khi nâng cấp, in lệnh lùi | B6 |

## Nhật ký

- 2026-11-10 — W0 đề xuất <!-- [2026-11-10 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — nhật ký W0 -->: chủ dự án nêu đề bài (cài mới tự nạp dữ liệu mẫu đủ phân hệ để báo cáo lên số; hộp thoại thiết lập nhanh khi đơn vị trắng; chống mất dữ liệu ở quay về gốc, nâng cấp image, sao lưu SQL). Đọc mã hiện trạng; đề xuất D036-1..12, hộp thoại 4 bước, gói mẫu 9 khối, 18 báo cáo đích, B1..B7; chờ duyệt.
- 2026-11-13 — W0 chốt <!-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — nhật ký chốt W0 -->: chủ dự án "theo đề nghị" — D036-1..12 chấp nhận; Q036-1 đơn vị mẫu riêng, Q036-2 bật ở cai-nhanh / tắt ở image khách, Q036-3 thương mại bán lẻ trước, Q036-4 xoá được đơn vị mẫu (thêm ngoại lệ RULE-LEDGER khi làm B5), Q036-5 danh mục mẫu là tick tuỳ chọn, Q036-6 làm B6 trước. Tách S036-8 → 8a / 8b; chữ chốt B6 ở [00 §9](00-MASTER-PLAN.md); giữ chỗ S036-8a, S036-9.
