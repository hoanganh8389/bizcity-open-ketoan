# PHASE-031 — Policy Registry & Rule Contracts: chính sách nghiệp vụ quản trị tập trung, plugin dùng bản đã phát hành, cửa nạp kiểm lại trước khi ghi sổ
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — mở phase từ đề bài chủ dự án 06/11: chính sách bán hàng / mua hàng / nhân sự do module sở hữu, Registry phát hành có phiên bản, plugin POS dùng theo và gửi sự kiện về, Conformance / Intake Gate kiểm lại, Kernel dựng bút toán dự kiến; ADR-0031 đề xuất -->

> **Trạng thái:** 🟡 W0 tài liệu 2026-11-06 · **Code:** chưa
> **Mức Kernel:** W1 K1 (Platform: phong bì Registry, phiên bản chính sách mua hàng); W2 K2 (cửa nạp nhận `policyRefs`, tầng L4b, Commit Guard); W3–W4 K1
> **Mục tiêu:** Lấp nửa *Policy* còn thiếu của trụ cột 05 *Configuration & Policy Registry* (ADR-0028). Chính sách nghiệp vụ (giá, chiết khấu, khuyến mại, hạn mức, ngưỡng duyệt) do **module sở hữu**, **phát hành có phiên bản** qua một Registry chung; plugin ngoài (POS WordPress, Woo, sàn) **dùng bản đã phát hành** và gửi tham chiếu về cùng sự việc; cửa nạp **tính lại để kiểm** rồi để Kernel dựng **bút toán dự kiến**. Truy vết được *bút toán → sự việc → chứng từ → chính sách căn cứ (phiên bản, băm)*.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Quyết định (ADR):** [ADR-0031](../../adr/ADR-0031-policy-registry-rule-contracts.md) (đề xuất); D031-* ở [00-MASTER-PLAN](00-MASTER-PLAN.md)
> **Phụ thuộc:** ADR-0029 (tầng ① Chính sách nghiệp vụ), PHASE-021 (tiền kiểm L1–L5, bể chờ), PHASE-020 (Conformance Engine, tư vấn), PHASE-029 E2 (`setting_values`), PHASE-030 · 16 §5 (chính sách duyệt), · 21 (`GateResult`), · 50 / 52 (blueprint mua / bán)
> **Nguồn yêu cầu:** chủ dự án 2026-11-06: *"chính sách nghiệp vụ được quản lý tập trung tại module Mua hàng, Bán hàng, Nhân sự… các plugin bên ngoài sử dụng chính sách đã phát hành, thay vì mỗi plugin tự định nghĩa một bộ quy tắc riêng … Chính sách được quản trị tập trung, nhưng không bắt buộc tính toán tập trung … Phía plugin POS wp ánh xạ theo chính sách này, bán hàng, và trả sự kiện bán hàng về theo luồng event driven, CONFORMANCE / ACCOUNTING INTAKE GATE check lại rồi ghi sổ."*
> **Luật đi kèm:** [R-FLOW](../../rules/RULE-FLOW.md) (W0 tài liệu thuần; mỗi đợt code giữ chỗ riêng), [R-INTAKE](../../rules/RULE-INTAKE.md), [R-WF](../../rules/RULE-WORKFLOW.md) (R-WF-11, R-WF-16), [R-ECP](../../rules/RULE-ENTERPRISE-CONTINUITY.md) (ECP-13)

## Trả lời ngắn

| Câu hỏi | Trả lời |
|---|---|
| Có phải trụ cột mới? | **Không phải trụ cột thứ 18.** Là nửa *Policy* của trụ cột **05** (ADR-0028), ánh xạ trụ cột **V** của ADR-0022, mở rộng V từ "chế độ kế toán có phiên bản" sang cả chính sách nghiệp vụ. Vai trò ngang Master Data: MDG giữ *cái gì* (mặt hàng, đối tượng), Policy Registry giữ *theo luật nào* — có phiên bản, hiệu lực, căn cứ, được chứng từ tham chiếu (Q031-1) |
| Hai kho chính sách? | Không. Module giữ nội dung; Registry giữ phong bì (khoá, phiên bản, phạm vi, hiệu lực, băm, Rule Contract) |
| Ai tính? | Bên nào cũng được: POS tính tại chỗ (offline được), module tính cho chứng từ nội bộ. Cùng một hàm tính tất định của Rule Contract; cửa nạp tính lại để **kiểm**, không thay |
| Conformance Engine có thành cổng chặn? | Không. Engine PHASE-020 giữ vai tư vấn cấp đơn vị. Kiểm từng chứng từ là tầng **L4b** của cửa nạp, mặc định **cảnh báo** (mềm) |
| Bút toán dự kiến ở đâu ra? | **L5 chạy thử** đã có (savepoint rồi lùi). Rule Contract chỉ chỉ `reasonCode`; Posting Rules và Ledger chỉ thuộc Kernel |
| Gợi ý hay tự động? | Cả hai, theo khoá `intake.policy.mode`: *gợi ý* đưa sự việc lệch vào hàng việc kế toán kèm bút toán dự kiến; *tự động* (mặc định cho POS) ghi luôn, xem lại sau |
| Làm gì trước (small win)? | **Mua hàng**: đã có engine chính sách thuần 12 loại nhưng chính sách sửa đè, chứng từ chỉ trỏ theo mã. Thêm phiên bản + băm vào `policyTrace` là có ngay truy vết theo chính sách căn cứ cho cả phân hệ dày nhất |

## Hiện trạng đọc mã (origin/main `c8afd39`, 2026-11-06)

| Sự thật | Chỗ |
|---|---|
| Mua hàng có bảng chính sách `purchase_policies`: `code, kind, scope jsonb, valid_from/valid_to, priority, rule jsonb, is_active` | `db/migrations/0010_mua_hang.sql:56`; chú thích loại `0016_chu_thich_chinh_sach.sql:2-3` |
| Engine thuần 12 loại (`trade_discount`, `item_discount`, `qty_tier`, `payment_discount`, `promo_gift`, `rebates`, `credit_limit`, `payment_term`, `supply_target`, `lot_tracking`, `gift_budget`, `contract`); mua X tặng Y = `giftQty` (`rule.buy` / `rule.get` / lặp) | `modules/mua-hang/domain/src/engine.ts:152`, `:223` |
| Chọn chính sách: `policyApplies` (hiệu lực, phạm vi), `findPolicy` (phạm vi hẹp nhất rồi ưu tiên); `computeDoc` trả `trace[] { policy, kind, text }` | `engine.ts:378`, `:387`, `:533`, `:550-641` |
| Chứng từ mua chỉ ghi `policyTrace` theo **mã**, không phiên bản; lúc duyệt chụp số đã tính vào `data.frozen` (`FREEZE_VERSION = 3` là phiên bản khuôn, không phải chính sách) | `apps/api/src/phan-he/mua-hang/service.ts:111,179`; `store.ts:108-121` |
| Chính sách mua hàng là dòng **sửa đè** (`updated_at`), không bảng phiên bản; chỉ chặn xoá khi có `policyTrace` trỏ tới | `store.ts:383-391` |
| Bán hàng: `price_lists`, `price_list_branches`, `product_prices` **không hiệu lực, không phiên bản**; không bảng / engine khuyến mại, chiết khấu, hạn mức phía bán; chiết khấu dòng là số nguồn tự tính | `0002_goc_danh_muc.sql:739,756,790`; `packages/contracts/src/documents.ts:69` |
| Chính sách **định khoản** có phiên bản theo ngày; sổ ghi `policy_version` đã dùng | `0040_chinh_sach_phien_ban.sql:14,37-38`; `packages/kernel/src/modules/posting-config/policy.ts:83` (`selectPolicy`) |
| Luật định khoản là mã theo `docType`; gói định khoản là dữ liệu | `packages/kernel/src/modules/posting/posting.service.ts:35-46`; `pack.ts:34` |
| Tiền kiểm L1 khuôn · L2 số học · L3 dữ liệu gốc · L4 nghiệp vụ · Guard; chỉ đọc, gom mọi finding, điểm 0–100 | `packages/kernel/src/modules/intake/preflight.ts:3-17` |
| L5 chạy thử định khoản thật trong savepoint rồi lùi; `submit?dryRun=1`; `GET /documents/:id/preview` | `intake/trial-posting.ts:3-10`; `documents/document.actions.ts:121-132`; `document.routes.ts:189` |
| Commit Guard băm dữ liệu gốc + phiên bản chính sách định khoản + khoá kỳ — **không** có chính sách nghiệp vụ | `intake/guard.ts:3-11` |
| Conformance Engine chỉ đọc, tư vấn (R-VNC-10), chỉ ghi `conformance_runs`; rulepack toàn pháp lý / thuế / toàn vẹn | `packages/kernel/src/modules/conformance/conformance.service.ts`; `packages/vn-rulepacks/engine.mjs` |
| Posting Gate cấp chứng từ: khuyến nghị theo ngày chứng từ, không chặn, người dùng xác nhận đã đọc | `apps/api/test/conformance-gate.test.ts:1-8`; `apps/web/src/components/PostingGate.tsx` |
| Khuôn sự kiện miền và khuôn cửa nạp **không có** trường tham chiếu chính sách / khuyến mại / bảng giá | `docs/contracts/BIZCITY-EVENT-v1.md:45-71`; `BIZCITY-LEDGER-INTAKE-v1.md:37-57` |
| `policy_id`, "rule contract" không có trong mã | `git grep` origin/main |

## Tài liệu của phase

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, quyết định D031-*, câu hỏi Q031-*, đợt W0–W4, ai làm gì |
| [10-THIET-KE](10-THIET-KE.md) | phong bì Registry, Rule Contract, vòng đời phát hành, phân phối cho plugin, `policyRefs`, tầng L4b, bút toán dự kiến, vai Conformance Engine, ví dụ SALE-PROMO-001 mua 2 tặng 1 |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con S031-*, ca T031-*, nhật ký |

## Xong khi

- Một chứng từ mua hàng và một `sale` từ POS đều truy vết được tới `policy_key@version` + băm đã dùng, trên màn truy vết.
- POS WP lấy chính sách từ `GET /api/v1/policies`, không còn luật khuyến mại riêng trong plugin.
- Ca lệch chính sách (T031-INT-*) ra `GateResult` có mã `POL-*`, có câu giải thích và bút toán dự kiến; không ca nào làm mất sự việc hay chặn bán.
- Chính sách đã phát hành không sửa được (golden), đổi = phiên bản mới; tính lại chứng từ cũ dùng đúng bản cũ.
- `node tests/conformance/selfcheck.mjs` ĐẠT, trụ cột 05 trong `nen-mong.json` có tín hiệu `co` cho nửa Policy.
