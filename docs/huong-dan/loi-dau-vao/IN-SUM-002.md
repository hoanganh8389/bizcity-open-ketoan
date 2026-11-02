# IN-SUM-002 · Phân bổ thanh toán lớn hơn số tiền phiếu
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-002 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L2 · **Căn cứ:** R-EVENT-5, assertTotals

## Vì sao kế toán cần

Không thể trừ công nợ nhiều hơn số tiền thực thu / thực trả.

## Ví dụ sai

```json
{ "docType": "customer_payment", "lines": [{ "lineKey": "a1", "amount": 90000 }], "totals": { "total": 50000 } }
```

## Ví dụ đúng

```json
{ "docType": "customer_payment", "lines": [{ "lineKey": "a1", "amount": 50000 }], "totals": { "total": 50000 } }
```

Thu 50.000 thì chỉ trừ công nợ tối đa 50.000.

## Sửa ở đâu

Giảm số phân bổ cho các hoá đơn, hoặc kiểm lại số tiền phiếu.
