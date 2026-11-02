# IN-MD-004 · Mã hàng chưa có trong danh mục
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: trang bài học IN-MD-004 (R-INTAKE-11) -->

> **Mức:** Gợi ý — chỉ để học · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L3 · **Căn cứ:** R-MD

## Vì sao kế toán cần

Mặt hàng mới chưa có nhóm hạch toán thì doanh thu, giá vốn theo mặc định — kế toán nên gắn nhóm sớm.

## Ví dụ sai

```json
{ "sku": "SP-MOI-001" }
```

## Ví dụ đúng

```json
{ "sku": "SUA01" }
```

Mã hàng mới vẫn ghi sổ được, nhưng nên đồng bộ danh mục và gắn nhóm hạch toán trước.

## Sửa ở đâu

Đồng bộ danh mục mặt hàng trước (PUT /api/v1/products) hoặc nhờ kế toán thêm và gắn nhóm hạch toán.
