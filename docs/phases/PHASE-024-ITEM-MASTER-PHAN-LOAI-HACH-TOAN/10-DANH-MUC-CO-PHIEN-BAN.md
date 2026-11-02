# PHASE-024 · 10 — Versioned Master Data Contract: định danh · mã · phân loại cho mọi đối tượng; hạng thay đổi; tài khoản kế toán; test chuẩn plugin
<!-- [2026-11-02 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — nguyên tắc chung theo ADR-0018: định nghĩa mã định danh đối tượng ≠ số hiệu tài khoản; bốn hạng thay đổi; hai cổng kiểm chuẩn; ca chuẩn plugin -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Quyết định: [ADR-0018](../../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (đề xuất, chờ chủ duyệt). Hàng hoá là thể hiện đầu tiên ([ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [20-KIEN-TRUC](20-KIEN-TRUC.md)).

## 1. Định nghĩa

| Thuật ngữ | Nghĩa | Ví dụ |
|---|---|---|
| **Định danh** (identity) | khoá bất biến do Core cấp một lần cho một đối tượng; mọi liên kết trong sổ trỏ vào đây; không bao giờ đổi, không dùng lại | `item_id` ULID; `partners.id`; `branches.id` |
| **Mã** (code) | chuỗi người và hệ thống ngoài dùng để gọi đối tượng; **có phiên bản, có ngày hiệu lực**, có thể nhiều mã cùng lúc theo `kind` (`sku`, `barcode`, `external:<nguồn>`, `alias`) | `SUA01` (từ 2025) thay `SUA-1L` (2023–2024); khách `KH-A` = `external:pos-cn02` `KH00912` |
| **Số hiệu tài khoản** | mã của tài khoản kế toán **do chế độ kế toán quy định** (TT99, TT133) cộng phần chi tiết của đơn vị; **là** định danh của tài khoản trong phạm vi một phiên bản hệ thống tài khoản — không có định danh thay thế | `156`, `1561`, `15611-KHOA` |
| **Phân loại hạch toán** (classification) | thuộc tính quyết định **cách ghi sổ** của đối tượng; có ngày hiệu lực; được chụp vào chính sách kế toán (ADR-0009) | mặt hàng: loại + nhóm hạch toán + thuế; đối tượng: khách / NCC / nội bộ, nhóm công nợ, tài khoản công nợ mặc định; chi nhánh: đơn vị hạch toán |
| **Thuộc tính** | mọi thứ còn lại; đổi tự do, có nhật ký | tên, địa chỉ, ảnh, mô tả, MST (có kiểm định dạng) |
| **Bản chất nghiệp vụ** | phân loại + tài khoản mà sổ đang phản ánh cho đối tượng; đổi bản chất là **sự việc kế toán**, không phải sửa danh mục | hàng hoá → nguyên vật liệu; khách hàng → vừa khách vừa NCC; CCDC → tài sản |

Hai câu của chủ dự án, viết lại thành luật:

- **Đổi mã định danh đối tượng** = thêm phiên bản mã. Không đổi bản chất, số dư, bút toán. (hạng 1)
- **Đổi tài khoản hạch toán hoặc bản chất đối tượng** = thêm phiên bản phân loại **từ ngày D** + kiểm chuẩn + **chứng từ điều chỉnh** khi số dư tại D phải chuyển. (hạng 3)

## 2. Bốn hạng thay đổi và quy trình

Mở rộng bảng của chủ dự án; cột "Có bút toán?" là **"chứng từ điều chỉnh"** vì danh mục không bao giờ tự sinh bút toán.

| Hạng | Thay đổi | Ví dụ | Quy trình | Chứng từ điều chỉnh | Ai |
|---|---|---|---|---|---|
| **0 — thuộc tính** | tên, địa chỉ, mô tả, ảnh, tên tài khoản | đổi tên khách; sửa MST | Validate → Audit → Activate ngay | không | người có `catalog:write` |
| **1 — mã** | thêm / đổi / ngừng một mã, thêm mã ngoài | `SUA-1L` → `SUA01`; khách có thêm mã POS | Validate → **ngày hiệu lực** → Audit → Activate | không | `catalog:write`; sổ không đổi (R-ITEM-0) |
| **2 — gộp / tách định danh** | hai khách là một; hai mã hàng là một; tách biến thể ra tồn riêng | gộp `KH-A` và `KH-A2`; gộp hai NCC | Validate → **Impact** (số dư, chứng từ mở, hai phân loại có khớp) → **xem trước** → Audit → Activate (bí danh, không đổi `id` sổ cũ) | **có thể**: gộp công nợ hai đối tượng là chứng từ đối trừ / chuyển công nợ tại ngày gộp, qua cửa nạp | `settings:write` + người duyệt thứ hai khi có số dư |
| **3 — bản chất / phân loại / tài khoản** | đổi loại mặt hàng (156 → 152), đổi nhóm hạch toán dẫn đến đổi TK, đổi khách thành NCC, đổi đơn vị hạch toán của chi nhánh, đổi chế độ kế toán | 2.000 hộp sữa đang ở 156 chuyển sang 152 | Validate → **Impact** → **Mô phỏng** (định khoản thử chứng từ mở với phân loại mới; số dư tại D) → **Phê duyệt** (kế toán trưởng) → Activate phân loại từ D → **chứng từ phân loại lại** | **có** khi số dư tại D ≠ 0: Nợ 152 / Có 156 giá trị tồn tại D (chứng từ `manual_journal` lý do `PHAN-LOAI-LAI` hoặc phiếu kế toán của `ke-toan`), đi cửa nạp, có bằng chứng | kế toán trưởng; K2 với luật nếu thêm lý do mới |

Nguyên tắc rút ra (vào `bizcity_master_data@2`):
- **Hạng 0, 1 không được chờ duyệt** — nếu bắt duyệt, người dùng bỏ công cụ.
- **Hạng 2, 3 không được tự động** — Core chỉ xem trước và chặn; người ký.
- **Mọi thay đổi chạm số dư ra một chứng từ** có `docKey`, phiên bản, người duyệt, trace — danh mục không có quyền ghi sổ (bốn câu không thương lượng, câu 1).
- **Ngày hiệu lực là bắt buộc từ hạng 1**; ngày ≤ kỳ đã khoá bị chặn (Period Lock Gate) trừ khi mở kỳ có lý do.

## 3. Tài khoản kế toán: số hiệu không có định danh thay thế

| Tình huống | Hạng | Cách làm |
|---|---|---|
| Đổi **tên** tài khoản | 0 | thuộc tính; sổ in tên tại thời điểm in |
| Thêm tài khoản chi tiết (`15611` dưới `1561`) | 1 | thêm vào hệ thống tài khoản, hiệu lực từ ngày; không chuyển số dư |
| Đổi **số hiệu** tài khoản chi tiết của đơn vị (`15611-KHO1` → `15611`) | 2 | **phiên bản hệ thống tài khoản** (ADR-0013 hồ sơ kế toán có phiên bản): bảng ánh xạ cũ → mới, ngày hiệu lực; chứng từ **chuyển số dư** tại ngày hiệu lực (Nợ mới / Có cũ) để tài khoản cũ về 0 rồi ngừng; sổ trước ngày giữ số hiệu cũ, báo cáo nhiều kỳ đọc qua ánh xạ |
| Đổi **chế độ kế toán** (TT133 → TT99) | 3 | như trên ở quy mô toàn hệ thống tài khoản: ánh xạ theo gói chế độ, mô phỏng CĐKT trước / sau, phê duyệt, chứng từ chuyển số dư hàng loạt (một chứng từ nhiều dòng, có bằng chứng) |
| Mặt hàng từ 156 sang 152 | 3 (**của mặt hàng**, không phải của tài khoản) | phân loại mới từ D; kiểm tồn, chứng từ mở, giá vốn; chứng từ phân loại lại giá trị tồn tại D; sau D định khoản theo 152 |

Vì sao không `account_id`: số hiệu là ngôn ngữ chung với cơ quan thuế, kiểm toán, phần mềm khác; một sổ mà `156` hôm nay có thể là `152` ngày mai qua "đổi mã" thì không ai ngoài hệ thống đọc được. Ánh xạ có phiên bản giữ cả hai: sổ cũ nguyên văn, báo cáo mới đúng chế độ mới.

## 4. Hai cổng kiểm chuẩn (ảnh "quy trình tổng thể" của chủ dự án, đối chiếu Kernel)

| Bước trong ảnh | Kernel hiện có | Thiếu / thêm ở phase này |
|---|---|---|
| 1. Master Data Gateway (tenant, quyền, schema, định danh) | RLS (PHASE-007), quyền theo action, zod ở cửa, `ownDocument` | **Resolver** định danh cho mọi loại đối tượng (hàng hoá W1; đối tượng / chi nhánh W2) |
| 2. Impact Assessment | chưa có | `core.<entity>.impact` (đọc): số dư, chứng từ mở, bút toán 12 tháng, phân loại hai bên — dùng cho hạng 2, 3 |
| 3. **Gate A — Danh mục** (kiểm chuẩn, mô phỏng, phê duyệt trước khi kích hoạt phiên bản mới) | chưa có cho danh mục; có cho chính sách (ADR-0009 phát hành chế độ) | Gate A = hạng 3: mô phỏng = định khoản thử trong giao dịch huỷ (dùng lại L5), phê duyệt = action có người ký, kích hoạt = phiên bản phân loại có ngày |
| 4. Accounting Event → Rules → Costing | có (chuỗi §3 master plan) | đọc phân loại **tại ngày** |
| 5. **Gate B — Pre-Posting** (bút toán, kỳ khoá, giá vốn, số dư, phiên bản) | **có**: trạm tiền kiểm L4 / L5 + `validateLines` + Period Lock Gate + trigger | thêm IN-ITEM-*, IN-POST-005 |
| BLOCK → lỗi có cấu trúc / PASS → commit + outbox cùng giao dịch | có (`bizcity_errors@1`, R-OUTBOX) | — |
| 6. Domain Events + Reconciliation | có outbox; có DEBT_MATCH_LEDGER, INVENTORY_NEGATIVE | thêm `STOCK_LEDGER_MATCH`, DG-ITEM-*, sự kiện `bizcity.masterdata.<entity>.changed { class, effectiveFrom }` |

Kết luận: ảnh đúng về **thứ tự**; Gate B đã có, Gate A là phần mới và **chỉ bật cho hạng 3** (và hạng 2 có số dư).

## 5. Bộ test chuẩn plugin (ảnh "Conformance Checklist — Plugin" → ca chạy máy)

Checklist tay không chứng nhận được (ghi chú trong ảnh). Mỗi dòng thành **một ca trong lane runtime** (4.3) chạy trên CSDL test với plugin thật nạp qua SDK; đạt = PASS trong `conformance-report.json`.

| # | Dòng checklist | Ca máy | Có sẵn? |
|---|---|---|---|
| 1 | Không tạo trùng mã đối tượng | `CA-MD-01`: plugin upsert cùng mã hai lần → một định danh; khác mã cùng MST → cảnh báo IN-MD-005 | một phần (`partner.upsert` idempotent) |
| 2 | Đổi mã vẫn giữ nguyên định danh | `CA-MD-02`: `add-code` + `retire-code` → `id` không đổi, sổ không đổi (DG-ITEM-3 / DG-MD-3 = 0) | **mới** |
| 3 | Không thay đổi chứng từ đã ghi sổ | `CA-LED-01`: UPDATE `ledger_*` bị trigger chặn; `assertLedgerInvariants` | có |
| 4 | Phân giải đúng phiên bản theo ngày hiệu lực | `CA-MD-03`: chứng từ ngày cũ tra mã cũ; ngày mới tra mã mới; phân loại tại ngày | **mới** |
| 5 | Thiếu mapping kế toán phải chặn posting | `CA-POST-01`: item chưa phân loại + fallback tắt → IN-ITEM-004 block; nhóm thiếu → IN-POST-003 | một phần (nhóm thiếu có; fallback mới) |
| 6 | Không ghi trùng event khi POS gửi lại | `CA-EVT-01`: cùng `docKey` + `version` → `unchanged`; Idempotency-Key → replayed | có (`module-sdk.test.ts`) |
| 7 | Tổng Nợ = tổng Có và đúng đơn vị hạch toán | `CA-LED-02`: `UNBALANCED_ENTRY`; chi nhánh khác đơn vị hạch toán → 13681 / 33681 | có |
| 8 | Không cho plugin bypass Conformance Gate | `CA-SEC-01`: plugin ghi thẳng bảng danh mục / sổ → vai trò `mod_<key>_rw` không có quyền; SC-MOD-2; `ownDocument` | có (ADR-0011 D4) |
| 9 | Trả mã lỗi chuẩn và có thể truy vết | `CA-API-01`: mọi lỗi theo `bizcity_errors@1` có `requestId`, `traceId` | có |
| 10 | Có bằng chứng kiểm thử và tài liệu tích hợp | `CA-DOC-01`: `check-report.json` + `docs/` của module; SC-MOD-3 manifest | có |

Thi hành: S024-19 thêm 3 ca mới (CA-MD-02, -03, CA-POST-01 phần fallback) vào lane runtime; `bizcity module check` (4.1) in bảng này cho plugin.

## 6. Thể hiện với người dùng (chung cho mọi đối tượng)

- **Thẻ** (mặt hàng, khách hàng, chi nhánh) cùng năm khối: Một câu · Định danh & mã (lịch sử) · Phân loại (tại ngày, lịch sử) · Số của đơn vị · Kiểm.
- **Một hộp thoại "Thay đổi"** hỏi: đổi gì? → tự xếp hạng 0–3 → hiện hậu quả bằng tiếng người ("sổ không đổi" / "cần xem trước" / "cần kế toán trưởng duyệt và một chứng từ phân loại lại ~ 312 tr") → ngày hiệu lực → xác nhận.
- **Trang Quy định (HT09)** mở rộng từ "dữ liệu hàng hoá" thành **"Quy định dữ liệu danh mục"**: sáu nguyên tắc áp cho mọi đối tượng, tình trạng theo từng loại (hàng hoá · đối tượng · tài khoản · chi nhánh).

## 7. Việc thêm vào checklist

| ID | Việc | Đợt |
|---|---|---|
| S024-19 | `bizcity_master_data@2`: khuôn chung identity / codes / classification / changeClass; `partner_codes`, `branch_codes` (K1); mã ngoài theo nguồn; `core.partner.add-code` / `merge-preview`; ca CA-MD-02 / -03 | W2 |
| S024-20 | Hạng thay đổi + Impact + Gate A (hạng 3): action `core.<entity>.impact`, `core.<entity>.reclassify` (mô phỏng → duyệt → kích hoạt), chứng từ phân loại lại qua cửa nạp; sự kiện `bizcity.masterdata.*.changed` | W2–W3 |
| S024-21 | Tài khoản: phiên bản hệ thống tài khoản + bảng ánh xạ + chứng từ chuyển số dư (nối ADR-0013); báo cáo nhiều kỳ đọc qua ánh xạ — K2 | W3 (có thể tách phase riêng nếu đổi chế độ kế toán là việc lớn) |
| S024-22 | HT09 thành "Quy định dữ liệu danh mục"; thẻ khách hàng / chi nhánh cùng khuôn thẻ mặt hàng; hộp thoại "Thay đổi" tự xếp hạng | W4 |
