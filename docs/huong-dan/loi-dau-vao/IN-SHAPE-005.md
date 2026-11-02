# IN-SHAPE-005 · Quá độ dài / quá số lượng cho phép
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-005 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** R-EVENT-7

## Vì sao kế toán cần

Giới hạn độ dài giữ sổ, báo cáo, hoá đơn in ra đọc được và đúng khuôn của cơ quan thuế.

## Ví dụ sai

```json
{ "docNo": "HD-000000…(70 ký tự)" }
```

## Ví dụ đúng

```json
{ "docNo": "HD000123" }
```

Số chứng từ tối đa 64 ký tự.

## Sửa ở đâu

Rút gọn trường (tên, diễn giải) hoặc tách chứng từ quá nhiều dòng.
