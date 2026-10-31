# RULE · Rà soát việc của người đóng góp (R-REV)
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — luật rà soát việc của người đóng góp: phân vai, quy trình PR, biên bản, dữ liệu kế toán, mã hàng, công cụ ra-soat-dong-gop.mjs. -->

> **Cấp:** Tier 0 (R-REV-1, -5, -6, -7) · Tier 1 (còn lại) · **Phiên bản:** 1.0 · 2026-10-31 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Công cụ:** [`scripts/ra-soat-dong-gop.mjs`](../../scripts/ra-soat-dong-gop.mjs) · **Biên bản:** `docs/audits/REVIEW-<ngày>-<người>.md`

## 1. Phân vai

| Vai | Ai | Làm gì |
|---|---|---|
| **Người đóng góp** | thành viên phát triển phân hệ (vd Nguyễn Văn Thủy) | tính năng phân hệ, sửa lỗi, giao diện / trải nghiệm: `apps/api/src/phan-he/*` (lớp D), `apps/web`, `docs/huong-dan`, dữ liệu mẫu của phân hệ |
| **Nhóm Lõi** | chủ dự án Johnny Chu – Chu Hoàng Anh + agent làm theo chỉ đạo | framework: Kernel, Platform, danh mục chuẩn, hợp đồng, luật, bộ kiểm; **rà soát** việc của người đóng góp theo luật này |

Nhóm Lõi không viết thay tính năng phân hệ, mà bảo đảm phần người đóng góp làm **đúng kiến trúc, đúng chuẩn, không để lại lỗi hay rủi ro, và dữ liệu kế toán đúng**. *"Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán."*

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-REV-1** | Người đóng góp làm trên nhánh riêng và mở PR vào `main`. **Không đẩy thẳng `main`.** Chủ dự án bật bảo vệ nhánh `main` (cần PR, CI xanh R-QG-1, một người duyệt) | `scripts/ra-soat-dong-gop.mjs` (H-DIRECT-MAIN) |
| **R-REV-2** | Phạm vi người đóng góp là lớp D / U, `apps/web`, hướng dẫn, dữ liệu mẫu. Đụng tệp framework ([RULE-SIGNATURE §3](RULE-SIGNATURE.md)) — Kernel, Platform, `packages/contracts`, migration, `scripts/`, `tests/conformance`, luật / hợp đồng — thì **chủ dự án duyệt trước khi merge**, có dấu R-SIG (người đóng góp ký tên mình, chủ ký dấu duyệt). Danh mục chuẩn (lớp M: `modules/catalog`, mặt hàng, ĐVT, đối tượng…) dù không phải tệp framework cũng phải qua Nhóm Lõi rà | `scripts/ra-soat-dong-gop.mjs` (H-FRAMEWORK, H-MASTERDATA), SC-SIG-1 |
| **R-REV-3** | Mỗi PR của người đóng góp, hoặc mỗi lần kéo việc của họ từ `main` về, chạy rà soát lượt đầu: `node scripts/ra-soat-dong-gop.mjs --range <từ>..<đến> --author "<tên>" --out docs/audits/REVIEW-<ngày>-<người>.md` | `scripts/ra-soat-dong-gop.mjs` |
| **R-REV-4** | Biên bản rà soát đủ sáu phần: (1) lượt đầu tự động, từng phát hiện có kết luận *đúng / dương tính giả / đã sửa*; (2) `selfcheck --strict`; (3) typecheck + `npm test` (số qua / lỗi); (4) diagnostics DG-* trên CSDL test có dữ liệu của tính năng; (5) dữ liệu và mã (§5); (6) kết luận **ĐẠT / ĐẠT có điều kiện / KHÔNG ĐẠT** kèm việc cần làm, người nhận | `docs/audits/REVIEW-2026-10-31-THUY.md` |
| **R-REV-5** | Phát hiện mức **chặn** (§4) thì không nhận vào nhánh làm việc của Nhóm Lõi, không phát hành, cho tới khi sửa. Nhóm Lõi **không âm thầm sửa** việc của người đóng góp: ghi việc vào biên bản và báo người đóng góp. Lỗi chặn khẩn thì sửa ngay, ghi rõ trong biên bản và commit | biên bản |
| **R-REV-6** | **Dữ liệu kế toán:** tính năng đụng định khoản, sổ, công nợ, kho, giá vốn, thuế (rủi ro R2+) phải: so bút toán trước / sau trên bộ tình huống của phân hệ (vd 25 trường hợp mua hàng); diagnostics DG-* không lỗi (sổ cân, công nợ mở = số dư 131 / 331 theo đối tượng, sổ hoá đơn = phát sinh thuế, tài khoản trung gian về 0); đổi định khoản ghi mục "Thay đổi định khoản" ở `CHANGELOG.md` | `scripts/doi-chieu-ke-toan.sql`, lane diagnostics `tests/conformance`, `apps/api/test/mua-hang-25-tinh-huong.test.ts` |
| **R-REV-7** | **Mã hàng** theo `SKU_RULE` ([`modules/catalog/sku-rule.ts`](../../apps/api/src/modules/catalog/sku-rule.ts)), chi tiết ở §5. Mã mới **chỉ** sinh qua `nextSku`, không tự ghép ở phân hệ hay giao diện. Mã đã phát sinh không đổi, không xoá (R-MD-4). Dữ liệu mẫu / seed / kịch bản phải đúng quy tắc | `apps/api/test/sinh-ma-hang.test.ts`, `scripts/ra-soat-dong-gop.mjs` (H-SKU, H-SKU-DATA) |
| **R-REV-8** | **Mã danh mục khác** (chi nhánh, đối tượng, chính sách, hình thức thanh toán, kho): chữ hoa, không dấu, gạch nối; ổn định; `UNIQUE (tenant_id, code)`; tham chiếu bằng mã, không bằng `id` (R-MD-2, R-MD-3). Không tạo bảng danh mục riêng (R-MD-1) | `scripts/ra-soat-dong-gop.mjs` (H-MD-TABLE), `db-rules.test.ts` |
| **R-REV-9** | Phân mức rủi ro trong biên bản: **R0** chỉ giao diện · **R1** nghiệp vụ phân hệ, không chạm sổ · **R2** chạm sổ, dữ liệu kế toán, danh mục, ĐVT, giá · **R3** framework. R2+ bắt buộc R-REV-6; R3 bắt buộc R-REV-2 | biên bản |
| **R-REV-10** | Lỗi gặp hai lần thì thành luật: thêm luật dò H-* vào `scripts/ra-soat-dong-gop.mjs` hoặc check SC-* / DG-*, kèm ca tự kiểm. Không chỉ sửa một lần | `tests/conformance/README.md` §7 |

## 3. Quy trình mỗi lần nhận việc

1. Đồng bộ: AGENTS.md "Trước khi code" (`git fetch`, `merge --ff-only origin/main`…).
2. Chạy lượt đầu (R-REV-3) cho đúng các commit của người đóng góp. Kết luận từng phát hiện.
3. Chạy `node tests/conformance/selfcheck.mjs --strict`, `npm run typecheck`, `npm test` trên mã **đã gộp**.
4. R2+: nạp bộ tình huống của phân hệ vào một đơn vị trên CSDL test, chạy diagnostics, so sổ (R-REV-6).
5. Kiểm dữ liệu và mã (§5).
6. Ghi biên bản `docs/audits/REVIEW-<ngày>-<người>.md`, báo người đóng góp các việc cần sửa.

## 4. Luật dò lượt đầu (H-*)

Chạy trên **dòng thêm** của từng commit. Đây là gợi ý, người rà phải xác nhận từng dòng.

| Mã | Mức | Dò gì | Luật gốc |
|---|---|---|---|
| H-LEDGER | chặn | ghi thẳng bảng `ledger_*` | câu 2, R-LEDGER |
| H-LEDGERSVC | chặn | phân hệ gọi `ledgerService` | câu 3 |
| H-KERNEL-IMPORT | chặn | phân hệ import thẳng mô-đun Kernel | SC-KERNEL-6 |
| H-CROSS-MODULE | chặn | phân hệ import phân hệ khác | R-BOUND |
| H-ACCOUNT-LITERAL | chặn | số tài khoản viết trong mã định khoản | câu 4, R-POST-2 |
| H-REPLY | chặn | `reply.status()` | R-API |
| H-SKIP | chặn | `it.only` / `.skip` mới | R-QG-8 |
| H-SECRET | chặn | chuỗi giống bí mật | R-SEC |
| H-MD-TABLE | chặn | migration tạo bảng khách / hàng / chi nhánh / đối tượng riêng | R-MD-1 |
| H-SEQ | cảnh báo | phân hệ tự đếm `document_sequences` | STD-DOC-6 |
| H-STATUS | cảnh báo | đổi trạng thái bằng UPDATE viết cứng | R-WF-1 |
| H-MONEY | cảnh báo | tiền tính bằng `parseFloat` / `toFixed` | quy ước tiền |
| H-FETCH | cảnh báo | gọi HTTP ra ngoài từ API | R-OUTBOX |
| H-ROUTE-PERM | cảnh báo | route ghi mới không khai quyền | R-TEN, SC-ACT-1 |
| H-SKU | cảnh báo | tự ghép mã hàng ngoài `sku-rule.ts` | R-REV-7 |
| H-SKU-DATA | cảnh báo | mã hàng trong JSON / CSV sai quy tắc | R-REV-7 |
| H-UNIT | cảnh báo | hệ số quy đổi ĐVT viết cứng (≥ 2) | R-REV-7 |
| H-DIRECT-MAIN | cảnh báo | commit đẩy thẳng nhánh đích | R-REV-1 |
| H-FRAMEWORK | cảnh báo | người đóng góp sửa tệp framework | R-REV-2 |
| H-MASTERDATA | cảnh báo | người đóng góp sửa danh mục chuẩn (lớp M) | R-REV-2, R-MD |
| H-NO-TEST | cảnh báo | đổi logic API / contracts mà không có test | R-QG-2 |
| H-MIGRATION | ghi chú | có migration mới: rà `COMMENT ON`, `numeric(18,2)`, RLS | R-DB |

## 5. Chuẩn dữ liệu và mã

**Mã hàng (`SKU_RULE`):** mã hàng = mã SKU nhóm cấp 1 + cấp 2 + cấp 3 + số thứ tự.

| Đoạn | Độ dài | Nghĩa | Ví dụ `110063101` |
|---|---|---|---|
| cấp 1 | 2 | ngành (quà khuyến mại: `Q`) | `11` Sữa bột |
| cấp 2 | 3 | nhãn | `006` ABBOTT |
| cấp 3 | 1 | nhóm sản phẩm | `3` Sữa công thức trẻ em |
| số thứ tự | 3 (quà: 4) | lớn nhất cùng tiền tố + 1 | `101` |

- Đuôi biến thể chữ hoa (K / M / Q / T, đuôi riêng Z, B) được lưu, nhưng không làm lệch số tự sinh.
- Mã gõ tay khác quy tắc vẫn lưu được (dữ liệu cũ). Rà soát phải báo danh sách các mã này.
- Đổi quy tắc chỉ ở `SKU_RULE`.

**Đơn vị tính:** ĐVT tồn kho = ĐVT nhỏ nhất, tỉ lệ 1. Quy đổi (thùng, lốc…) khai ở `product_units`, không viết cứng.

**Tiền và giá:**
- Tiền lưu `numeric(18,2)`, cộng trừ qua `toCents` / `fromCents`.
- Đơn giá được có số lẻ. Thành tiền và thuế làm tròn đồng, làm tròn **một** chỗ.

**Câu hỏi rà dữ liệu:**
- Mã nào sai quy tắc?
- Mã nào trùng sau khi bỏ khoảng trắng hay đổi chữ hoa / thường?
- Mặt hàng nào thiếu ĐVT tỉ lệ 1?
- Bút toán của bộ tình huống có đổi so với lần trước không?
- Diagnostics DG-* có lỗi không?
