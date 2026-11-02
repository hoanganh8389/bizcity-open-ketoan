# IN-SUM-003 · Thuế dòng khác tiền trước thuế × thuế suất
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-003 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L2 · **Căn cứ:** R-POST, danh mục loại thuế

## Vì sao kế toán cần

Thuế dòng lệch thuế suất thì có thể sai mã thuế hoặc tính tay; cơ quan thuế đối chiếu theo thuế suất.

## Ví dụ sai

```json
{ "taxCode": "R08", "amountBeforeTax": 180000, "taxAmount": 20000 }
```

## Ví dụ đúng

```json
{ "taxCode": "R08", "amountBeforeTax": 180000, "taxAmount": 14400 }
```

180.000 × 8% = 14.400.

## Sửa ở đâu

Kiểm mã thuế suất của dòng và cách làm tròn thuế (làm tròn theo dòng hay theo hoá đơn).
