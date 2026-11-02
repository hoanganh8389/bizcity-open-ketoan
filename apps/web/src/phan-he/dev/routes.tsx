// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: route các màn Bàn điều tra (/dev/…)
// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: Lỗi theo module, Ghi sổ, Sự kiện, Toàn vẹn, Kịch bản
/**
 * Màn của phân hệ Nhà phát triển. Đường dẫn /dev/… trùng DEV_SCREENS ở @ketoan/contracts (ca T019-5 đối chiếu tệp này); link trong
 * phản hồi của core.devtools.trace dùng đúng các đường này.
 */
import { Route } from 'react-router-dom';
import { TongQuanPage } from './tong-quan/TongQuanPage';
import { TraMaPage } from './tra-ma/TraMaPage';
import { NhatKyPage } from './nhat-ky/NhatKyPage';
import { LoiTheoModulePage } from './loi-theo-module/LoiTheoModulePage';
import { GhiSoPage } from './ghi-so/GhiSoPage';
import { SuKienPage } from './su-kien/SuKienPage';
import { ToanVenPage } from './toan-ven/ToanVenPage';
import { KichBanPage } from './kich-ban/KichBanPage';

export const devRoutes = (
  <>
    <Route path="dev/tong-quan" element={<TongQuanPage />} />
    <Route path="dev/tra-ma" element={<TraMaPage />} />
    <Route path="dev/nhat-ky" element={<NhatKyPage />} />
    <Route path="dev/loi-theo-module" element={<LoiTheoModulePage />} />
    <Route path="dev/ghi-so" element={<GhiSoPage />} />
    <Route path="dev/su-kien" element={<SuKienPage />} />
    <Route path="dev/toan-ven" element={<ToanVenPage />} />
    <Route path="dev/kich-ban" element={<KichBanPage />} />
  </>
);
