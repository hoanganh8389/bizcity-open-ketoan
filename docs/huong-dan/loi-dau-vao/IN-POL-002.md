# IN-POL-002 · Bản chính sách không hiệu lực tại ngày chứng từ
<!-- [2026-11-07 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a: trang bài học IN-POL-002 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** ADR-0031 D-POL-0, R-ECP

## Vì sao kế toán cần

Chính sách chọn theo ngày chứng từ. Bản được nêu chưa áp hoặc đã hết áp vào ngày đó, nên chứng từ đang dùng luật không đúng thời điểm.

## Ví dụ sai

```json
{ "docDate": "2026-11-05", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 3, … }] }  (bản 3 áp từ 10/11)
```

## Ví dụ đúng

```json
{ "docDate": "2026-11-15", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 3, … }] }
```

## Sửa ở đâu

Ở nguồn: dùng bản hiệu lực tại ngày chứng từ; nếu ngày chứng từ sai thì sửa ngày rồi gửi bản mới (tăng version).
