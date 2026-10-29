/**
 * Màn hình của phân hệ API. Đường dẫn dùng tiền tố /tich-hop (KHÔNG dùng /api — /api/... là đường gọi máy chủ).
 */
import { Route } from 'react-router-dom';
import { ThuApiPage } from './thu-api/ThuApiPage';
import { HuongDanApiPage } from './huong-dan/HuongDanApiPage';
import { NguonDuLieuPage } from './nguon-du-lieu/NguonDuLieuPage';

export const apiRoutes = (
  <>
    <Route path="tich-hop/thu-api" element={<ThuApiPage />} />
    <Route path="tich-hop/huong-dan" element={<HuongDanApiPage />} />
    <Route path="tich-hop/nguon-du-lieu" element={<NguonDuLieuPage />} />
  </>
);
