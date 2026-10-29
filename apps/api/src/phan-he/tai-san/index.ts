/** Phân hệ TÀI SẢN: tài sản cố định, công cụ dụng cụ, khấu hao (mã nguồn ở lõi modules/assets — báo cáo tài chính dùng chung). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { assetRoutes } from '../../modules/assets/asset.routes.js';
import { assetPlanRoutes } from '../../modules/assets/asset-plan.js';

export const taiSan: ApiModule = { key: 'tai-san', label: 'Tài sản', routes: [...LEDGER, assetRoutes, assetPlanRoutes] };
