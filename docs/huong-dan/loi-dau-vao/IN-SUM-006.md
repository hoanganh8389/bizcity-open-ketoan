# IN-SUM-006 · Tổng thuế khác cộng thuế các dòng
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-006 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L2 · **Căn cứ:** R-EVENT-5, assertTotals

## Vì sao kế toán cần

Thuế GTGT kê khai lấy theo dòng; tổng thuế lệch thì bảng kê bán ra / mua vào không khớp tờ khai.

## Ví dụ sai

```json
{ "lines": [{ "taxAmount": 14815 }], "totals": { "tax": 10000 } }
```

## Ví dụ đúng

```json
{ "lines": [{ "taxAmount": 14815 }], "totals": { "tax": 14815 } }
```

Tổng thuế phải bằng cộng thuế các dòng.

## Sửa ở đâu

Tổng thuế phải bằng cộng thuế từng dòng tới đồng.
