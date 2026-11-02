# IN-BIZ-007 · Ngày hoá đơn cách ngày chứng từ hơn 5 ngày
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-BIZ-007 (R-INTAKE-11) -->

> **Mức:** Gợi ý — chỉ để học · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** Sổ hoá đơn

## Vì sao kế toán cần

Hoá đơn lập xa ngày giao hàng / thu tiền có thể sai thời điểm lập hoá đơn theo quy định.

## Ví dụ sai

```json
{ "docDate": "2026-10-05", "invoice": { "date": "2026-10-20" } }
```

## Ví dụ đúng

```json
{ "docDate": "2026-10-05", "invoice": { "date": "2026-10-05" } }
```

Hoá đơn lập đúng thời điểm giao hàng / thu tiền.

## Sửa ở đâu

Kiểm ngày hoá đơn và ngày chứng từ ở hệ thống nguồn.
