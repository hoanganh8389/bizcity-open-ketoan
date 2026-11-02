# IN-SHAPE-002 · Sai kiểu dữ liệu
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-002 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** R-EVENT-7

## Vì sao kế toán cần

Số tiền, số lượng phải là số; mã phải là chữ. Sai kiểu thì không cộng trừ, đối chiếu được.

## Ví dụ sai

```json
{ "qty": "mot", "amountBeforeTax": "185.185" }
```

## Ví dụ đúng

```json
{ "qty": 1, "amountBeforeTax": 185185 }
```

Số lượng, số tiền phải là số; không viết chữ, không dấu chấm phân cách hàng nghìn.

## Sửa ở đâu

Gửi đúng kiểu: số không có dấu phân cách hàng nghìn, không kèm đơn vị tiền; mã là chuỗi.
