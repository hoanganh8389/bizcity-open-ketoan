# IN-MD-001 · Chi nhánh (mã cửa hàng) chưa có
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-MD-001 (R-INTAKE-11) -->

> **Mức:** Chặn — phải sửa · **Giai đoạn:** cửa nạp từ chối, chưa thành sự việc · **Lớp:** L3 · **Căn cứ:** R-MD, findBranch

## Vì sao kế toán cần

Sổ, kho, báo cáo theo chi nhánh; mã lạ thì không biết ghi cho cửa hàng nào.

## Ví dụ sai

```json
{ "branchCode": "SHOP-MOI" }
```

## Ví dụ đúng

```json
{ "branchCode": "CN01" }
```

Mã cửa hàng phải có trong Danh mục chi nhánh (DM02), hoặc khai ở ô "Mã tham chiếu ở hệ thống nguồn".

## Sửa ở đâu

Dùng mã chi nhánh đã khai ở Danh mục chi nhánh, hoặc nhờ kế toán thêm chi nhánh trước.
