/**
 * Màn hình của phân hệ Tài sản. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { AssetCategoriesPage, AssetEventsPage, AssetRegisterPage, AssetsPage, DepreciationPage } from './assets/AssetPages';
import { AssetPlanPage } from './assets/AssetPosting';

export const taiSanRoutes = (
  <>
    <Route path="tai-san/tscd" element={<AssetsPage key="tscd" kind="fixed_asset" />} />
    <Route path="tai-san/ghi-giam" element={<AssetsPage key="ghi-giam" kind="fixed_asset" decrease />} />
    <Route path="tai-san/cong-cu" element={<AssetsPage kind="tool" />} />
    <Route path="tai-san/chi-phi-tra-truoc" element={<AssetsPage kind="prepaid" />} />
    <Route path="tai-san/khau-hao" element={<DepreciationPage />} />
    <Route path="tai-san/ke-hoach-khau-hao" element={<AssetPlanPage />} />
    <Route path="tai-san/danh-gia-lai" element={<AssetEventsPage key="revaluation" kind="revaluation" />} />
    <Route path="tai-san/dieu-chuyen" element={<AssetEventsPage key="transfer" kind="transfer" />} />
    <Route path="tai-san/kiem-ke" element={<AssetEventsPage key="audit" kind="audit" />} />
    <Route path="danh-muc/loai-tai-san" element={<AssetCategoriesPage />} />
    <Route path="bao-cao/so-tai-san" element={<AssetRegisterPage key="acc29" preset={{ title: 'Sổ tài sản cố định', code: 'ACC29', subtitle: 'Nguyên giá, khấu hao luỹ kế đầu kỳ, trích trong kỳ, giá trị còn lại của từng tài sản', kind: 'fixed_asset' }} />} />
    <Route path="bao-cao/phan-bo-chi-phi" element={<AssetRegisterPage key="acc27" preset={{ title: 'Báo cáo phân bổ chi phí', code: 'ACC27', subtitle: 'Công cụ dụng cụ, chi phí trả trước: đã phân bổ, phân bổ trong kỳ, còn lại', kind: 'tool' }} />} />
    <Route path="bao-cao/tai-san" element={<AssetRegisterPage key="acc42" preset={{ title: 'Báo cáo tài sản', code: 'ACC42', subtitle: 'Toàn bộ tài sản cố định, công cụ dụng cụ, chi phí trả trước trong kỳ' }} />} />
    <Route path="bao-cao/theo-doi-tscd-ccdc" element={<AssetRegisterPage key="acc85" preset={{ title: 'BC theo dõi TSCĐ và CCDC', code: 'ACC85', subtitle: 'Tăng, giảm, khấu hao, phân bổ của tài sản cố định và công cụ dụng cụ theo chi nhánh' }} />} />
  </>
);
