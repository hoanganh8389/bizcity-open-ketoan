# IN-GUARD-001 — Cấu hình vừa đổi sau lần Kiểm thử, chạy lại còn lỗi chặn
<!-- [2026-11-03 09:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: bài học mã IN-GUARD-001 (Commit Guard, R-INTAKE-11) -->

**Bước:** Commit Guard (sau L5) · **Mức:** chặn · **Cổng:** B (trạm tiền kiểm) · **Luật:** [R-GATE-8](../../rules/RULE-GATE.md), [ADR-0019](../../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)

## Chuyện gì xảy ra

Hệ thống nguồn đã **Kiểm thử** chứng từ (`POST /api/v1/intake/preflight`) và nhận về một **dấu cấu hình** (`guard`), rồi nộp chứng từ kèm dấu đó. Lúc nộp, phần cấu hình chứng từ dựa vào đã đổi. Đó có thể là mặt hàng trên dòng, chi nhánh, đối tượng, phiên bản chính sách kế toán, hoặc khoá / mở kỳ. Cửa nạp chạy lại tiền kiểm theo cấu hình mới và thấy chứng từ **không còn đạt**.

Các lỗi chặn đi kèm trong thông báo (ví dụ `IN-ITEM-009` khi mặt hàng vừa bị chuyển về nháp) là nguyên nhân cụ thể.

## Vì sao không ghi sổ

Kết quả Kiểm thử chỉ đúng với cấu hình lúc kiểm. Ghi sổ theo kết quả cũ thì bút toán sẽ lệch với danh mục và chính sách đang hiệu lực. Phần mềm giữ chứng từ ở **Trạm kiểm tra đầu vào**, ghi rõ lý do "cấu hình vừa đổi".

## Sửa thế nào

1. Xem các lỗi chặn đi kèm và sửa theo bài học của từng mã. Có thể sửa ở danh mục (kích hoạt lại mặt hàng…) hoặc ở hệ thống nguồn.
2. **Kiểm thử lại** để lấy dấu mới, rồi nộp lại với dấu mới.

Nếu cấu hình đổi nhưng chạy lại vẫn đạt, cửa nạp nhận bình thường và **không** báo mã này. Không gửi dấu thì cửa nạp chạy như cũ.

## Ví dụ

```http
POST /api/v1/documents
X-Preflight-Guard: g1:4f2a0c…
```

Với `core.document.submit`, dấu đi trong thân: `{ "document": { … }, "guard": "g1:4f2a0c…" }`.
