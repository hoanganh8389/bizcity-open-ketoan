# IN-SHAPE-001 · Thiếu trường bắt buộc
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-SHAPE-001 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L1 · **Căn cứ:** R-EVENT-7, bizcity_ledger_intake@1

## Vì sao kế toán cần

Thiếu trường thì phần mềm không biết ghi sổ vào đâu, ngày nào, bao nhiêu — chứng từ không thành sự việc kế toán được.

## Ví dụ sai

```json
{ "docType": "sale", "docKey": "pos:CN01:HD1", "docNo": "HD1", "docDate": "2026-10-05" }
```

## Ví dụ đúng

```json
{ "docType": "sale", "docKey": "pos:CN01:HD1", "branchCode": "CN01", "docNo": "HD1", "docDate": "2026-10-05" }
```

Thiếu `branchCode`: không biết chứng từ của cửa hàng nào.

## Sửa ở đâu

Ở hệ thống nguồn: điền trường còn thiếu (xem "trường" trong thông báo) trước khi gửi.
