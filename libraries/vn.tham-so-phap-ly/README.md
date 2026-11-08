# Thư viện `vn.tham-so-phap-ly` — Tham số pháp lý Việt Nam
<!-- [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): hướng dẫn thư viện tham số pháp lý -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `param` · Người duyệt nội dung: kế toán trưởng (S030-12).

## Dùng làm gì

120 tham số theo ngày hiệu lực, chia 9 nhóm: `lao-dong` · `thue-tndn` · `bao-hiem` · `thue-tncn` · `thue-gtgt` · `luong` · `ke-toan` · `tai-san` · `khac`. Ví dụ: lương cơ sở, lương tối thiểu 4 vùng, tỷ lệ BHXH / BHYT / BHTN, biểu thuế TNCN, tỷ lệ thuế nhà thầu, giới hạn làm thêm giờ.

- **Đọc tại ngày** (giá trị của khoảng có `from ≤ at ≤ to`) và **kiểm ô nhập** (`LIB-VALUE-001` kèm giá trị đúng khi nhập khác thư viện):

```http
GET  /api/v1/libraries/vn.tham-so-phap-ly/items?at=2026-03-01&q=LUONG_CO_SO
POST /api/v1/libraries/vn.tham-so-phap-ly/validate   { "input": { "code": "LUONG_CO_SO", "value": 2340000 }, "at": "2026-03-01" }
```

- `payload.kind`: `law` áp như nhau mọi đơn vị; `policy` (2 tham số: `GIO_LAM_VIEC_NGAY`, `TUYEN_DUNG_LUU_HO_SO_THANG`) là mặc định, đơn vị được ghi đè ở cấu hình.
- `payload.valueType`: `percent` là phần trăm (có thể trên 100: làm thêm 150, 200, 300), `money` là đồng, `number` là số (tháng, ngày, giờ, lần).

Thứ tự đọc một tham số khi nối vào cấu hình (đợt B): giá trị đơn vị ghi đè → thư viện tại ngày → mặc định registry (ADR-0032 D-LIB-8).

## Trạng thái

**Mọi mục `verified: false`.** Giá trị và căn cứ lấy nguyên từ tệp chủ dự án xuất từ Erp-vn ngày 07/11/2026 (`lfood-legal-params` v1); chưa đối chiếu văn bản gốc. Giao diện hiện nhãn "chưa duyệt"; bộ kiểm trả `LIB-UNVERIFIED-001` (mức nhắc). Chưa dùng để tính lương / thuế cho tới khi kế toán trưởng xác nhận từng nhóm.

## Cập nhật

1. Thay tệp trong `sources/` (giữ định dạng `lfood-legal-params` v1) hoặc sửa luật chuyển trong `build.mjs`.
2. `node libraries/vn.tham-so-phap-ly/build.mjs` — nội dung đổi thì tự lên phiên bản minor và thêm dòng changelog.
3. Không sửa tay `library.json` (SC-LIB-1 chạy lại script và so). Không xoá tham số: đổi `status` sang `deprecated` kèm `replacedBy`.
4. Xác nhận một mục sau khi đối chiếu: đặt `verified: true` cho mục và căn cứ trong luật chuyển, ghi người xác nhận vào changelog.
