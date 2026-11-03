# ADR-0025 · Cổng đóng góp bảng kiểm khoá kỳ và lớp chuyển tiếp đường dẫn cũ (đề xuất bậc 4)
<!-- [2026-11-04 12:21 AM Johnny Chu - Chu Hoàng Anh] ADR-0025 — cổng đóng góp bảng kiểm khoá kỳ và lớp chuyển tiếp đường dẫn cũ (đề xuất) -->

- Trạng thái: **Đề xuất** — chờ chủ dự án quyết (R-FLOW §3: đụng thứ dùng chung thì chốt thiết kế bằng PR tài liệu vào `main` trước PR code).
- Ngày: 2026-11-04 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức: **K2** (Kernel đọc dữ liệu phân hệ; đường dẫn công khai của API)
- Phát sinh từ: bước 0 đợt 1 chuyển `quy` sang `modules/quy/` ([ADR-0024](ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md), việc S013-3, PR chữ chốt đợt 1).
- Quy trình: đề xuất năng lực theo [VERSIONING §5](../standard/VERSIONING.md); chưa viết mã.

## Bối cảnh

Đo trên `main` ngày 2026-11-04, hai chỗ làm đợt 1 không thể chuyển sạch:

1. **Kernel đọc bảng của phân hệ.** `packages/kernel/src/modules/periods/period.routes.ts:122` chạy `SELECT … FROM payment_requests` để dựng mục `paymentRequests` của bảng kiểm khoá kỳ (`GET /api/v1/periods/check`). Bảng thuộc `quy`; khi chuyển sang schema `mod_quy` (chuẩn module), truy vấn này gãy. Đây cũng là một chỗ Kernel phụ thuộc phân hệ ngược chiều (R-BOUND).
2. **Host module chỉ có một tiền tố.** `apps/api/src/app.ts:222` gắn route module ở `/api/v1/m/<key>`. Phân hệ chuyển đi mất đường cũ (`/api/v1/payment-requests…`, về sau `/api/v1/purchase…`); hệ thống nguồn ngoài, MCP, tài liệu `docs/api/` đang dùng đường cũ.

Không có điểm mở rộng nào hiện có cho (1) (`grep` trong Kernel không thấy), và không có cơ chế cho (2).

## Quyết định đề xuất

### A. Cổng đóng góp mục kiểm kỳ (`period.check.contributor`)

- Module khai trong `bizcity.module.json` một **mục kiểm kỳ**: `{ key, label, remedy (mã thư viện phát hiện, R-GATE-10), link }`, kèm một **action đọc** `<module>.period-check` (`sideEffects: read`) nhận `{ from, to }` và trả `{ count, amount?, detail? }`.
- `GET /api/v1/periods/check` gọi các action đó (theo module đang bật cho đơn vị), nối kết quả vào danh sách cùng khuôn mục hiện có. Module tắt hoặc action lỗi → mục hiện **cảnh báo "không kiểm được"** (không im lặng bỏ qua, không trả 0 mặc định — R-REV-13).
- Kernel hết `SELECT` bảng phân hệ; mục `paymentRequests` chuyển thành mục do `quy` cung cấp, **giữ nguyên khoá `paymentRequests`, nhãn và phương án khắc phục** để giao diện và `SC-FIX-1` không đổi.
- Năng lực mới: `period.check.contributor` (`planned` → `available` khi làm xong); Standard **minor**; hợp đồng `bizcity_module@1` thêm trường tuỳ chọn (tương thích VER-1).
- Cổng chỉ **báo**, không chặn khoá kỳ; chặn vẫn là `integrity` (R-DIAG-4).

### B. Lớp chuyển tiếp đường dẫn cũ ở lõi (`legacy-routes`)

- Một tệp lõi `apps/api/src/core/legacy-routes.ts` giữ bảng `{ cũ, mới, hết hạn }`. Gọi đường cũ → **308** tới đường mới (giữ phương thức, thân, `Idempotency-Key`); mỗi lượt ghi sự kiện đo `bizcity.legacy-route.hit` (không ghi dữ liệu người dùng).
- Hạn mặc định **60 ngày** từ ngày PR chuyển merge; hết hạn → `410` kèm mã lỗi chỉ đường mới. Mỗi đợt chỉ **thêm dòng** vào bảng.
- Không đổi tên action, mã lỗi, quyền (MCP và AI không bị ảnh hưởng).

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Giữ `payment_requests` ở `public`, module vẫn đọc ghi | Phá chuẩn module (dữ liệu ở `mod_<key>`); đợt sau không có đường để đi |
| Đưa `payment_requests` vào Kernel | Kéo nghiệp vụ phân hệ vào lõi; ngược `ADR-0024` |
| Sự kiện đếm sẵn (Kernel giữ bảng đếm theo `outbox`) | Thêm bảng, thêm đường ghi, dễ lệch; bảng kiểm cần số tức thời |
| Bỏ đường cũ ngay, báo hệ thống nguồn | Gãy người dùng ngoài; không đo được ai còn gọi |
| Mỗi module tự đăng ký alias route | Mỗi nơi một kiểu; khó đặt hạn và đo |

## Điều kiện Core nhận (R-KER-8)

- Hiện **một** phân hệ cần (A) là `quy`; đây là nợ ranh giới có thật nên đề nghị ngoại lệ, và cổng dùng lại cho `mua-hang` (chứng từ chờ), `kho`, `tai-san` ở các đợt sau. Nếu chủ dự án muốn chờ đủ hai phân hệ: `quy` giữ phần dữ liệu ở `public` (đợt 1a: chuyển mã) cho tới khi có cổng.
- Không thêm phụ thuộc. Không trùng [REUSE-MAP](../standard/REUSE-MAP.md) (kiểm tra: không có mục "kiểm kỳ do module đóng góp").

## Hệ quả

- Làm xong (A): đợt 1b (chuyển bảng sang `mod_quy`) mở được; `ke-toan` lịch hợp đồng tự đổi sang action đọc / sự việc `quy.payment-request.paid` trong cùng đợt.
- Làm xong (B): mọi đợt chuyển phân hệ dùng chung một cơ chế, có số đo ai còn gọi đường cũ.
- Việc cần làm sau khi chốt: ghi vào CLAIMS.md (phạm vi `packages/kernel/src/modules/periods/**`, `apps/api/src/core/legacy-routes.ts`, `packages/module-sdk/**`, `docs/contracts/BIZCITY-MODULE-v1*`, `docs/standard/bizcity-standard.json`), PR code riêng, mức K2 có dấu R-SIG.

## Cần chủ dự án quyết

1. Chấp nhận cổng A với ngoại lệ "một phân hệ" hay chờ đủ hai?
2. Chấp nhận B (308 + hạn 60 ngày + đo `bizcity.legacy-route.hit`)?

## Đã quyết (2026-11-04)

- **Thứ tự: chia đợt 1a / 1b** (chủ dự án chọn). 1a chuyển mã `quy` sang `modules/quy/`, bảng còn ở `public`; 1b chuyển bảng sang `mod_quy` sau khi cổng A vào `main`. A và B là việc Nhóm Lõi, chạy song song với 1a.
- **Phân hệ `quy` do nhân sự khác thực hiện**, không phải phiên Claude của Nhóm Lõi. Người nhận tự giữ chỗ ở CLAIMS.md theo R-FLOW-1.
