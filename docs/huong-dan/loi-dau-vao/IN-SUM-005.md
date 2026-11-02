# IN-SUM-005 · Tổng thanh toán khác tiền trước thuế + thuế
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-005 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L2 · **Căn cứ:** R-EVENT-5, assertTotals

## Vì sao kế toán cần

Tổng tiền khách trả phải đúng bằng tiền hàng cộng thuế, nếu không doanh thu hoặc thuế phải nộp sẽ sai.

## Ví dụ sai

```json
{ "totals": { "beforeTax": 185185, "tax": 14815, "total": 210000 } }
```

## Ví dụ đúng

```json
{ "totals": { "beforeTax": 185185, "tax": 14815, "total": 200000 } }
```

185.185 + 14.815 = 200.000.

## Sửa ở đâu

Tính lại tổng = trước thuế + thuế ở hệ thống nguồn.
