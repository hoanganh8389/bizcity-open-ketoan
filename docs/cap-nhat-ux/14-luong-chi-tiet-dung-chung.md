<!-- [2026-11-13 02:05 PM Võ Hoàng] UX-14 — chữ chốt khuôn Luồng chi tiết dùng chung cho trang Quy trình mọi phân hệ (R-FLOW-2; đóng góp; phiếu NT-BH-013) -->
# Đợt 14 — Khuôn "Luồng chi tiết" dùng chung (chữ chốt)

## Vấn đề
- Trang Quy trình (`/nhom/<nhóm>`) có hai tầng: sơ đồ ít chữ (`layout/so-do-nhom.ts`, mọi nhóm) và **Luồng chi tiết** (`?xem=chi-tiet`) — mới có ở Mua hàng (`phan-he/mua-hang/quy-trinh/QuyTrinhMuaHang.tsx`) và Danh mục (`phan-he/danh-muc/QuyTrinhDanhMuc.tsx`, chép lại khung `mf-*` của Mua hàng).
- Mỗi trang tự viết khung (ô, tầng Khai báo / Phát sinh, mũi tên, việc cần làm) → làm thêm phân hệ là chép thêm một lần.
- `phan-he/flows.tsx` khoá luồng theo **module** — Tiền mặt / Tiền gửi cùng module `quy`, Công cụ dụng cụ / Tài sản cố định cùng `tai-san` → khai một luồng là hai nhóm hiện chung.
- `components/quy-trinh/QuyTrinh.tsx` (khuôn cũ) không màn nào dùng.

## Quyết định
1. **Một component** `components/quy-trinh/LuongChiTiet.tsx` (+ `luong-chi-tiet.css`, lấy nguyên giao diện `mf-*` của Mua hàng — không đổi nhìn) nhận **dữ liệu khai báo**:
   ```ts
   type Buoc = {
     key: string; ma?: string; ten: string; path?: string;   // ô việc chính (path trống = "đang phát triển")
     tuDong?: string[];                                       // phần mềm làm sẵn
     khaiBao?: O[]; phatSinh?: O[];                           // tầng trên / dưới; O = { ten, path?, ma? }
     dem?: { nhan: string; so: number; path?: string }[];     // số phiếu nháp / chờ / lỗi của bước
     mauIn?: { ten: string; path: string }[];
   };
   type ViecCanLam = { ten: string; so: number; muc: 'loi' | 'canh-bao' | 'nhac'; path: string };
   type LuongChiTiet = { tieuDe: string; buoc: Buoc[]; viec?: () => Promise<ViecCanLam[]>; huongDan?: string };
   ```
   Khung việc cần làm, ô đang phát triển, lỗi tải (thử lại), quyền (ô vẫn hiện) — làm một lần trong component.
2. **Khoá theo nhóm menu** (`group key` của `menu-gon.ts`), không theo module: `phan-he/flows.tsx` đổi thành `LUONG_CHI_TIET: Record<groupKey, () => Promise<LuongChiTiet>>` (nạp lười). Nút "Luồng chi tiết" ở `LauncherPage` hiện khi nhóm có mục.
3. **Mua hàng, Danh mục** chuyển sang khai dữ liệu (tệp `quy-trinh/luong.ts` của từng phân hệ), giao diện và số liệu **không đổi** (NT-BH-013 §5 dòng 6). Phần riêng của Mua hàng (công thức đặt hàng sống, mẫu in) truyền qua `dem`, `mauIn`, hoặc ô tuỳ biến `noiDung?: ReactNode` của bước.
4. **Bán hàng** là phân hệ đầu tiên làm mới theo khuôn (NT-BH-013); việc cần làm đọc `GET /api/v1/ban-hang/viec-can-lam` (chỉ đọc, quyền `reports:read`; đếm chứng từ `sale` / `sale_return` lỗi / chờ duyệt, đơn QR chờ tiền, ca chưa chốt, chương trình ≥ 90 % hạn mức, phải thu quá hạn — module `pos` tắt thì bỏ phần đơn / ca).
5. Bỏ `components/quy-trinh/QuyTrinh.tsx`.
6. Phân hệ khác (Kho, Tiền mặt, Tiền gửi, Thuế…) làm sau, mỗi nhóm một PR nhỏ, chỉ khai dữ liệu.

## Không đổi
Sơ đồ ít chữ (`so-do-nhom.ts`), đường dẫn `/nhom/<nhóm>?xem=chi-tiet`, quyền từng màn, giao diện Mua hàng / Danh mục.

## Kiểm bằng
Phiếu NT-BH-013; test `apps/web` cho component (bước đang phát triển, việc cần làm rỗng / lỗi), test API `ban-hang-viec-can-lam.test.ts`; chạy thật Docker chụp ba trang (Mua hàng, Danh mục, Bán hàng) trước / sau.
