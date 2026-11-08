# IN-POL-003 · Đã có bản chính sách mới hơn hiệu lực tại ngày chứng từ
<!-- [2026-11-07 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a: trang bài học IN-POL-003 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** ADR-0031 D-POL-9

## Vì sao kế toán cần

Nguồn (thường là máy bán hàng làm việc ngoại tuyến) đang dùng bản cũ trong khi sổ đăng ký đã có bản mới phủ ngày chứng từ. Số liệu có thể lệch so với chính sách hiện hành.

## Ví dụ sai

```json
{ "docDate": "2026-11-16", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 2, … }] }  (bản 3 đã áp từ 10/11)
```

## Ví dụ đúng

```json
{ "docDate": "2026-11-16", "policyRefs": [{ "key": "SALE-PROMO-001", "version": 3, … }] }
```

## Sửa ở đâu

Ở nguồn: làm mới chính sách đã phát hành rồi tính lại; chứng từ đã lập đúng bản nguồn có thì kế toán trưởng chấp nhận cảnh báo kèm lý do.
