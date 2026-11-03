# 04 · Hướng dẫn cho AI agent
<!-- [2026-11-03 07:23 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — tài liệu cho AI: thứ tự đọc, luật cứng, cây quyết định, khi nào dừng, mẫu báo cáo, giới hạn của công cụ -->
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: khung 0–VIII; C2 theo main -->

> Dành cho Claude Code, Codex, Cursor, Copilot và mọi agent viết code nối vào open-ketoan. Người cũng đọc được. Mục tiêu: bạn **sinh mã tích hợp đúng hợp đồng**, **chạy lệnh kiểm thật**, **báo đúng điều đã kiểm và điều chưa kiểm**. Bạn **không** tự nghĩ tài khoản, bút toán, thuế suất, giá vốn.

## 1. Đọc theo thứ tự (dừng khi đủ cho việc đang làm)

1. [AGENTS.md](../../AGENTS.md), mục "Xây app ghi sổ" (và luật module nếu viết module).
2. [skills/open-ketoan-standard](../../skills/open-ketoan-standard/SKILL.md): sáu chuẩn C1…C6 và trạng thái thật của Kernel. **Luôn đọc.**
3. Skill theo việc (bảng ở §3).
4. [docs/core/01-tru-cot.md](01-tru-cot.md) nếu cần hiểu một lỗi thuộc trụ cột nào; [03](03-ma-hang-va-vong-doi.md) nếu đụng mã hàng.
5. Hợp đồng: [BIZCITY-LEDGER-INTAKE-v1.md](../contracts/BIZCITY-LEDGER-INTAKE-v1.md) và mẫu JSON `docs/api/vi-du/`.
6. Gặp mã lạ: `npx bizcity explain <MÃ>`. Đừng đoán nghĩa mã.

Cài skill vào dự án của người dùng: `npx bizcity skills install --to <thư mục dự án>` (chép vào `.claude/skills/` và `.agents/skills/`, ghi `.bizcity/ketoan.json`).

## 2. Luật cứng

Vi phạm một điều là sai thiết kế, dù mã chạy được.

| # | Luật | Vì sao |
|---|---|---|
| 1 | **Không** viết, sinh, đoán số tài khoản, thuế suất, công thức giá vốn, khấu hao | Kernel và gói định khoản của đơn vị quyết (ADR-0015, [RULE-POSTING](../rules/RULE-POSTING.md)) |
| 2 | Chỉ kể **sự việc đã xảy ra**: hàng đã đi, tiền đã đổi tay, hoá đơn đã phát hành. Báo giá, giỏ hàng, đơn chưa giao thì **không gửi** | Gửi sớm làm doanh thu và tồn sai |
| 3 | Mỗi nghiệp vụ **một hệ thống gửi** | Gửi từ hai nơi là ghi hai lần |
| 4 | `docKey` bắt đầu bằng mã nguồn gửi, ổn định; sửa = cùng `docKey`, `version + 1`; huỷ = `documents/cancel` có lý do | `IN-BIZ-003`…`005`, R-EVENT-13 |
| 5 | **Không đổi, không dùng lại** mã hàng, mã khách, mã thẻ tài sản đã có sổ; một mặt hàng một mã suốt đời | chưa có thao tác đổi mã (C2) |
| 6 | **Không** `UPDATE` / `DELETE` bảng sổ, không chạy SQL tay vào sổ, không tắt trigger, không đổi ngày chứng từ để né khoá kỳ | Sổ chỉ thêm (R-LEDGER-1) |
| 7 | **Không** tự gọi Tính giá vốn, kết chuyển, khoá kỳ | Việc của kế toán trên màn |
| 8 | **Không** giả lập nghiệp vụ Kernel chưa có bằng loại chứng từ khác (vd dùng `stock_adjustment` cho sản xuất) | Ghi nhầm tài khoản, giá vốn thành phẩm bằng 0 |
| 9 | Bị từ chối thì hiện **mã, thông báo, gợi ý, `requestId`**; lỗi `retryable: false` không thử lại | [BIZCITY-ERRORS](../contracts/BIZCITY-ERRORS-v1.md) |
| 10 | **SKIP không phải PASS**; không báo "đạt chuẩn" khi còn SKIP | Trung thực về bằng chứng |

## 3. Người dùng nói gì, làm gì

| Người dùng nói | Skill | Lệnh đầu tiên |
|---|---|---|
| "Nối POS / bán hàng online / CRM / kho / tài sản / ERP vào kế toán" | [build-business-app-with-open-ketoan](../../skills/build-business-app-with-open-ketoan/SKILL.md) (POS tại quầy: [build-pos-with-open-ketoan](../../skills/build-pos-with-open-ketoan/SKILL.md)) | Lập bảng "nghiệp vụ → docType", đọc `docs/api/vi-du/` |
| "Kiểm giúp chứng từ này", "sao bị từ chối" | [validate-accounting-event](../../skills/validate-accounting-event/SKILL.md) | `npx bizcity event check <tệp> [--json]` |
| "Mã lỗi này là gì" | [explain-accounting-error](../../skills/explain-accounting-error/SKILL.md) | `npx bizcity explain <MÃ>` |
| "Kho âm", "giá vốn 0", "lãi gộp sai", "trước khi đóng kỳ" | [check-accounting-flow](../../skills/check-accounting-flow/SKILL.md) | `npx bizcity flow check --sku <mã> --period YYYY-MM --to YYYY-MM` |
| "Tạo module / plugin mới" | [build-business-app-with-open-ketoan](../../skills/build-business-app-with-open-ketoan/SKILL.md), mục "Viết module mới" | `npx bizcity module new <key> --label "Tên"` |
| "Làm MRP / sản xuất" | [contribute-production-module](../../skills/contribute-production-module/SKILL.md) | **Dừng**, xem §4 |
| "Đã đạt chuẩn kế toán chưa" | [open-ketoan-standard](../../skills/open-ketoan-standard/SKILL.md) | Điền bảng §5 bằng lệnh thật |

## 4. Khi phải dừng và nói thật

Dừng **đúng phần đó**, làm tiếp phần còn lại, và nói với người dùng bằng một phương án đề xuất (không hỏi mở).

| Tình huống | Điều có thật | Nói gì |
|---|---|---|
| Cần FIFO / giá vốn đích danh | Hôm nay chỉ có bình quân gia quyền theo tháng. FIFO làm sau đổi mã an toàn | "Kernel chưa có FIFO. Em dùng bình quân tháng; không tự tính FIFO ở app vì sẽ có hai sổ giá vốn." |
| Cần đổi mã / gộp mã hàng đã có sổ | Chưa có `core.item.add-code` / `merge` | "Chưa đổi mã an toàn được. Em giữ mã cũ, app giữ bảng ánh xạ sang mã mới." |
| Cần ghi sản xuất, giá thành | Cổng chờ: `production_issue`, `production_receipt`, `production_cost_close` chưa thuộc hợp đồng | "Cổng sản xuất chưa mở. Em gửi `purchase` (NVL) và `sale` (thành phẩm); phần sản xuất kế toán ghi tay. Muốn mở cổng: skill contribute-production-module." |
| Cần một thứ Kernel không có (phí sàn, phí vận chuyển…) | Không có loại chứng từ riêng | "Em gửi làm chứng từ nguồn (`PUT /api/v1/reference-documents`) để kế toán hạch toán." |
| Không có máy chủ hoặc khoá API | `event check` chỉ kiểm khuôn + tổng; `flow check` SKIP | "Em mới kiểm được lớp L1 và L2. Còn bút toán thử và luồng cần máy chủ: lệnh là …" |
| Cần sửa Kernel, `packages/*`, `apps/*` hoặc module khác | Ngoài phạm vi | Soạn đề xuất theo [VERSIONING §5](../standard/VERSIONING.md); không tự vá Core |

## 5. Báo cáo cuối, mẫu bắt buộc

Điền bằng kết quả lệnh vừa chạy, không điền từ trí nhớ.

```text
Chuẩn   Trạng thái        Bằng chứng
C1      PASS|FAIL|SKIP    flow check --sku … --period … --to …
C2      SKIP              chưa có thao tác đổi mã; app giữ một mã một hàng: có / không
C3      PASS|FAIL|SKIP    event check L5 (bút toán thử)
C4      PASS|FAIL|SKIP    docKey / version / meta.receipt
C5      PASS|FAIL|SKIP    flow check C5 (bảng kiểm khoá kỳ)
C6      có / không        app hiện mã + gợi ý khi bị từ chối
Module  PASS|FAIL|SKIP    module accounting-check <key> (AC-1…AC-6)
```

Thiếu một dòng thì chưa được nói "đạt chuẩn". Ghi kèm **điều chưa chạy được** và lý do (ví dụ `npm ci` bị chặn, không có CSDL, chưa dựng contracts).

## 6. Giới hạn của công cụ (đã đo, đừng tin quá)

| Công cụ | Giới hạn |
|---|---|
| `selfcheck --module --strict` | Chỉ 15 luật về manifest, dữ liệu, bảo mật. Một module tự `UPDATE ledger_lines`, tự điền số tài khoản, tự tính giá vốn **vẫn ra ĐẠT**. Luôn chạy thêm `module accounting-check` |
| `module accounting-check` | Quét bằng biểu thức chính quy, có thể bỏ sót (số tài khoản dựng từ biến). Mục AC-4 SKIP khi chưa dựng `packages/contracts`. Không thay test hợp đồng trên CSDL |
| `event check` offline | Chỉ L1 (khuôn) và L2 (tổng). Chưa chứng minh được vào sổ |
| `flow check` | Đọc báo cáo của đơn vị; không tính lại số nào. C2 luôn SKIP |
| Mã tự chẩn đoán `INVENTORY_LEDGER_MISMATCH` | Mức cảnh báo, chưa chặn khoá kỳ; chưa chạy trên dữ liệu thật |
| CLI nói chung | Không giữ luật riêng: nạp hàm và danh mục từ bản dựng của repo. Thiếu bản dựng thì SKIP kèm lệnh dựng |

## 7. Mẫu yêu cầu người dùng có thể dán cho AI

```text
Nối app <tên> của tôi vào open-ketoan. Đọc skills/open-ketoan-standard trước.
Chỉ gửi chứng từ qua cửa nạp, không viết số tài khoản, không tự tính giá vốn.
Chạy event check tới PASS cho từng loại chứng từ, rồi flow check cho một mặt hàng.
Phần nào Kernel chưa có thì dừng và nói rõ. Báo kết quả theo bảng sáu chuẩn, ghi rõ chỗ nào SKIP.
```

```text
Tạo module <key> trong repo này. Đọc modules/<key>/AGENTS.md sau khi chạy module new.
Xong khi module check ĐẠT và module accounting-check không FAIL. Thêm examples/ cho mỗi loại chứng từ.
```
