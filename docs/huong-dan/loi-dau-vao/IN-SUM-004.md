# IN-SUM-004 · Đơn giá × số lượng − chiết khấu khác thành tiền dòng
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SUM-004 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L2 · **Căn cứ:** R-EVENT-5

## Vì sao kế toán cần

Thành tiền lệch đơn giá thì giá vốn, lãi gộp, đối chiếu với đơn hàng sẽ khó giải thích.

## Ví dụ sai

```json
{ "unitPrice": 50000, "qty": 2, "discount": 0, "amountBeforeTax": 90000 }
```

## Ví dụ đúng

```json
{ "unitPrice": 50000, "qty": 2, "discount": 10000, "amountBeforeTax": 90000 }
```

Thành tiền 90.000 = 50.000 × 2 − chiết khấu 10.000: phải gửi kèm chiết khấu.

## Sửa ở đâu

Kiểm đơn giá, số lượng, chiết khấu của dòng ở hệ thống nguồn.
