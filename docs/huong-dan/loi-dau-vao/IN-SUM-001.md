# IN-SUM-001 · Tổng các dòng khác tổng chứng từ
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-001 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L2 · **Căn cứ:** R-EVENT-5, assertTotals

## Vì sao kế toán cần

Sổ ghi theo dòng, hoá đơn in theo tổng — lệch nhau thì sổ và hoá đơn không khớp, đối chiếu thuế sai.

## Ví dụ sai

```json
{ "lines": [{ "amountBeforeTax": 185185 }], "totals": { "beforeTax": 100000 } }
```

## Ví dụ đúng

```json
{ "lines": [{ "amountBeforeTax": 185185 }], "totals": { "beforeTax": 185185 } }
```

Tổng trước thuế phải bằng cộng các dòng.

## Sửa ở đâu

Ở hệ thống nguồn: tổng chứng từ phải bằng cộng các dòng tới đồng; kiểm cách làm tròn từng dòng.
