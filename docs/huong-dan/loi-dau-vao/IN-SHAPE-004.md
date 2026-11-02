# IN-SHAPE-004 · Loại chứng từ không có trong khuôn nạp
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-004 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** bizcity_ledger_intake@1 §2

## Vì sao kế toán cần

Loại chứng từ (docType) quyết định luật định khoản; loại lạ thì không có luật nào ghi sổ được.

## Ví dụ sai

```json
{ "docType": "ban-le" }
```

## Ví dụ đúng

```json
{ "docType": "sale" }
```

Chỉ các loại trong khuôn nạp có luật định khoản.

## Sửa ở đâu

Dùng một loại có sẵn (sale, purchase, customer_payment…); cần loại mới thì đề xuất với Nhóm Lõi.
