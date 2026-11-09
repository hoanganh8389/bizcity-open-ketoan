# IN-POL-001 · Tham chiếu chính sách không có trong sổ đăng ký hoặc băm khác bản đã phát hành
<!-- [2026-11-07 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a: trang bài học IN-POL-001 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** ADR-0031 D-POL-5, D-POL-6

## Vì sao kế toán cần

Chứng từ nói đã áp một chính sách, nhưng sổ đăng ký không có bản đó hoặc nội dung bản đã khác lúc nguồn tải. Không truy vết được chứng từ về đúng chính sách căn cứ.

## Ví dụ sai

```json
{ "docKey": "wp-pos:HN01:HD88123", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 3, "hash": "0000…0000" }] }  (băm không phải của bản 3)
```

## Ví dụ đúng

```json
{ "docKey": "wp-pos:HN01:HD88123", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 3, "hash": "<băm của bản 3 lấy từ chính sách đã phát hành>" }] }
```

## Sửa ở đâu

Ở nguồn: tải lại chính sách đã phát hành, tính lại theo bản đó rồi gửi lại đúng mã, bản và băm; chính sách tự lập ở nguồn thì đưa về module chủ để phát hành.
