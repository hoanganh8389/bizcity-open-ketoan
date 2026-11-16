// @bizcity-layer D modules/tai-san
/** Phân hệ TÀI SẢN: tài sản cố định, công cụ dụng cụ, khấu hao (mã nguồn ở lõi modules/assets — báo cáo tài chính dùng chung). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { assetRoutes } from '../../modules/assets/asset.routes.js';
import { assetPlanRoutes } from '../../modules/assets/asset-plan.js';

// [2026-11-13 08:00 PM kiennt] NT-HT-003 — màn hình + thao tác phân hệ Tài sản (lệnh lõi modules/assets gác qua lenh) (đóng góp)
import './man-hinh-tai-san.js';

export const taiSan: ApiModule = { key: 'tai-san', label: 'Tài sản', routes: [...LEDGER, assetRoutes, assetPlanRoutes] };
