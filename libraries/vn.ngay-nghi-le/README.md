# Thư viện `vn.ngay-nghi-le` — Ngày nghỉ lễ, Tết
<!-- [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): hướng dẫn thư viện ngày nghỉ lễ -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `calendar` · Người duyệt nội dung: kế toán trưởng / nhân sự.

## Dùng làm gì

Mỗi mục là **một ngày nghỉ**: mã là ngày (`2026-02-16`), nhóm là năm, `payload.kind` là `le-tet` (ngày lễ, Tết theo Bộ luật Lao động 2019 Điều 112) hoặc `nghi-bu`. Dùng để đếm ngày làm việc: hạn thanh toán, chấm công, hạn nộp hồ sơ (K-030-10).

```http
GET  /api/v1/libraries/vn.ngay-nghi-le/items?group=2026          các ngày nghỉ năm 2026
POST /api/v1/libraries/vn.ngay-nghi-le/validate  { "input": "2026-02-16" }   có trong lịch, hay LIB-UNKNOWN-001
```

## Trạng thái

**Chưa đủ, chưa duyệt.** Nguồn (Erp-vn, xuất 07/11/2026) có 9 ngày: Tết Dương lịch 2026 và 2027, 5 ngày Tết Bính Ngọ, 30/4, 1/5. **Thiếu Giỗ Tổ Hùng Vương (10/3 âm lịch) và Quốc khánh (2/9 cùng ngày nghỉ liền kề) năm 2026** — bổ sung theo thông báo lịch nghỉ chính thức, không suy đoán. Mọi mục `verified: false`.

## Cập nhật

1. Thêm dòng vào `sources/ngay-nghi-le.csv` (`Ngày,Tên ngày nghỉ,Loại,Căn cứ`; Loại: `Ngày lễ, Tết` hoặc `Nghỉ bù`).
2. `node libraries/vn.ngay-nghi-le/build.mjs`. Không sửa tay `library.json`.
3. Ngày đã công bố mà bị đổi lịch: không xoá dòng; đặt `deprecated` + `replacedBy` sang ngày mới (sửa trong `build.mjs`).
