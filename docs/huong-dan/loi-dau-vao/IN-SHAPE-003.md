# IN-SHAPE-003 · Ngày không đúng định dạng YYYY-MM-DD
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-003 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** R-EVENT-7

## Vì sao kế toán cần

Ngày chứng từ quyết định kỳ kế toán; định dạng lạ dễ nhầm ngày / tháng, ghi sai kỳ.

## Ví dụ sai

```json
{ "docDate": "05/10/2026" }
```

## Ví dụ đúng

```json
{ "docDate": "2026-10-05" }
```

05/10 có thể là 5 tháng 10 hoặc 10 tháng 5 — dạng năm-tháng-ngày không nhầm được.

## Sửa ở đâu

Gửi ngày dạng năm-tháng-ngày, vd 2026-10-05.
