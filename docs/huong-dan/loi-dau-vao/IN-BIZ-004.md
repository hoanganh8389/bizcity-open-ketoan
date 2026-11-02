# IN-BIZ-004 · Phiên bản cũ hơn bản đã nhận
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-BIZ-004 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L4 · **Căn cứ:** R-EVENT-4

## Vì sao kế toán cần

Sổ đang theo phiên bản mới hơn; nhận bản cũ sẽ ghi đè thông tin mới bằng thông tin cũ.

## Ví dụ sai

```json
{ "docKey": "pos:CN01:HD1", "version": 1 } (đã nhận version 2)
```

## Ví dụ đúng

```json
{ "docKey": "pos:CN01:HD1", "version": 3 }
```

Sửa chứng từ thì tăng version, không gửi lại bản cũ.

## Sửa ở đâu

Gửi phiên bản lớn hơn phiên bản đã nhận; sửa chứng từ thì tăng version.
