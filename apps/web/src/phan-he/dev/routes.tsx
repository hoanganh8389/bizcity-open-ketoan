// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: route các màn Bàn điều tra (/dev/…)
/**
 * Màn của phân hệ Nhà phát triển. Đường dẫn /dev/… (link trong phản hồi của core.devtools.trace dùng đúng các đường này).
 */
import { Route } from 'react-router-dom';
import { TongQuanPage } from './tong-quan/TongQuanPage';
import { TraMaPage } from './tra-ma/TraMaPage';
import { NhatKyPage } from './nhat-ky/NhatKyPage';

export const devRoutes = (
  <>
    <Route path="dev/tong-quan" element={<TongQuanPage />} />
    <Route path="dev/tra-ma" element={<TraMaPage />} />
    <Route path="dev/nhat-ky" element={<NhatKyPage />} />
  </>
);
