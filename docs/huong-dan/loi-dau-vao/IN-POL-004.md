# IN-POL-004 · Quà tính lại theo chính sách khác quà nguồn gửi
<!-- [2026-11-09 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b: trang bài học IN-POL-004 (R-INTAKE-11) -->

> **Mức:** Cảnh báo — vào sổ được, nên sửa · **Giai đoạn:** cửa nạp vẫn nhận · **Lớp:** L4 · **Căn cứ:** ADR-0031 D-POL-8

## Vì sao kế toán cần

Tính lại theo đúng bản chính sách nguồn nêu, trên các dòng bán, ra số quà khác dòng quà nguồn gửi (thiếu quà, thừa quà hoặc lệch số lượng). Số liệu khuyến mại của chứng từ có thể không đúng chính sách đã phát hành.

Phần mềm tính theo **bản nguồn đã nêu**, không phải bản hiện hành: chứng từ ngày cũ nêu bản cũ vẫn được tính đúng theo bản cũ. Chỉ so các dòng quà mang đúng mã của chính sách đó; quà của chính sách khác hoặc quà tay không bị so.

## Ví dụ sai

Chính sách *mua 1 SUA01 tặng 1 QUA01* (bản 1). Chứng từ bán 1 SUA01, nguồn gửi quà tặng 3:

```json
{ "policyRefs": [{ "key": "RC-QUA", "version": 1, … }],
  "lines": [ { "sku": "SUA01", "qty": 1 }, { "sku": "QUA01", "qty": 3, "isGift": true, "policyRef": { "key": "RC-QUA", "version": 1, "line": "gift" } } ] }
```

Cảnh báo: `QUA01: nguồn 3` ↔ `QUA01: tính lại 1 (theo RC-QUA@1)`. Bán đủ điều kiện mà **không gửi dòng quà** cũng bị báo (nguồn bỏ quên).

## Ví dụ đúng

```json
{ "lines": [ { "sku": "SUA01", "qty": 1 }, { "sku": "QUA01", "qty": 1, "isGift": true, "policyRef": { "key": "RC-QUA", "version": 1, "line": "gift" } } ] }
```

## Sửa ở đâu

Ở nguồn: tính lại bằng đúng bản chính sách đã nêu (luật đã tải, hoặc `POST /api/v1/policies/evaluate`) rồi gửi lại dòng quà theo kết quả. Quà đã giao đúng thực tế mà chính sách chưa phản ánh: kế toán trưởng chấp nhận cảnh báo, ghi lý do. Không xoá dòng quà đã giao thật chỉ để khớp kết quả tính lại.
