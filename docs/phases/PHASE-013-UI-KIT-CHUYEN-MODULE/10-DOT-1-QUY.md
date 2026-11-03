# PHASE-013 · Đợt 1 — chuyển `quy` sang `modules/quy/` (chữ chốt)
<!-- [2026-11-04 12:14 AM Johnny Chu - Chu Hoàng Anh] PHASE-013 — chữ chốt đợt 1 quy: phân định lõi / phân hệ, tương thích đường dẫn, dữ liệu, cách đo (R-FLOW-2) -->

> **Việc:** S013-3 · **Căn cứ:** [ADR-0024](../../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md), [CHUYEN-PHAN-HE-SANG-MODULES](../../standard/CHUYEN-PHAN-HE-SANG-MODULES.md) · **Trạng thái:** chia 1a / 1b (chủ dự án chọn 2026-11-04); người thực hiện: nhân sự khác, chưa giữ chỗ.
> Đợt 1 là **đường thử đầu tiên**: chọn `quy` vì nhỏ (11 action, 4 tệp API, 5 tệp web). Bài học của đợt này ghi lại để đợt 2–6 dùng.

## 1. Hiện trạng (đã đọc mã, 2026-11-04)

- API: `apps/api/src/phan-he/quy/` — `index.ts`, `bizcity.module.json` (11 action `quy.payment-request*`), `payment-requests/payment-request.routes.ts`, `payment-request.workflow.yaml`. `index.ts` còn gắn thêm route phiếu thu / chi của Kernel (`LEDGER`, `voucherRoutes`) — **đó là lõi, không thuộc `quy`**.
- Web: `apps/web/src/phan-he/quy/{manifest.ts, menu.ts, routes.tsx, debts/PaymentRequestsPage.tsx, debts/paymentRequestPrint.tsx}`.
- Bảng `payment_requests`, `payment_request_settings` ở schema `public` (baseline `db/migrations/0005_goc_chung_tu.sql`). Sự việc `quy.payment-request.paid`; loại chứng từ `quy.payment-request`; khoá dãy số `payment_request`.
- **Chỗ lõi / phân hệ khác chạm vào `quy`** (phải xử lý trước khi chuyển):

| Nơi | Chạm gì | Vấn đề |
|---|---|---|
| `packages/kernel/src/modules/periods/period.routes.ts:122` | `SELECT … FROM payment_requests` cho phép kiểm khoá kỳ (`paymentRequests`) | Kernel đọc bảng của phân hệ; bảng chuyển sang `mod_quy` thì Kernel gãy |
| `apps/api/src/modules/dimensions/contract-schedule.routes.ts:38,88` | nghe `quy.payment-request.paid`; đọc `payment_requests` | `ke-toan` đọc bảng `quy` (phân hệ ↔ phân hệ) |
| `apps/web/src/features/catalog/ContractSchedulesPage.tsx` | hiện số yêu cầu thanh toán trả từ API trên | chỉ đổi theo API |
| `apps/web/src/printCatalog.ts:21` | import `PAYMENT_REQUEST_TEMPLATES` từ `phan-he/quy` | lõi web import phân hệ |
| `apps/api/src/modules/system/schema-catalog.ts:99-100` | mô tả hai bảng | đổi tên bảng thì cập nhật |
| Kernel `numbering.ts` | giữ khoá dãy `payment_request` | giữ nguyên khoá (số đã cấp không đổi) |

## 2. Phân định lõi / phân hệ

**Vào `modules/quy/`:** 11 action `quy.payment-request*`, workflow, hai bảng, sự việc `quy.payment-request.paid`, trang web yêu cầu thanh toán và mẫu in.
**Ở lại lõi (không chuyển trong đợt này):** route phiếu thu / chi Kernel (`LEDGER`, `voucherRoutes`) — thuộc `apps/api/src/modules/*` / Kernel, đã có chủ; chỉ gỡ khỏi `quy/index.ts`, giữ nguyên nơi đăng ký ở lõi.
**Hai điểm đọc chéo được thay bằng cổng, không đọc bảng:**
1. Phép kiểm kỳ (`paymentRequests`): module khai báo một **bộ cung cấp kiểm kỳ** (đếm + tổng tiền yêu cầu chưa chi) qua điểm mở rộng của Kernel; Kernel gọi cổng, không `SELECT` bảng. Nếu Core chưa có điểm mở rộng này → **dừng phần này, làm đề xuất bậc 4** (VERSIONING §5), không vá Kernel trong PR phân hệ (AGENTS: "Tạo module mới" bước 6). Phương án tạm trong lúc chờ: bảng giữ ở `public`, chuyển mã trước, chuyển dữ liệu sau (xem §4).
2. `ke-toan` lịch hợp đồng: đọc trạng thái yêu cầu qua **action đọc** của `quy` (`quy.payment-request.list`) hoặc chỉ dựa vào sự việc `…paid` đã có, không `SELECT` bảng.

## 3. Tương thích đường dẫn (Q3 — mặc định đề xuất)

Host module chỉ gắn ở `/api/v1/m/<key>/…` (`apps/api/src/app.ts:222`); không có cơ chế đường dẫn cũ. Đề xuất cho **mọi đợt**:
- Đường mới `/api/v1/m/quy/payment-requests…` là chính thức. Đường cũ `/api/v1/payment-requests…` giữ bằng **một lớp chuyển tiếp mỏng ở lõi** (`apps/api/src/core/legacy-routes.ts`, bảng `cũ → mới`, mã 308, giữ nguyên phương thức và thân), có **ngày hết hạn** ghi trong bảng, mỗi lượt gọi đường cũ ghi một dòng `bizcity.legacy-route.hit` để biết ai còn gọi.
- Lớp chuyển tiếp là **thứ dùng chung** (R-FLOW §3) → chốt ở PR tài liệu này; mã của nó vào PR code đợt 1 và đợt sau chỉ thêm dòng vào bảng.
- Hết hạn mặc định: 2 phiên bản nhỏ sau (khoảng 60 ngày). Hệ thống nguồn ngoài được thông báo ở CHANGELOG và `docs/api/`.
- Tên action `quy.payment-request.*`, mã lỗi, quyền: **không đổi** (MCP và AI đang dùng).

## 4. Dữ liệu

- Hai bảng sang schema `mod_quy` bằng **một migration mới** (số lấy bằng `node scripts/so-tiep-theo.mjs migration` lúc tạo; không sửa 0005). Dữ liệu cũ **di chuyển, không sao chép** (`ALTER TABLE … SET SCHEMA`), giữ khoá, chỉ mục, RLS cô lập đơn vị (0041); `COMMENT ON` đủ.
- Bảng liên quan tới sổ nên là mức **K2+**: PR code phải có bằng chứng `scripts/doi-chieu-ke-toan.sql` trước / sau trên đơn vị sạch (nợ phải trả 331, `ledger_*` không đổi một dòng) và kiểm tra số đếm hai bảng bằng nhau.
- Chỉ chạy bước chuyển bảng khi §2 điểm 1 đã xong; chưa xong thì PR code chia hai: (a) chuyển mã, bảng ở `public`; (b) chuyển bảng sau khi cổng kiểm kỳ vào `main`.
- Không `UPDATE` / `DELETE` `ledger_*`; không có bút toán sinh thêm: chuyển chỗ đặt không phải sự việc kế toán.

## 5. Cách đo trước / sau (tiêu chí xong)

| Phép đo | Trước | Sau (phải) |
|---|---|---|
| `selfcheck --module modules/quy` | chưa có | ĐẠT |
| SC-MOD-1 vi phạm của `quy` | số đo lúc nhận việc, ghi vào PR | 0 |
| `apps/api/src/phan-he/quy`, `apps/web/src/phan-he/quy` | tồn tại | không còn |
| Test `payment-requests.test.ts` + các test chạm yêu cầu thanh toán | đạt | đạt, gọi qua đường mới; thêm 1 test đường cũ → 308 |
| `selfcheck --strict`, `kiem-chuan.sh`, `typecheck`, `npm test` | đạt | đạt, nợ baseline không tăng |
| Bảng điểm sẵn sàng / conformance | 77.2 / 98.7 | không giảm |

## 6. Chia đợt 1a / 1b và bàn giao
<!-- [2026-11-04 12:28 AM Johnny Chu - Chu Hoàng Anh] PHASE-013 — chia đợt 1a/1b, quy giao nhân sự khác -->

| | 1a — chuyển mã | 1b — chuyển bảng |
|---|---|---|
| Làm gì | 11 action, workflow, web, mẫu in sang `modules/quy/`; bảng còn ở `public`; gỡ `import` của lõi web (`printCatalog.ts`); `ke-toan` đọc qua action `quy` | `payment_requests`, `payment_request_settings` → `mod_quy` bằng migration mới; mục kiểm kỳ do `quy` cung cấp |
| Chờ gì | ADR-0025 (PR riêng, `docs/adr/ADR-0025-cong-kiem-ky-va-chuyen-tiep-duong-dan-cu.md`) mục B (lớp 308) vào `main` nếu muốn bỏ đường cũ; không chờ mục A | ADR-0025 mục A làm xong (`period.check.contributor`) |
| Bằng chứng | §5, trừ dòng "bảng ở `mod_quy`" | §4: đối chiếu `doi-chieu-ke-toan.sql` trước / sau, số đếm bảng bằng nhau |

**Bàn giao:** `quy` do nhân sự khác thực hiện. Người nhận (1) đọc [CHUYEN-PHAN-HE-SANG-MODULES](../../standard/CHUYEN-PHAN-HE-SANG-MODULES.md), (2) `node scripts/nhan-viec.mjs` rồi mở PR chỉ-tài-liệu thêm dòng giữ chỗ cho `S013-3` (phạm vi: `apps/api/src/phan-he/quy/**`, `apps/web/src/phan-he/quy/**`, `modules/quy/**`, `apps/api/test/payment-requests.test.ts`), (3) làm theo §2–§5; không tự vá Kernel (mục A / B là việc Nhóm Lõi). Dòng giữ chỗ của phiên Claude đã gỡ khỏi CLAIMS.md.
