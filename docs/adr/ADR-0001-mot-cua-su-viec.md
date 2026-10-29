# ADR-0001 · Mọi đầu vào tài chính đi một cửa sự việc

- Trạng thái: Chấp nhận
- Ngày: 2026-10-28
- Luật / hợp đồng liên quan: R-EVENT-1, R-EVENT-2, R-LEDGER-4, `bizcity_ledger_intake@1`

## Bối cảnh

Lõi cần là nền cho nhiều phân hệ (bán, mua, kho, quỹ, tài sản, nhân sự) và plugin ngoài. Nếu mỗi bên tự ghi bút toán, không ai bảo đảm được chống trùng, phiên bản, đảo đúng, khoá kỳ và truy vết. Hiện plugin và phân hệ Mua hàng đã đi qua `postDocumentIn`, nhưng bốn module lõi (phiếu tay, kết chuyển, khấu hao, giá vốn) tự viết chuỗi tương đương.

## Quyết định

1. Mọi thứ có ảnh hưởng tài chính trở thành một dòng `accounting_events` có `doc_key` bất biến và `version` tăng dần.
2. Có đúng hai cửa: `postDocumentIn()` cho sự việc có khuôn `bizcity_ledger_intake@1`; `eventStore.commit()` cho sự việc lõi tự sinh (khuôn riêng trong `payload`).
3. Chỉ hai cửa này (qua `postingService`) được gọi `ledgerService.post/reverse`.
4. Phân hệ có thể có bảng nghiệp vụ riêng (phiếu nháp, chính sách) nhưng chạm sổ chỉ bằng cách nộp sự việc ở trạng thái đã duyệt.

## Hệ quả

- Được: một chỗ chống trùng, một chỗ đảo, một nhật ký `posting_log`, một màn ACC14 thấy mọi thứ; phân hệ mới không cần hiểu sổ cái.
- Mất: phân hệ không thể "ghi nhanh" một bút toán; loại nghiệp vụ mới phải qua PR lõi (`docType` + luật).
- Việc: Giai đoạn 1.1–1.3 trong [../framework/05-LO-TRINH.md](../framework/05-LO-TRINH.md).

## Phương án đã cân nhắc

- *Cho phân hệ gọi thẳng `ledgerService`*: nhanh nhưng mất phiên bản, mất xem trước, mất chống trùng — loại.
- *Event sourcing đầy đủ (sổ dựng lại từ luồng sự kiện)*: đúng tinh thần nhưng sổ cái chỉ thêm đã là nguồn sự thật đủ mạnh, lại cần cho báo cáo nhanh; giữ mô hình "sự việc + sổ chỉ thêm".
