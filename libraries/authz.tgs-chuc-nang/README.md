# Thư viện `authz.tgs-chuc-nang` — Mã chức năng phân quyền mẫu (TGS)
<!-- [2026-11-08 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-10): hướng dẫn thư viện mã chức năng TGS -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `code-list` · Người duyệt: Nhóm Lõi + kế toán trưởng (ánh xạ).

## Dùng làm gì

349 mã chức năng của bảng phân quyền TGS, chia theo khu (`ke-toan`, `kho`, `ban-hang`, `bao-cao`…). Mỗi mục có:

- `payload.kind`: `function` (phiếu, danh mục) · `report` · `import` · `flag` (cờ `#…`) · `scope` (phạm vi kho) · `condition` (hạn xem);
- `payload.ops`: thao tác có nghĩa (Tìm = `read`, Thêm = `create`, Sửa = `update`, Xóa = `cancel` — huỷ / đảo, không xoá thật, In = `print`, Xuất = `export`; cờ dùng `grant` — chỉ có khi bảng gốc đánh Thêm / Sửa / Xóa ở dòng cờ);
- `payload.mapsTo`: ánh xạ sang quyền của Core, `confidence` cao / vừa / thấp; `de-xuat` là quyền chưa tồn tại;
- `hints`: bất thường của bảng gốc (một tên nhiều mã, một mã nhiều tên).

Tra, chọn, kiểm mã: dùng API thư viện chung ([docs/api/16-thu-vien.md](../../docs/api/16-thu-vien.md)). Mã gõ sai được gợi ý mã gần nhất (`LIB-UNKNOWN-001`). Luật riêng: `TGS-REPORT-001` (cấp ghi cho báo cáo), `TGS-FLAG-001` (cờ chỉ cấp khi có Thêm / Sửa / Xóa).

## Nguồn và cập nhật

Nguồn thật là bảng CSV và luật ánh xạ của W5 đợt 2 ([docs/standard/phan-quyen/](../../docs/standard/phan-quyen/README.md)); SC-AUTH-04 giữ ánh xạ đúng. Thư viện này **sinh từ** `docs/standard/phan-quyen/tgs-ma-chuc-nang.json`:

1. Sửa luật ánh xạ, chạy `node scripts/phan-quyen/tgs-anh-xa.mjs`.
2. Chạy `node libraries/authz.tgs-chuc-nang/build.mjs` (nội dung đổi → tự lên phiên bản).
3. Không sửa tay `library.json` (SC-LIB-1 so với bản sinh lại).

Mọi mục `verified: false` cho tới khi ánh xạ được duyệt. Thư viện **không cấp quyền** (D-LIB-8, D-AUTH-08).
