# IN-BIZ-003 · Mã chứng từ không thuộc nguồn gửi
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-BIZ-003 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L4 · **Căn cứ:** ADR-0011 D5, R-EVENT-13

## Vì sao kế toán cần

Mỗi nguồn (module, app) chỉ được nộp / sửa chứng từ của mình, để không ghi đè chứng từ của nơi khác.

## Ví dụ sai

```json
{ "docKey": "pos:CN01:HD1" } (gửi bằng khoá của app pos-mini)
```

## Ví dụ đúng

```json
{ "docKey": "pos-mini:CN01:HD1" }
```

Mỗi nguồn chỉ nộp chứng từ mang tiền tố của mình.

## Sửa ở đâu

Mã chứng từ (docKey) phải bắt đầu bằng mã của nguồn, vd "pos-mini:CN01:HD0001".
