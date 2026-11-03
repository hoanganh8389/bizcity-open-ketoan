---
name: build-business-app-with-open-ketoan
description: Thiết kế và viết phần tích hợp sổ kế toán cho mọi loại app nghiệp vụ dùng open-ketoan làm lõi — bán hàng online / sàn, CRM, mua hàng, kho vật tư, MRP / sản xuất, quản lý tài sản và công cụ dụng cụ, ERP — sao cho đạt sáu chuẩn kế toán. Dùng khi người dùng muốn xây hoặc nối CRM, MRP, ERP, app kho, app tài sản, app bán online vào kế toán ("CRM ghi công nợ", "MRP tính giá vốn", "quản lý vật tư", "accounting integration"). POS tại quầy có skill riêng build-pos-with-open-ketoan.
---

<!-- [2026-11-03 04:30 PM Johnny Chu - Chu Hoàng Anh] G3-01 — skill chung cho mọi loại app: nghiệp vụ nào thành chứng từ, lúc nào, chuẩn nào dễ vỡ, chỗ Kernel chưa có -->

# Xây app nghiệp vụ trên lõi open-ketoan

**Đọc trước:** skill [open-ketoan-standard](../open-ketoan-standard/SKILL.md) — sáu chuẩn C1…C6 và trạng thái thật của Kernel. Skill này chỉ nói mỗi loại app áp sáu chuẩn đó thế nào.

## Câu hỏi đầu tiên: lúc nào một việc trong app thành chứng từ?

Chỉ khi có **sự kiện kinh tế đã xảy ra**: hàng đã đi, tiền đã đổi tay, hoá đơn đã phát hành, tài sản đã nhận. Đơn chưa giao, báo giá, cơ hội bán, giỏ hàng, lệnh sản xuất mới lập: **không** gửi sang sổ. Gửi sớm làm doanh thu và tồn kho sai, gửi rồi huỷ hàng loạt làm sổ đầy bút toán đảo.

Mỗi nghiệp vụ chỉ có **một hệ thống gửi**. ERP và POS cùng gửi một hoá đơn bán là sổ ghi hai lần.

## Bản đồ theo loại app

| App | Nghiệp vụ → chứng từ | Chuẩn dễ vỡ nhất | Chưa có trong Kernel |
|---|---|---|---|
| **Bán hàng online, sàn** | Giao thành công / xuất hoá đơn → `sale`; COD thu sau → `customer_payment`; hoàn hàng → `sale_return` có `originalDocKey`; đơn huỷ trước giao → không gửi | C1 (bán trước khi có phiếu nhập kho), C4 (một đơn sàn đổi trạng thái nhiều lần → `version + 1`, không docKey mới) | Phí sàn, phí vận chuyển: không có loại chứng từ riêng — gửi làm chứng từ nguồn (`PUT /api/v1/reference-documents`) cho kế toán hạch toán |
| **CRM** | Khách hàng → đồng bộ đối tượng `PUT /api/v1/partners/:code`; thu nợ → `customer_payment` phân bổ vào hoá đơn; hợp đồng → chứng từ nguồn. Cơ hội, báo giá, đơn chưa giao → **không gửi** | C4 (mã khách đổi giữa CRM và sổ), C6 | — CRM đọc công nợ thật: `GET /api/v1/partners/:code/balances`, `GET /api/v1/debt-items` — không tự cộng công nợ trong CRM |
| **Mua hàng, kho, vật tư** | Nhận hàng NCC → `purchase` (kèm hoá đơn đầu vào); trả NCC → `purchase_return`; chuyển kho → `transfer` (xuất rồi nhận); kiểm kê lệch → `stock_adjustment` có lý do; trả tiền NCC → `supplier_payment` | C1 (tồn âm vì nhập trễ), C2 (mã NCC ≠ mã mình: ánh xạ ở app, gửi mã mình) | Xuất vật tư dùng nội bộ: cần lý do có tài khoản chi phí do kế toán khai ở ACC18; app không tự chọn |
| **MRP, sản xuất** | Mua nguyên vật liệu → `purchase`; bán thành phẩm → `sale` | C1, C3 | ☐ **Cổng sản xuất giữ chỗ, chưa mở** (quyết định chủ dự án 2026-11-03): xuất nguyên vật liệu cho sản xuất, nhập kho thành phẩm, tính giá thành chưa có. **Không** lách bằng `stock_adjustment`: Kernel ghi vào tài khoản thừa / thiếu chờ xử lý, sai bản chất và làm giá vốn thành phẩm bằng 0. Dừng phần đó, báo người dùng; ai muốn mở cổng đọc skill [contribute-production-module](../contribute-production-module/SKILL.md). |
| **Tài sản, công cụ dụng cụ** | Khai thẻ `POST /api/v1/assets` (quyền `catalog:write`); điều chuyển, kiểm kê → `POST /api/v1/assets/:code/events`; khấu hao, phân bổ do kế toán chạy (ACC31) | C5 (app tự tính khấu hao), C2 (mã thẻ đổi) | Ghi tăng tài sản từ hoá đơn mua: hỏi kế toán quy trình của đơn vị (`docs/huong-dan/tai-san.md`), không tự định khoản |
| **POS tại quầy** | xem skill [build-pos-with-open-ketoan](../build-pos-with-open-ketoan/SKILL.md) | | |
| **ERP** | Ghép các dòng trên; khai rõ hệ thống nào gửi `docType` nào | C4 (gửi trùng từ hai phân hệ) | như các dòng trên |

## Quy trình làm, 4 bước

1. **Hợp đồng.** Liệt kê nghiệp vụ của app → `docType` theo bảng trên. Đọc trang `docs/api/<loại>.md` và JSON mẫu `docs/api/vi-du/`. Gặp ô "Chưa có trong Kernel" mà người dùng cần: dừng phần đó, nói rõ, làm phần còn lại.
2. **Danh mục.** Đọc mã thật (`GET /api/v1/branches`, `/tax-codes`, `/posting/payment-methods`, `/posting/reasons`, `/products`, `/partners`), lưu bảng ánh xạ trong app. Chuẩn C2: một mặt hàng một mã gửi sang sổ, suốt đời.
3. **Code + kiểm.** Hàm thuần `toDocument(sựViệc) → chứng từ` cho mỗi loại, có test. Mỗi loại có một tệp mẫu chạy `npx bizcity event check <tệp>` tới PASS (skill [validate-accounting-event](../validate-accounting-event/SKILL.md)). Lỗi xử lý theo mã (skill [explain-accounting-error](../explain-accounting-error/SKILL.md)).
4. **Luồng + báo cáo.** Sau khi nộp một chuỗi thật (nhập → bán → trả), chạy `npx bizcity flow check --sku <mã> --period YYYY-MM --to YYYY-MM` (vòng đời qua các kỳ) (skill [check-accounting-flow](../check-accounting-flow/SKILL.md)). Điền bảng sáu chuẩn ở cuối skill open-ketoan-standard.

## Viết module mới (plugin) trong repo này

<!-- [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — small win cho module mới: scaffold → check kế toán → chứng từ mẫu -->
Module trong `modules/<key>/` (không phải app bên ngoài) đi theo khung trụ cột 0–VIII ([tru-cot.json](../../docs/standard/tru-cot.json), trụ cột VIII: mở rộng bằng module, kiểm chuẩn tự động; [PHASE-027 §4](../../docs/phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md)) <!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — khung 0–VIII -->. Small win theo thứ tự:

1. `npx bizcity module new <key> --label "Tên" --code XX` (dưới một phút, đã chạy thật).
2. `npx bizcity module check <key>`: `selfcheck --module` + `accounting-check --static` + typecheck + test hợp đồng.
3. Module gửi chứng từ vào sổ: đặt `examples/<tên>.json` (mẫu: `docs/api/vi-du/`), chạy `npx bizcity module accounting-check <key>` với máy chủ để thấy **bút toán Kernel dựng**.
4. Gửi thật một chuỗi (nhập → bán → trả), rồi `npx bizcity flow check --sku <mã> --period YYYY-MM --to YYYY-MM`.

`accounting-check` bắt: đụng bảng `ledger_*` / `inventory_*` (AC-1), số tài khoản viết cứng (AC-2, trừ module `ke-toan`), tự điền giá vốn (AC-3, cảnh báo), `docType` ngoài hợp đồng hoặc của cổng chờ (AC-4), `docKey` không ổn định hoặc thiếu tiền tố module (AC-5), chứng từ mẫu bị từ chối (AC-6). Quét tĩnh bằng biểu thức chính quy, có thể bỏ sót; test hợp đồng trên CSDL vẫn là lớp chặn cuối.

## Không làm

- Không viết số tài khoản, thuế suất, công thức giá vốn, khấu hao, phân bổ trong app.
- Không gửi một nghiệp vụ từ hai hệ thống, không gửi nghiệp vụ chưa xảy ra.
- Không đổi mã hàng, mã khách, mã thẻ tài sản đã có dòng sổ.
- Không giả lập nghiệp vụ Kernel chưa có bằng loại chứng từ khác.
- Không gọi tính giá vốn, kết chuyển, khoá kỳ từ app: đó là việc của kế toán trên màn.
