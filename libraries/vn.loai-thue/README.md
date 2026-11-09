# Thư viện `vn.loai-thue` — Loại thuế GTGT
<!-- [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52: hướng dẫn thư viện loại thuế GTGT -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `code-list` · Người duyệt nội dung: kế toán thuế.

## Dùng làm gì

Mỗi mục là **một loại thuế GTGT**: mã (`R10`…), tên, `group` = chiều (đầu ra / đầu vào), `payload.rate` (thuế suất %), `payload.direction` (`output` / `input`), `payload.reportGroup` (nhóm trên bảng kê: `KCT`, `KKK`, `0`, `5`, `8`, `10`). Dùng để chọn loại thuế trên phiếu và để kiểm mã thuế nhập từ ngoài: mã lạ → `LIB-UNKNOWN-001`.

```http
GET  /api/v1/libraries/vn.loai-thue/items?group=đầu ra
POST /api/v1/libraries/vn.loai-thue/validate  { "input": "R10" }
```

**Không có số tài khoản.** Tài khoản thuế (33311, 1331…) lấy từ chính sách hạch toán qua `AccountResolver`, không từ thư viện này; thuế suất ở đây là dữ liệu tham chiếu để đối chiếu, không phải luật tính thuế của Kernel.

## Trạng thái

**Chưa duyệt, chưa đối chiếu văn bản.** Nguồn là danh mục mẫu của công ty (`db/seeds/loai-thue.jsonl`, chép vào `sources/`; cột `account_code` bị bỏ). Thuế suất chưa có ngày hiệu lực và chưa liên kết căn cứ (`vn.can-cu-phap-ly`); khi đối chiếu, chuyển `rate` sang giá trị theo ngày và gắn `basis[].key` (vd `LUAT-GTGT`).

## Cập nhật

1. Sửa `sources/loai-thue.jsonl` (giữ dòng tiêu đề).
2. `node libraries/vn.loai-thue/build.mjs`. Không sửa tay `library.json`.
3. Loại thuế hết dùng: không xoá dòng; đặt `is_active: false`.
4. `npx bizcity library diff vn.loai-thue` và `node tests/conformance/selfcheck.mjs --only SC-LIB` phải ĐẠT.
