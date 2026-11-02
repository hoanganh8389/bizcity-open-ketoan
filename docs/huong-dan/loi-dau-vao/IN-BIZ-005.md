# IN-BIZ-005 · Cùng phiên bản nhưng nội dung khác bản đã nhận
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-BIZ-005 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** R-EVENT-4

## Vì sao kế toán cần

Cửa nạp coi cùng phiên bản là "không đổi" và bỏ qua — nội dung sửa sẽ KHÔNG vào sổ.

## Ví dụ sai

```json
{ "docKey": "pos:CN01:HD1", "version": 1, "description": "đã sửa" } (version 1 đã nhận, nội dung khác)
```

## Ví dụ đúng

```json
{ "docKey": "pos:CN01:HD1", "version": 2, "description": "đã sửa" }
```

Cùng version thì cửa nạp bỏ qua — phần sửa không vào sổ.

## Sửa ở đâu

Sửa chứng từ thì tăng version; gửi lại đúng nội dung cũ thì không sao.
