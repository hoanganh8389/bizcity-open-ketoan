# Thư viện `authz.tgs-nhom` — Nhóm vai trò mẫu (TGS)
<!-- [2026-11-08 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-10): hướng dẫn thư viện nhóm vai trò TGS -->

Khuôn: [`bizcity_library@1`](../../docs/contracts/BIZCITY-LIBRARY-v1.md) · Loại: `permission-template` · Người duyệt: Nhóm Lõi + quản trị viên đơn vị.

## Dùng làm gì

28 nhóm vai trò mẫu (`tgs-…`). Mỗi mục có `payload.grants` (mã chức năng → thao tác được cấp, đã chuẩn hoá), `payload.derived` (quyền Core suy ra), `payload.anomalies` (bất thường để người duyệt quyết, cũng hiện ở `hints`).

**Thư viện không cấp quyền.** Nạp vào một đơn vị:

```bash
node scripts/phan-quyen/nap-vai-tro-tgs.mjs --api http://localhost:8088 --tenant <mã> --email <email> --password <mk>
```

Mỗi nhóm thành một vai trò **bản nháp, vô hiệu** — không ai có thêm quyền cho tới khi quản trị viên xem ở HT12 (Phân quyền → Vai trò) và bật (D-AUTH-08).

## Nguồn và cập nhật

Sinh từ `docs/standard/phan-quyen/tgs-nhom.json` (W5 đợt 2). Đổi nguồn: chạy `node scripts/phan-quyen/tgs-anh-xa.mjs` rồi `node libraries/authz.tgs-nhom/build.mjs`. Không sửa tay `library.json`.
