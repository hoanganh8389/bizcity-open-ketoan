# IN-BIZ-006 · Số hoá đơn đã có ở chứng từ khác
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-BIZ-006 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** Sổ hoá đơn, R-POST

## Vì sao kế toán cần

Một số hoá đơn chỉ thuộc một chứng từ; trùng thì có thể kê khai thuế hai lần.

## Ví dụ sai

```json
{ "invoice": { "no": "0000123" } } (0000123 đã thuộc HD0001)
```

## Ví dụ đúng

```json
{ "invoice": { "no": "0000124" } }
```

Một số hoá đơn chỉ thuộc một chứng từ.

## Sửa ở đâu

Kiểm số / ký hiệu hoá đơn; hoá đơn thay thế / điều chỉnh thì khai relation.
