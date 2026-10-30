# RULE · Luồng nghiệp vụ (R-WF)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Khuôn + danh mục luồng:** [../workflows/README.md](../workflows/README.md)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-WF-1** | Mỗi phiếu nghiệp vụ của phân hệ có **máy trạng thái khai báo** (danh sách trạng thái, chuyển hợp lệ, quyền cho từng chuyển). Không đổi trạng thái bằng `UPDATE` tuỳ ý ngoài hàm chuyển | Test luồng của phân hệ |
| **R-WF-2** | Trạng thái chuẩn: `draft` → `submitted` → `approved` (1 hoặc 2 cấp) → `done` / `cancelled`. Phân hệ được thêm trạng thái giữa nhưng phải ánh xạ về một trạng thái chuẩn | Khai báo luồng |
| **R-WF-3** | **Chỉ chuyển sang `approved`** (hoặc trạng thái nguồn tương đương "đã duyệt") mới nộp sự việc; bỏ duyệt / huỷ → nộp yêu cầu huỷ (R-EVENT-8). Phiếu nháp không bao giờ có bút toán | `mua-hang.test.ts`, `payment-requests.test.ts` |
| **R-WF-4** | Sửa phiếu đã duyệt = **phiên bản mới** của cùng `docKey`; không tạo `docKey` mới | R-EVENT-3 |
| **R-WF-5** | Mỗi luồng khai trong `docs/workflows/` gồm: tác nhân, trạng thái, sự việc phát ra (`docType`), bút toán tiêu biểu, báo cáo đối chiếu | Tài liệu |
| **R-WF-6** | Duyệt nhiều cấp theo ngưỡng là cấu hình (registry), không viết cứng số tiền | `payment_request_settings` |
| **R-WF-7** | Mỗi chuyển trạng thái ghi người làm, thời điểm, lý do (khi từ chối / huỷ) | Nhật ký của phân hệ hoặc `audit_logs` |
| **R-WF-8** | Luồng xuyên phân hệ (đặt hàng → nhập kho → thanh toán) nối bằng **khoá tham chiếu** trên sự việc (`originalDocKey`, `invoiceDocKey`, `sourceRef`), không bằng gọi hàm chéo phân hệ | R-BOUND-1 |
| **R-WF-9** | Ký xác nhận trên phiếu (`document_signatures`) gắn với **phiên bản**; phiên bản mới cần ký lại | `signatures.test.ts` |
