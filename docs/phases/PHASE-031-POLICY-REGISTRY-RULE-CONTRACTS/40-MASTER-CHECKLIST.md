# PHASE-031 · 40 — Checklist
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — việc con S031-*, ca T031-*, log -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S031-1 | ADR-0031 đề xuất, README (hiện trạng đọc mã), [00](00-MASTER-PLAN.md), [10](10-THIET-KE.md), checklist | W0 | P0 | không | ✅ 2026-11-06 |
| S031-2 | Chủ dự án duyệt D031-1..10, trả Q031-1..3 | W0 | P0 | không | ⛔ chủ dự án |
| S031-3 | Nhóm Lõi trả Q031-4, Q031-6; duyệt phần K2 (cửa nạp, Guard) | W0 | P0 | không | ⛔ nhóm Lõi |
| S031-4 | Migration phong bì Registry (chỉ thêm, RLS, trigger chặn sửa bản `published`) + `policies.register / publish / resolve` ở Platform | W1 | P0 | có | ☐ |
| S031-5 | Phiên bản chính sách mua hàng (`purchase_policy_versions` theo Q031-4), sửa = bản mới, đăng ký vào Registry `store: module` | W1 | P0 | có | ☐ |
| S031-6 | `policyTrace` của chứng từ mua ghi `code@version#hash`; màn chứng từ hiện bản đã áp | W1 | P0 | có | ☐ |
| S031-7 | Đánh chỉ mục khoá ngưỡng duyệt (`setting_values`, 16 §5) vào Registry với `approval.levels@1`, `store: settings` | W1 | P2 | có | ☐ sau DOC-030-4 |
| S031-8 | PR chốt thiết kế cửa nạp: `bizcity_ledger_intake@1` 1.6.0 (`policyRefs`, `policyRef`), JSON Schema, `ingestDocumentSchema` | W2 | P0 | không | ☐ |
| S031-9 | Tầng L4b trong `preflight.ts` + Commit Guard băm `policyRefs`; `GateResult.ruleVersion` | W2 | P0 | có | ☐ sau S031-8 |
| S031-10 | Họ mã `POL-*` (REF, EFF, STALE, EVAL, DATA, ACC, PUB) vào `bizcity_findings@1`, có căn cứ và câu giải thích | W2 | P0 | có | ☐ |
| S031-11 | Rule Contract `purchase.*@1` bọc `engine.ts` (không đổi kết quả; hồi quy mua hàng) | W2 | P1 | có | ☐ |
| S031-12 | Khoá `intake.policy.severity`, `intake.policy.mode` vào registry cấu hình (loại A, mặc định cho phép) | W2 | P1 | có | ☐ |
| S031-13 | `GET /api/v1/policies`, phạm vi khoá `policies:read`; sự kiện `policy.published` / `policy.retired` qua outbox | W3 | P0 | có | ☐ |
| S031-14 | Kế toán trưởng xác nhận bảng `reasonCode` theo loại kết quả (Q031-5) | W3 | P0 | không | ⛔ kế toán trưởng |
| S031-15 | Rule Contract bán hàng `sale.price_list@1`, `sale.promo.discount@1`, `sale.promo.buy_x_get_y@1`, `sale.credit_limit@1` cùng `modules/ban-hang` (S030-16); `publishChecks` trần NĐ81 | W3 | P0 | có | ☐ sau S031-14 |
| S031-16 | POS WP: tải chính sách, tính theo Rule Contract, gửi `policyRefs`; bỏ luật khuyến mại riêng của plugin (repo plugin, dòng CLAIMS riêng) | W3 | P1 | có | ☐ |
| S031-17 | Rulepack `policy` cho Conformance Engine (§9 của [10](10-THIET-KE.md)), chỉ đọc | W4 | P1 | có | ☐ |
| S031-18 | Màn *Chính sách* (phiên bản, phạm vi, chứng từ đã áp) + nút *Chính sách căn cứ* trên màn truy vết | W4 | P1 | có | ☐ |
| S031-19 | `nen-mong.json` / `NEN-MONG-DOANH-NGHIEP.md`: trụ cột 05 hai nửa, tín hiệu nửa Policy; `tru-cot.json` V theo Q031-1 | W4 | P1 | không | ☐ sau Q031-1 |

## Ca bằng chứng (golden)

| ID | Ca | Đợt |
|---|---|---|
| T031-REG-1 | sửa nội dung bản `published` → bị chặn; đổi = phiên bản mới, bản cũ tự đóng ở `valid_from − 1` | W1 |
| T031-REG-2 | hai bản `published` chồng hiệu lực cùng phạm vi → không phát hành được | W1 |
| T031-MH-1 | đổi chiết khấu NCC giữa tháng: phiếu trước ngày đổi tính lại ra số cũ, `policyTrace` trỏ bản cũ | W1 |
| T031-RC-1 | `sale.promo.buy_x_get_y@1`: 2 A → 1 B; 4 A → 2 B (lặp); 3 A → 1 B; cùng bảng số cho bản TS và bản plugin | W3 |
| T031-RC-2 | `publishChecks`: giá trị quà 55 % giá A → chặn phát hành; 50 % → được (NĐ81 Điều 9) | W3 |
| T031-INT-1 | `sale` POS đúng SALE-PROMO-001@3 → L4b `pass`, ghi sổ, truy vết tới chính sách | W2 |
| T031-INT-2 | 2 A + 2 B → `POL-EVAL-001` `warn`; chế độ *gợi ý* vào hàng việc kèm bút toán dự kiến; chế độ *tự động* ghi | W2 |
| T031-INT-3 | POS offline gửi bản 2 khi bản 3 đã hiệu lực tại `docDate` → `POL-STALE-001`, sự việc không mất | W2 |
| T031-INT-4 | `reasonCode` của `treatment` chưa có trong chính sách định khoản tại ngày → `hold`, vào bể chờ, kích hoạt chính sách định khoản → bể tự kiểm lại | W2 |
| T031-INT-5 | băm `policyRefs` không khớp bản đã phát hành → `POL-REF-001` | W2 |
| T031-INT-6 | chính sách đổi giữa tiền kiểm và ghi → Commit Guard `IN-GUARD-001` | W2 |
| T031-INT-7 | nguồn cũ không gửi `policyRefs` → nhận như hôm nay, L4b `info` | W2 |

## Nhật ký

- 2026-11-06 — W0: chủ dự án đưa đề bài *"chính sách nghiệp vụ được quản lý tập trung tại module … plugin bên ngoài sử dụng chính sách đã phát hành … Conformance gate … phối hợp với Accounting Rules để dựng bút toán dự kiến trước khi ghi sổ … chính sách được quản trị tập trung, nhưng không bắt buộc tính toán tập trung"*. Rà mã origin/main `c8afd39`: mua hàng có engine chính sách thuần nhưng không phiên bản; bán hàng không có luật ở Core; tiền kiểm L1–L5 và Conformance Engine không kiểm chính sách nghiệp vụ; L5 chạy thử sẵn là bút toán dự kiến. Viết ADR-0031 (đề xuất), README, 00, 10, checklist. Chờ S031-2, S031-3.
