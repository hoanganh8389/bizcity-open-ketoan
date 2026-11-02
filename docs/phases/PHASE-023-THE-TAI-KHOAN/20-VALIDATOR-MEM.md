# PHASE-023 · 20 — Khung "Vì sao" trong form danh mục: validator mềm — nhắc, hướng dẫn, cảnh báo trước khi sai
<!-- [2026-11-02 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — validator mềm chung cho mọi màn khai báo danh mục (tài khoản, đối tượng, hàng hoá, lý do, nhóm hạch toán, hình thức TT, thuế, kho, chi nhánh): bốn mức, luật máy đọc, một action validate, ghi nhận cảnh báo mềm -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Chỉ đạo chủ dự án 2026-11-02: *"trong hệ thống và các phần khai báo danh mục tài khoản, tài khoản đối tượng, tài khoản hàng hoá… cần có UI UX **why** cụ thể đóng vai trò như một validator nhắc nhở, hướng dẫn, cảnh báo mềm."*
> Bản mẫu: [mockups/form-danh-muc.html](mockups/form-danh-muc.html). Áp cho PHASE-024 (hàng hoá) qua cùng khung.

## 0. Quyết định của chủ dự án (2026-11-02) <!-- [2026-11-02 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — chủ duyệt -->

> *"đồng ý theo hướng đề xuất, cảnh báo mềm bắt buộc ghi lý do và tự chịu trách nhiệm do đã cảnh báo."*

| # | Quyết định | Thể hiện |
|---|---|---|
| D023-6 | **Cảnh báo mềm bắt buộc ghi lý do** (≥ 5 ký tự) khi lưu; không có "ghi nhận một chạm" | hộp "Lý do bạn vẫn lưu" trước khi Ghi; `audit_logs` action `catalog.warn.ack` ghi mã cảnh báo, lý do, người, thời điểm, giá trị đã lưu |
| D023-7 | **Người lưu tự chịu trách nhiệm vì đã được cảnh báo**: hệ thống không chặn, không hỏi lại, nhưng giữ bằng chứng | dòng ghi nhận hiện ở thẻ đối tượng / tài khoản ("đã lưu với cảnh báo ACC-HINT-003, lý do…, Nguyễn A, 02/11"); Bàn đánh giá (HT08) vai kiểm soát liệt kê các ghi nhận trong kỳ; số đo `bizcity_catalog_warn_ack_total{code}` |
| D023-8 | Kế toán trưởng được **hạ một luật kế toán từ ⚠ xuống ℹ cho đơn vị mình**, qua **duyệt tại đơn vị có bằng chứng** (như rulepack, ADR-0016: quyền `conformance:approve`, lý do, gắn phiên bản luật) — không qua cài đặt tự do; không hạ được luật kỹ thuật và không hạ được ✘ | màn Kiểm chuẩn (HT06) thẻ "Luật nhắc tại đơn vị"; hết hiệu lực khi nội dung luật đổi |

## 0b. Thi hành đợt 1 (2026-11-02, S023-14 / 15) <!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — có mã -->

| Phần | Ở đâu |
|---|---|
| Danh mục luật `bizcity_catalog_hint@1` (12 luật: `ACC-HINT-001..007`, `ACC-BLOCK-001`, `PART-HINT-001..004`; `status: draft` tới khi kế toán trưởng duyệt) | `packages/contracts/src/catalog-hint.ts` |
| Tài khoản: so với **tài khoản cha** của đơn vị, không có cha thì **hệ thống tài khoản chuẩn** (`db/seeds/tai-khoan.csv`) | `packages/kernel/src/modules/accounts/account.hints.ts`; `POST /api/v1/accounts/validate` |
| Đối tượng: NCC thiếu MST, MST sai định dạng (10 số, 10-3, 12 số), trùng tên | `apps/api/src/modules/partners/partner.hints.ts`; `POST /api/v1/partners/validate` |
| Lưu: `meta.findings` ở thêm / sửa; cảnh báo mềm có lý do → `catalog.warn.ack`, API / plugin không lý do → `catalog.warn.unacked` (cảnh báo vẫn được trả và có bằng chứng); lý do < 5 ký tự → 400 | `packages/platform/src/core/catalog-warn.ts` |
| Giao diện: `WhyPanel`, `useCatalogWhy` (trễ 300 ms), `useWarnAck` + `WarnAckBox`; form Tài khoản (ACC1), Đối tượng (DM03) | `apps/web/src/components/WhyPanel.tsx` |
| Ca thử | `apps/api/test/catalog-why.test.ts` (9 ca) |

**Sửa so với bản mẫu (đọc dữ liệu thật):** hệ thống tài khoản chuẩn để `is_debt = 0` cho cả 131 / 331; sổ phụ công nợ lấy tài khoản theo **`track_partner OR is_debt OR lưỡng tính`** (`debt.service.ts`). Vì vậy cảnh báo "chưa tích *Là công nợ*" trong bản mẫu là sai; luật thi hành `ACC-HINT-003` báo khi tài khoản thuộc nhóm công nợ mà **không có cả ba cờ** (không vào sổ phụ công nợ), và `ACC-HINT-005` khi nhóm theo dõi đối tượng mà tài khoản bỏ cờ đó.

## 1. Ý tưởng

Thẻ tài khoản (30-UI-UX) giải thích **sau** khi người dùng gặp tài khoản. Khung "Vì sao" trong form giải thích **trước** khi họ lưu một khai báo sai: ngay lúc tích ô "lưỡng tính", chọn tài khoản kho cho nhóm hạch toán, bỏ trống MST của nhà cung cấp. Cùng một nguồn luật với trigger và bộ kiểm, nhưng nói trước, nói mềm, và nói bằng hậu quả nghiệp vụ.

Ba vai trò, một khung:

| Vai trò | Khi nào | Người dùng làm gì |
|---|---|---|
| **Nhắc** (ℹ) | ô vừa được chọn có hệ quả không hiển nhiên | đọc, không phải làm gì |
| **Hướng dẫn** (▶) | khai báo cần bước tiếp theo hoặc có cách làm đúng hơn | mở ra, bấm nút đi tới bước |
| **Cảnh báo mềm** (⚠) | khai báo **hợp lệ về kỹ thuật** nhưng thường là sai về kế toán | vẫn lưu được; khi lưu phải **ghi nhận** (một dòng lý do, lưu vào nhật ký) |
| Chặn (✘) | chỉ bất biến Tier 0 và toàn vẹn dữ liệu | không lưu được — như hiện nay, không đổi |

Luật: **cảnh báo mềm không bao giờ thành chặn** bằng cách đổi cấu hình; muốn chặn phải sửa Kernel (R-KER-2, như D021-3 của trạm tiền kiểm). Ngược lại, chặn không được hạ thành mềm.

## 2. Khung hiển thị

```text
┌ Tài khoản · thêm mới ─────────────────────────────────────────────────────────────────────┐
│ Mã (*)   [1311      ]   Tên (*) [Phải thu khách hàng ngắn hạn      ]   Cấp cha [131 ▾]    │
│ Số dư    ( ) Dư Nợ  ( ) Dư Có  (●) Lưỡng tính        [✓] Theo dõi đối tượng  [ ] Là công nợ │
│                                                                                            │
│ ┌ VÌ SAO ──────────────────────────────────────────────────────────────────────────────┐ │
│ │ ℹ Kế thừa từ 131: lưỡng tính, theo dõi đối tượng. Sổ sẽ bắt buộc chọn khách ở mọi dòng. │ │
│ │ ▶ Lưỡng tính nghĩa là gì?  Mỗi khách có thể đang nợ (dư Nợ) hoặc trả trước (dư Có)…      │ │
│ │   Báo cáo: dư Nợ → CĐKT 131 · dư Có → CĐKT 312.                      [Thẻ 131 ▸]       │ │
│ │ ⚠ Bạn bỏ tích "Là công nợ": tài khoản sẽ không vào sổ phụ công nợ, không có tuổi nợ,   │ │
│ │   không đối trừ hoá đơn. Với tài khoản phải thu điều này gần như luôn sai.              │ │
│ │   → Tích "Là công nợ"  hoặc  ghi lý do khi lưu.                                         │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                              [Huỷ]  [Ghi (có 1 cảnh báo)] │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Khung nằm **dưới nhóm ô liên quan**, không che form, không popup. Tối đa 3 dòng hiện; dòng ▶ mở rộng tại chỗ.
- Dòng ⚠ có nút sửa ngay (một chạm) và lựa chọn "ghi lý do khi lưu".
- Nút Ghi đếm cảnh báo mềm: "Ghi (có 1 cảnh báo)". Bấm → hộp nhỏ: *"1 cảnh báo mềm. Lý do bạn vẫn lưu: [________]"* (**bắt buộc**, ≥ 5 ký tự — D023-6) → lưu + `audit_logs` action `catalog.warn.ack` với mã cảnh báo, lý do, người, giá trị đã lưu. Câu dưới ô: *"Bạn đã được cảnh báo; lưu là tự chịu trách nhiệm về khai báo này."* (D023-7)
- Mọi dòng có `rule` (mã luật) ẩn sau ⓘ; không chép điều luật vào form.

## 3. Nguồn luật: một danh mục máy đọc, ba nơi dùng

`data/giai-nghia-danh-muc/<entity>.vn-tt99.json` (mở rộng `bizcity_account_card@1` → `bizcity_catalog_hint@1`):

```json
{ "entity": "account", "rules": [
  { "id": "ACC-HINT-003", "level": "warn", "when": { "code": "^13[1-9]", "isDebt": false },
    "why": "Tài khoản phải thu không vào sổ phụ công nợ: không có tuổi nợ, không đối trừ hoá đơn.",
    "fix": [{ "set": { "isDebt": true }, "label": "Tích \"Là công nợ\"" }], "rule": "R-MD-4", "learn": "131" },
  { "id": "ACC-HINT-001", "level": "info", "when": { "parentHas": ["normalSide", "trackPartner"] },
    "why": "Kế thừa từ {parent}: {inherited}. Sổ sẽ bắt buộc chọn đối tượng ở mọi dòng." },
  { "id": "ACC-HINT-002", "level": "guide", "when": { "normalSide": "both" },
    "why": "Mỗi đối tượng có thể đang nợ (dư Nợ) hoặc trả trước (dư Có)…", "learn": "131" }
] }
```

| Nơi dùng | Cách |
|---|---|
| **Form web** | gọi `core.<entity>.validate` (action đọc, `dryRun`) mỗi khi ô có hệ quả đổi (debounce 300 ms); hiện khung |
| **Nhập Excel** | cùng action theo lô; cột "Vì sao" trên bảng xem trước; dòng ⚠ nhập được, ghi nhận một lần cho cả lô |
| **API / plugin** (`core.item.upsert`, `core.partner.upsert`, `PUT /api/v1/posting/reasons/:code`) | phản hồi `meta.findings[]` cùng khuôn; plugin thấy cảnh báo như người dùng; `bizcity_item_validation_findings_total{code}` đếm |

Nội dung `why` của luật kế toán do **kế toán trưởng duyệt** (như giải nghĩa tài khoản, D023-4); luật kỹ thuật (mã trùng, ĐVT thiếu) do Nhóm Lõi.

## 4. Danh mục nhắc / hướng dẫn / cảnh báo khởi đầu (theo màn)

| Màn | ℹ Nhắc | ▶ Hướng dẫn | ⚠ Cảnh báo mềm | ✘ Chặn (đã có) |
|---|---|---|---|---|
| **Tài khoản (ACC1)** | kế thừa cờ từ cấp cha; tài khoản tổng hợp không ghi sổ được | lưỡng tính là gì; theo dõi đối tượng kéo theo gì; mã con phải bắt đầu bằng mã cha | 1xx / 6xx đặt dư Có, 3xx / 5xx đặt dư Nợ; 131 / 331 / 141 / 335 / 338 bỏ "theo dõi đối tượng" hoặc "là công nợ"; tạo tài khoản ngoài hệ thống TT99 không có cha; ngừng dùng tài khoản còn số dư | mã trùng; cha không tồn tại; xoá tài khoản đã có bút toán |
| **Đối tượng (DM03)** | loại NCC → hoá đơn đầu vào cần MST | MST sai định dạng → cách tra cứu; hạn thanh toán ảnh hưởng tuổi nợ | NCC không có MST; trùng MST / trùng tên với đối tượng khác (gợi ý gộp — hạng 2); tài khoản công nợ mặc định không phải 131 / 331; đối tượng nội bộ (`CN-*`) sửa tay | mã trùng; xoá đối tượng có số dư |
| **Hàng hoá (DM, PHASE-024)** | quy tắc mã gợi ý phân loại (có thể bỏ) | phân loại ảnh hưởng tài khoản nào (nhóm → 156 / 632 / 511) | chưa phân loại; loại dịch vụ mà "theo dõi tồn"; đuôi mã KM nhưng loại không `gift`; ĐVT quy đổi thiếu; biến thể trùng thuộc tính; đổi nhóm hạch toán khi có tồn (→ hạng 3) | mã trùng hiệu lực; ĐVT trùng; xoá mã đã dùng |
| **Lý do (ACC18)** | lý do mặc định cho loại chứng từ chỉ nên có một | loại `journal` cần cặp Nợ / Có; cờ `costAtSalePrice`, `giftCostToPromotion` làm gì | TK đối ứng không khớp loại (lý do thu mà đối ứng 6xx); lý do chi không có mã LCTT; hai lý do mặc định cùng loại | journal thiếu cặp; TK tổng hợp (có từ 3.15) |
| **Nhóm hạch toán** | nhóm mặc định áp cho mọi mặt hàng chưa phân loại | mỗi tài khoản của nhóm đi vào bút toán nào | TK kho không phải 15x; giá vốn không phải 632; doanh thu không 511; không có nhóm mặc định | TK không tồn tại / tổng hợp |
| **Hình thức TT** | `receivable` = ghi nợ, không có tiền | TK tiền theo hình thức; đối tượng nhận hộ | TK không phải 11x mà không `receivable`; hai hình thức cùng TK và cùng tên | TK không tồn tại |
| **Thuế** | thuế đầu vào / ra theo mã | giảm 8% có thời hạn — ngày hiệu lực | TK thuế ra không 3331, vào không 133; thuế suất khác danh sách VN | mã trùng |
| **Kho, chi nhánh** | kho mặc định của chi nhánh | chi nhánh khác đơn vị hạch toán → 13681 / 33681 | chi nhánh không có đơn vị hạch toán; kho không có chi nhánh; đổi đơn vị hạch toán khi có số dư (→ hạng 3) | mã trùng; xoá còn tồn |

## 5. Luật của khung

- Một ô đổi → tối đa **3** dòng mới; không hiện lại dòng đã ghi nhận trong phiên.
- Cảnh báo mềm **không có nút "tắt loại cảnh báo này"** cho người dùng; chỉ ghi nhận từng lần. Kế toán trưởng có thể hạ ⚠ → ℹ cho đơn vị qua duyệt có bằng chứng (D023-8). Số lần ghi nhận theo mã là tín hiệu để xem lại luật (hoặc người dùng).
- Mỗi dòng ≤ 3 câu: hậu quả trước, cách sửa sau, link "học thêm" cuối (thẻ tài khoản / mặt hàng).
- Không số tiền ngoài phạm vi quyền (R-DIAG-6); không chép điều luật.
- Chặn giữ màu đỏ và không trộn vào khung mềm; chặn vẫn có "Vì sao?" (30-UI-UX §4).

## 6. Thi hành

| ID | Việc | Đợt |
|---|---|---|
| S023-13 | Hợp đồng `bizcity_catalog_hint@1` (mở rộng account_card): luật `{ id, level, when, why, fix[], rule, learn }`; tệp theo entity; SC-ACC-2 kiểm `rule` có thật, `learn` trỏ thẻ có giải nghĩa, `when` chỉ dùng trường của entity | W1 |
| S023-14 | Action đọc `core.<entity>.validate` cho account, partner, reason, posting-group, payment-method, tax-code, warehouse, branch (item: PHASE-024 S024-7); trả `findings[]` cùng khuôn `bizcity_remedy@1` + `why` | W1–W2 |
| S023-15 | Component web `<WhyPanel>` + `<SaveWithWarnings>` (ghi nhận lý do → `catalog.warn.ack`); gắn vào ACC1, DM03, ACC18, nhóm hạch toán, hình thức TT, thuế, kho, chi nhánh; nhập Excel cột "Vì sao" | W2 |
| S023-17 | Hạ luật tại đơn vị (D023-8): bảng `catalog_hint_overrides` chỉ thêm (mã luật, mức mới, phiên bản luật, người duyệt, lý do), action `core.catalog-hint.override` (`conformance:approve`), thẻ "Luật nhắc tại đơn vị" ở HT06; hết hiệu lực khi băm luật đổi | W2 |
| S023-18 | Ghi nhận hiện ở thẻ đối tượng / tài khoản và Bàn đánh giá vai kiểm soát; `bizcity_catalog_warn_ack_total{code}` | W2 |
| S023-16 | Danh mục khởi đầu §4 (~40 luật), kế toán trưởng duyệt phần kế toán; số đo `bizcity_catalog_warn_ack_total{code}` | W2 |
