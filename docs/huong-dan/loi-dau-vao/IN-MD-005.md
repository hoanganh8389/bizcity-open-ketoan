# IN-MD-005 · Mã số thuế đối tượng sai định dạng
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-MD-005 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L3 · **Căn cứ:** R-MD

## Vì sao kế toán cần

Mã số thuế sai thì hoá đơn, bảng kê và tra cứu doanh nghiệp đều sai; cơ quan thuế loại hoá đơn.

## Ví dụ sai

```json
{ "partner": { "taxCode": "0123 456 789" } }
```

## Ví dụ đúng

```json
{ "partner": { "taxCode": "0123456789" } }
```

MST 10 chữ số liền, hoặc 10 chữ số-3 chữ số cho chi nhánh.

## Sửa ở đâu

Mã số thuế gồm 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số (chi nhánh); không khoảng trắng.
