# PHASE-018 · Bản mẫu dashboard
<!-- [2026-10-31 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-018 — bản mẫu dashboard giám sát đích (S018-3). -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[dashboard.html](dashboard.html) là **bản mẫu tĩnh** của các dashboard đích ([20-KIEN-TRUC §3](../20-KIEN-TRUC.md)), để duyệt bố cục và nội dung **trước khi** viết JSON Grafana ở W3. Mở thẳng bằng trình duyệt, không cần máy chủ, không tải thư viện ngoài.

- **Số liệu giả lập** (sinh tất định từ hạt giống), không phải số đo thật.
- Số đo có dấu ✱ là số đo **đề xuất**, chưa có trong `apps/api/src/core/metrics.ts`.
- Dưới mỗi panel ghi số đo / truy vấn nguồn, để W3 chuyển thẳng sang panel Grafana.
- Mở thẳng một màn: `dashboard.html#ops`, `#kernel`, `#events`, `#integrity`, `#tenants`, `#ceo`.

| Màn | Ứng với | Trả lời câu hỏi |
|---|---|---|
| 01 Tổng quan Ops | dashboard 01 (nâng) | dịch vụ có khoẻ không |
| 04 Kernel kế toán | dashboard 04 (nâng) | ghi sổ có trễ / lỗi không; từ chối nghiệp vụ tách khỏi lỗi kỹ thuật |
| 07 Đường sự kiện | dashboard 07 (mới) | outbox có dồn / chết không; gửi lặp |
| 09 Toàn vẹn sổ | dashboard 09 (mới) | đối soát gần nhất, có quá hạn không; "chưa thu" khác 0 |
| 08 Đa đơn vị | dashboard 08 (mới) | phân bố tải theo dải, không lộ đơn vị nào |
| Widget CEO | W7 (trong app / Cell) | bốn chỉ số cho người quản trị, có `asOf` / dữ liệu cũ |

Khi W3 làm xong JSON Grafana: chụp ảnh dashboard thật với dữ liệu demo, đặt cạnh bản mẫu trong `evidence/W3-<ngày>.md` (ca T018-4).
