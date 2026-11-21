<!-- [2026-11-21 02:00 PM Võ Hoàng] PHASE-031 — chữ chốt thiết kế S031-11 (Rule Contract purchase.*@1 bọc engine mua hàng) trước PR code, R-FLOW-2 (anh Hoàng chốt 21/11) -->
# 30. S031-11 — Rule Contract `purchase.*@1` bọc bộ máy mua hàng

> Căn cứ: checklist S031-11 ("bọc `engine.ts`, không đổi kết quả; hồi quy mua hàng"); `00-MASTER-PLAN.md` mục 4 (khuôn Rule Contract, `domain: 'sale'` — "purchase.* bọc engine mua hàng ở S031-11"); `BAN-GIAO.md` (chính sách mua hàng hôm nay không tính lại được ở cửa nạp).

## 1. Mục tiêu
Mỗi loại chính sách mua hàng (`PolicyKind` của `@bizcity/mua-hang-domain`) có một Rule Contract `purchase.<loại>@1` **cùng khuôn** với hợp đồng bán: tham số (zod), `publishChecks`, `evaluate` tất định, `describe` (tham số, vector mẫu). Mục đích: Policy Registry mô tả, kiểm và **tính lại** được chính sách mua hàng bằng cùng một ngôn ngữ như chính sách bán.

## 2. Ràng buộc
1. **Không đổi kết quả:** `evaluate` **gọi lại** các hàm có sẵn của `engine.ts` (`policyAt`, `policyApplies`, `findPolicy`, `itemDiscountFor`, `pickTier`, `giftMatches`, `computeDoc`…), không viết lại công thức. Test hồi quy so `contract.evaluate` với kết quả `engine` trên bộ dữ liệu mẫu của mua hàng: phải trùng từng đồng.
2. **Không sửa module mua hàng:** không sửa `modules/mua-hang/**` (đang có người giữ chỗ); chỉ import `@bizcity/mua-hang-domain` từ phía Rule Contract (`apps/api/src/modules/system/rule-contracts/`). Luật định khoản vẫn không import gói này.
3. **Khuôn:** `RuleContract.domain` mở thành `'sale' | 'purchase'` (minor, thêm giá trị). Phát hành inline vẫn **chỉ** cho `sale` — chính sách mua hàng vẫn do module mua hàng làm chủ (`mua-hang.policy:<id>`), Registry chỉ đánh chỉ mục + mô tả + tính lại.
4. **Phạm vi loại:** loại có công thức tính trên chứng từ (`trade_discount`, `item_discount`, `qty_tier`, `payment_discount`, `promo_gift`, `period_rebate`, `target_rebate`, `stage_rebate`) → `evaluate` đầy đủ. Loại là **tham số / giới hạn** (`credit_limit`, `payment_term`, `supply_target`, `lot_tracking`, `gift_budget`) → `evaluate` trả kết quả kiểm / hạn (dùng `creditStatus`, `dueDateFor`…) hoặc chỉ mô tả, ghi rõ ở `describe`.
5. **Không làm ở đợt này:** tính lại chính sách mua hàng **tại cửa nạp** (L4b cho chứng từ mua) — để đợt sau, cần chữ chốt riêng.

## 3. Kiểm
- Test `apps/api/test/phase-031-purchase-contracts.test.ts`: mỗi hợp đồng — khoá `describe().params` khớp `.shape` zod; vector mẫu chạy đúng; **hồi quy**: `computeDoc` qua hợp đồng = `computeDoc` gốc trên các phiếu mẫu của test mua hàng hiện có.
- Danh sách Rule Contract (`GET /api/v1/rule-contracts`) có thêm `purchase.*`.
