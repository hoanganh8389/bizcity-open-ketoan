# IN-SHAPE-006 · Giá trị ngoài danh sách cho phép
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-006 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** R-EVENT-7

## Vì sao kế toán cần

Trường chỉ nhận một số giá trị (vd trạng thái hoá đơn); giá trị lạ thì không biết xử lý thế nào.

## Ví dụ sai

```json
{ "invoice": { "status": "ok" } }
```

## Ví dụ đúng

```json
{ "invoice": { "status": "valid" } }
```

Trạng thái hoá đơn chỉ nhận valid, replaced, adjusted, cancelled.

## Sửa ở đâu

Dùng đúng một giá trị trong danh sách nêu ở "mong đợi".
