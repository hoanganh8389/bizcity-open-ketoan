# PHASE-023 · 40 — Master checklist
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — master checklist: S023-1..12, ca bằng chứng T023-1..5, log -->

> Nguồn trạng thái **việc con** duy nhất của phase. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Code | Trạng thái |
|---|---|---|---|---|---|
| S023-1 | Tài liệu W0: [README](README.md), [00](00-MASTER-PLAN.md), [30](30-UI-UX.md); roadmap 4.8 | W0 | P0 | — | ✅ 2026-11-02 |
| S023-2 | Bản mẫu tĩnh [mockups/the-tai-khoan.html](mockups/the-tai-khoan.html): thẻ 131, thẻ 1111, ô chọn, nút Vì sao ở lỗi | W0 | P0 | — | ✅ 2026-11-02 — chờ chủ duyệt bố cục |
| S023-3 | Chủ duyệt D023-1..8, trả lời Q023-1..4 | W0 | P0 | — | 🟡 D023-6..8 ✅ 2026-11-02 (cảnh báo mềm bắt buộc lý do, tự chịu trách nhiệm, hạ luật qua duyệt tại đơn vị); D023-1..5, Q023-1..4 còn chờ |
| S023-4 | Hợp đồng `bizcity_account_card@1` (`docs/contracts/BIZCITY-ACCOUNT-CARD-v1.md` + schema), `packages/contracts/src/account-card.ts`; `bizcity-standard.json` năng lực `ui.account-card` planned | W1 | P0 | ☐ | ☐ |
| S023-5 | Tệp giải nghĩa `data/giai-nghia-tai-khoan/vn-tt99.json`: 30 tài khoản (D023-5), nháp theo Q023-1; căn cứ trỏ `docs/can-cu` | W1 | P0 | — | ⛔ kế toán trưởng duyệt nội dung |
| S023-6 | Check SC-ACC-1 (DOCS): đủ trường, `soDu` khớp `normal_side` gói nền, `both` có `viSaoLuongTinh`, `track_partner` có `viSaoDoiTuong`, căn cứ tồn tại; ca tự kiểm — warn tới khi phủ cấp 2, rồi block | W1 | P0 | ☐ | ☐ |
| S023-7 | Action đọc `core.account.card` (`accounts:read`; lớp 3 theo `ledger:read`): dư Nợ / dư Có tách theo đối tượng tại ngày, số đối tượng, phát sinh kỳ, cảnh báo đang có; `expose.mcp` theo Q023-4 — ca T023-1, 2 | W1 | P0 | ☐ | ☐ |
| S023-8 | Web: thẻ ở ACC1 (ngăn phải), `AccountPicker` nhãn + một câu, form ACC1 giải thích ô lưỡng tính — ca T023-3 | W2 | P0 | ☐ | ☐ |
| S023-9 | Sổ chi tiết tài khoản, cân đối phát sinh: dòng tóm tắt; tài khoản `both` hai cột dư theo đối tượng | W2 | P0 | ☐ | ☐ |
| S023-10 | `remedy.why` (mở rộng `bizcity_remedy@1` 1.1): khai ở `validateLines` (đối tượng, tổng hợp, ngừng dùng), `ACCOUNT_WRONG_SIDE`, `UNBALANCED_ENTRY`, thiếu cấu hình hạch toán, `DEBT_MATCH_LEDGER`, IN-POST-002; web nút "Vì sao?" — ca T023-4 | W2 | P0 | ☐ | ☐ |
| S023-11 | Chế độ học: khoá `bizcity.ui.learning_mode` (registry, theo người dùng), chữ T xem trước bằng định khoản thử trong giao dịch huỷ, nút "Thử" | W3 | P1 | ☐ | ☐ |
| S023-12 | Trang Học theo vai: 3 bài (thu ngân · kế toán viên · kế toán trưởng) trên tenant mẫu, chấm ngay; gợi ý theo bảng điểm đầu vào (021) — ca T023-5; `docs/huong-dan/dao-tao-theo-vai-tro.md`, `the-tai-khoan.md` | W3 | P1 | ☐ | ☐ |
| S023-13 | 🟡 2026-11-02: danh mục luật ở `packages/contracts/src/catalog-hint.ts` (TS, máy đọc); còn tài liệu hợp đồng + SC-ACC-2 — Hợp đồng `bizcity_catalog_hint@1` (luật `{ id, level, when, why, fix[], rule, learn }` theo entity) + SC-ACC-2 ([20 §3](20-VALIDATOR-MEM.md)) <!-- [2026-11-02 10:00 PM Johnny Chu - Chu Hoàng Anh] --> | W1 | P0 | ☐ | ☐ |
| S023-14 | Action đọc `core.<entity>.validate` cho account, partner, reason, posting-group, payment-method, tax-code, warehouse, branch; `meta.findings[]` ở API upsert | W1–W2 | P0 | có | 🟡 2026-11-02: **account, partner** có (`POST /api/v1/{accounts,partners}/validate`, `meta.findings` khi lưu); còn 6 danh mục |
| S023-15 | Web `<WhyPanel>` + `<SaveWithWarnings>` (ghi nhận lý do → `catalog.warn.ack`); gắn 8 màn; nhập Excel cột "Vì sao" — ca T023-6 | W2 | P0 | có | 🟡 2026-11-02: `WhyPanel` / `useWarnAck` / `WarnAckBox`; ACC1, DM03 có; `catalog-why.test.ts` 9 ca (T023-6, T023-7 phần API); còn 6 màn + nhập Excel |
| S023-16 | Danh mục luật khởi đầu [20 §4](20-VALIDATOR-MEM.md) (~40), kế toán trưởng duyệt phần kế toán; số đo `bizcity_catalog_warn_ack_total{code}` | W2 | P0 | — | ⛔ kế toán trưởng |
| S023-17 | Hạ luật tại đơn vị (D023-8): `catalog_hint_overrides` chỉ thêm, action `core.catalog-hint.override` (`conformance:approve`), thẻ HT06; hết hiệu lực khi băm luật đổi <!-- [2026-11-02 10:15 PM Johnny Chu - Chu Hoàng Anh] --> | W2 | P1 | có | ✅ 2026-11-03: HT09 "Quy định dữ liệu danh mục" — `catalog_rule_reviews` (0062) + `core.catalog-rule.review` (`conformance:approve`): đồng ý / sửa câu chữ / hạ warn → info (bắt buộc lý do) / về mặc định; bản duyệt gắn dấu luật (`hintHash`), luật đổi → hết hiệu lực. Khác thiết kế ban đầu: bảng giữ trạng thái hiện hành, lịch sử ở `audit_logs` (`catalog.rule.review`) thay cho bảng chỉ thêm; màn HT09 thay thẻ HT06 |
| S023-18 | Ghi nhận cảnh báo hiện ở thẻ đối tượng / tài khoản và Bàn đánh giá vai kiểm soát; `bizcity_catalog_warn_ack_total{code}` — ca T023-7 | W2 | P1 | ☐ | ☐ |

## Ca bằng chứng

| Ca | Kiểm gì | Đạt khi |
|---|---|---|
| T023-1 | `core.account.card` 131 trên đơn vị test có 3 khách nợ, 1 khách trả trước | dư Nợ = Σ khách nợ, dư Có = Σ khách trả trước, không bù trừ; số đối tượng đúng |
| T023-2 | Quyền: `viewer` không `ledger:read` | lớp 1 + 2 trả về, lớp 3 rỗng với lý do `FORBIDDEN_SECTION` |
| T023-3 | ACC1 + ô chọn | tài khoản con không có mục riêng hiện mục cha kèm "theo 131"; nhãn khớp `normal_side` / `track_partner` |
| T023-4 | Lập phiếu kế toán Nợ 335 thiếu đối tượng | lỗi có nút "Vì sao?" mở mục 335 *Vì sao bắt buộc đối tượng*; "Cách khắc phục" mở ô đối tượng |
| T023-5 | Bài "131 / 331 lưỡng tính" trên tenant mẫu | 7 tình huống lập được, chấm đúng; tiến độ lưu theo người dùng |
| T023-7 | Lưu với cảnh báo không ghi lý do / lý do 3 ký tự | bị từ chối; lý do ≥ 5 ký tự → lưu, `catalog.warn.ack` có đủ mã, lý do, người, giá trị; thẻ hiện dòng ghi nhận |
| T023-6 | Form ACC1: tạo 1311 bỏ "là công nợ"; đặt 1xx dư Có; mã không theo cha | hai cảnh báo mềm hiện đúng, Ghi đòi lý do và ghi `catalog.warn.ack`; mã sai cha bị chặn; cùng findings trả về qua `core.account.validate` và `meta.findings` của API |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-02 21:20 | Claude Code | Chủ: "tạo phase để phát triển riêng cho thẻ tài khoản vì đây thuộc về bản chất của kế toán và cũng liên quan đến các rule ghi sổ, audit, bug lỗi" ⇒ W0: README / 00 / 30, bản mẫu, roadmap 4.8. |
| 2026-11-02 22:00 | Claude Code | Chủ: "các phần khai báo danh mục… cần có UI UX why cụ thể đóng vai trò như một validator nhắc nhở, hướng dẫn, cảnh báo mềm" ⇒ [20-VALIDATOR-MEM](20-VALIDATOR-MEM.md) + bản mẫu form-danh-muc.html; S023-13..16, T023-6. |
| 2026-11-02 22:15 | Claude Code | Chủ duyệt: cảnh báo mềm bắt buộc ghi lý do, người lưu tự chịu trách nhiệm; hạ luật chỉ qua duyệt tại đơn vị ⇒ D023-6..8 vào [20 §0](20-VALIDATOR-MEM.md); S023-17, 18; T023-7. |
| 2026-11-02 22:40 | Claude Code | Chủ "code nhé" ⇒ S023-14 / 15 đợt 1: khung Vì sao cho Tài khoản + Đối tượng (12 luật, validate, meta.findings, catalog.warn.ack / unacked, WhyPanel). Đọc dữ liệu thật thấy luật "Là công nợ" của bản mẫu sai → sửa thành điều kiện sổ phụ công nợ thật (20 §0b). Gộp hai commit tài liệu chưa vào main ở PR #35. |
| 2026-11-03 11:40 | Claude Code | S023-17 xong ở HT09 (duyệt luật nhắc theo đơn vị, hạ mức có lý do, hết hiệu lực khi luật đổi). S023-16 (kế toán trưởng duyệt nội dung) giờ làm được ngay trong ứng dụng. |
