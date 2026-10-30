/**
 * Màn hình của phân hệ Mua hàng. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Navigate, Route, useLocation } from 'react-router-dom';
import { TongQuanMuaPage } from './tong-quan/TongQuanMuaPage';
import { ChungTuPage } from './chung-tu/ChungTuPage';
import { SoKhoTheoMatHangPage, TonKhoTheoMatHangPage } from './bao-cao-kho/BaoCaoKhoPages';
import { ChinhSachPage } from './chinh-sach/ChinhSachPage';
import { ChiTietChinhSachPage } from './chinh-sach/ChiTietChinhSachPage';
import { HanMucPage } from './han-muc/HanMucPage';
import { ThuongPage } from './thuong/ThuongPage';
import { PhanBoPage } from './phan-bo/PhanBoPage';
import { LoHanPage } from './lo-han/LoHanPage';
import { QuaTangPage } from './qua-tang/QuaTangPage';
import { NhatKyMuaPage } from './nhat-ky/NhatKyMuaPage';
import { DoiChieuDonPage } from './doi-chieu/DoiChieuDonPage';
import { CaiDatMuaPage } from './cai-dat/CaiDatMuaPage';
import { BienTheMatHangPage } from './bien-the/BienTheMatHangPage';
import { NhaCungCapPage } from './nha-cung-cap/NhaCungCapPage';
import { HoSoNccPage } from './nha-cung-cap/HoSoNccPage';
import { DatHangPage } from './dat-hang/DatHangPage';
import { CsdlPage } from './csdl/CsdlPage';
import { PhanCapPage } from './ton-max/PhanCapPage';
import { KhoiDauPage } from './khoi-dau/KhoiDauPage';
import { TonMaxPage } from './ton-max/TonMaxPage';
import { DangKyMaxPage } from './ton-max/DangKyMaxPage';
import { CongThucPage } from './ton-max/CongThucPage';
import { ChuyenShopPage } from './ton-max/ChuyenShopPage';
import { HoaDonNccPage } from './hoa-don/HoaDonNccPage';

export const muaHangRoutes = (
  <>
    <Route path="mua-hang/nha-cung-cap" element={<NhaCungCapPage />} />
    <Route path="mua-hang/nha-cung-cap/:code" element={<HoSoNccPage />} />
    <Route path="mua-hang/dat-hang" element={<DatHangPage />} />
    <Route path="mua-hang/ton-max" element={<TonMaxPage />} />
    <Route path="mua-hang/dang-ky-max" element={<DangKyMaxPage />} />
    <Route path="mua-hang/chuyen-shop" element={<ChuyenShopPage />} />
    <Route path="mua-hang/cong-thuc" element={<CongThucPage />} />
    <Route path="mua-hang/phan-cap" element={<PhanCapPage />} />
    <Route path="mua-hang/khoi-dau" element={<KhoiDauPage />} />
    <Route path="mua-hang/tong-quan" element={<TongQuanMuaPage />} />
    {/* MH03 Chứng từ mua hàng đã gộp vào MH11 Tổng hợp mua hàng — liên kết cũ (?mo, ?moi, ?loai…) chuyển sang, giữ tham số */}
    <Route path="mua-hang/chung-tu" element={<VeTongHop />} />
    <Route path="mua-hang/hoa-don-ncc" element={<HoaDonNccPage />} />
    <Route path="mua-hang/chinh-sach" element={<ChinhSachPage />} />
    <Route path="mua-hang/chi-tiet-chinh-sach" element={<ChiTietChinhSachPage />} />
    <Route path="mua-hang/han-muc" element={<HanMucPage />} />
    <Route path="mua-hang/thuong" element={<ThuongPage />} />
    <Route path="mua-hang/phan-bo" element={<PhanBoPage />} />
    <Route path="mua-hang/lo-han" element={<LoHanPage />} />
    <Route path="mua-hang/qua-tang" element={<QuaTangPage />} />
    <Route path="mua-hang/nhat-ky" element={<NhatKyMuaPage />} />
    <Route path="mua-hang/tong-hop" element={<ChungTuPage key="tong-hop" report="tong-hop" />} />
    <Route path="mua-hang/bao-cao" element={<ChungTuPage key="bao-cao" report="bao-cao" />} />
    <Route path="mua-hang/so-kho" element={<SoKhoTheoMatHangPage />} />
    <Route path="mua-hang/ton-kho" element={<TonKhoTheoMatHangPage />} />
    <Route path="mua-hang/doi-chieu" element={<DoiChieuDonPage />} />
    <Route path="mua-hang/cai-dat" element={<CaiDatMuaPage />} />
    <Route path="mua-hang/bien-the" element={<BienTheMatHangPage />} />
    <Route path="mua-hang/csdl" element={<CsdlPage />} />
    {/* Đường dẫn cũ (màn nhập nhanh dữ liệu giả, đã bỏ) → màn chứng từ mua hàng */}
    <Route path="mua-hang/phieu-mua" element={<Navigate to="/mua-hang/tong-hop" replace />} />
    <Route path="mua-hang/tra-ncc" element={<Navigate to="/mua-hang/tong-hop" replace />} />
  </>
);

function VeTongHop() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/mua-hang/tong-hop', search }} replace />;
}
