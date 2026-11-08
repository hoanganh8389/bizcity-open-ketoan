# Thư viện phân quyền mẫu (TGS)
<!-- [2026-11-07 11:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 2: thư viện phân quyền mẫu từ bảng TGS — chữ chốt ADR-0027 Phụ lục A, W5 đợt 2 -->

Bộ dữ liệu khởi đầu cho đội dựng ERP nội bộ trên open-ketoan: **349 mã chức năng** và **28 nhóm vai trò** lấy từ bảng phân quyền thật của TGS (03.11.2026), đã chuẩn hoá về mô hình quyền của Core ([`bizcity_authorization@1`](../../contracts/BIZCITY-AUTHORIZATION-v1.md)). Thiết kế: [ADR-0027 Phụ lục A, W5 đợt 2](../../adr/ADR-0027-core-authorization-plugin-role-editor.md).

## Tệp

| Tệp | Là gì |
|---|---|
| `tgs-nguon.csv` | Bảng gốc, không sửa — 1.618 dòng chức năng × nhóm, sáu cột Tìm / Thêm / Sửa / Xóa / In / Xuất |
| `tgs-ma-chuc-nang.json` | 349 mã: loại, khu, thao tác có nghĩa, ánh xạ sang quyền của Core, độ tin cậy, trạng thái duyệt, ghi chú |
| `tgs-nhom.json` | 28 nhóm: mã vai trò đơn vị (`tgs-…`), thao tác được cấp (đã chuẩn hoá), quyền suy ra, bất thường |

**Không chỉnh tay hai tệp JSON.** Sửa luật trong [`scripts/phan-quyen/tgs-anh-xa.mjs`](../../../scripts/phan-quyen/tgs-anh-xa.mjs) rồi chạy `node scripts/phan-quyen/tgs-anh-xa.mjs`. Phép kiểm **SC-AUTH-04** chặn JSON lệch bản sinh lại.

## Luật ánh xạ (máy suy ra, người duyệt)

- **Loại:** tên bắt đầu `#` là **cờ** (vd `HT10` "Được phép sửa dữ liệu trong quá khứ"); `HT11` / `HT34` là **phạm vi** kho (dùng lần gán có phạm vi, không phải quyền); `HT55` là **điều kiện** hạn xem. Báo cáo / sổ / bảng kê là **báo cáo**; "Import nhanh…" là **nhập**; còn lại là **chức năng** (phiếu, danh mục).
- **Báo cáo** chỉ có Tìm / In / Xuất. Thêm / Sửa / Xóa trên báo cáo bị bỏ và ghi vào bất thường.
- **Chức năng:** Tìm → đọc, Thêm → lập, Sửa → sửa, **Xóa → huỷ / đảo bút toán, không xoá thật** (ECP-13), In → in, Xuất → xuất. Hôm nay map thô vào quyền Core (`documents:*`, `catalog:*`, `ledger:read`, `reports:read`); quyền chi tiết theo tài nguyên ghi `de-xuat` — **chưa tồn tại** cho tới khi module khai trong manifest.
- **Độ tin cậy `cao` chỉ khi** mã có bí danh `tgs:*` trong sổ quyền của code (`catalog.ts`), hoặc báo cáo → `reports:read`. Bí danh của quyền **đọc** chỉ ứng Tìm / In; bí danh của quyền **ghi / quản trị / cấu hình** chỉ ứng Thêm / Sửa / Xóa — xem màn không phải là quản trị được.
- **Cờ đóng an toàn:** chỉ tính là được cấp khi bảng gốc có Thêm / Sửa / Xóa. Chỉ Tìm / In / Xuất → không cấp, ghi vào bất thường.
- **Quyền suy ra của nhóm** (`derived`) = các ánh xạ `cao` (hoặc đã duyệt) trên thao tác nhóm được cấp. Mọi quyền rủi ro cao suy ra đều được nêu trong bất thường.

## Bất thường của bảng gốc (để người duyệt nghiệp vụ quyết)

- Một tên nhiều mã: `ACC3` / `ACC88` (Sổ cái), `ACC79` / `AD22` (Tạo hoá đơn VAT), `BCAD31` / `BCAD77`, `ACC93` / `ACC93A`.
- Một mã nhiều tên giữa các sheet: `ACC6`, `ACC93A`, `ADHT1`, `BC34A`.
- Có quyền mà không có Tìm: dòng 455 (`ACC64`), 609 (`BH5` chỉ có Xóa), 1603 (`CC10`).
- Nhóm **Thủ kho** có "Sửa" ở `HT4` Phân quyền → suy ra `users:write` (rủi ro cao): đúng theo bảng gốc, cần xem lại.

## Nạp vào một đơn vị

```bash
node scripts/phan-quyen/nap-vai-tro-tgs.mjs --api http://localhost:8088 --tenant <mã> --email <email> --password <mk>
```

Script gọi API (không SQL): mỗi nhóm thành một **vai trò của đơn vị**, nền `viewer`, luật Cho là quyền suy ra. Vai trò tạo ra **vô hiệu** ("bản nháp TGS") — **không ai có thêm quyền** cho tới khi quản trị viên xem ở màn **HT12 Phân quyền** và bật (D-AUTH-08). Vai trò vô hiệu cũng không gán được cho ai. Chạy lại không tạo trùng.
