// @bizcity-layer D modules/tai-san
/** Phân hệ TÀI SẢN: tài sản cố định, công cụ dụng cụ, khấu hao (mã nguồn ở lõi modules/assets — báo cáo tài chính dùng chung). */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { assetRoutes } from '../../modules/assets/asset.routes.js';
import { assetPlanRoutes } from '../../modules/assets/asset-plan.js';
import { sql } from 'kysely';
import { db } from '../../db/client.js';
import { dangKyChiNhanhBanGhi, motMa } from '../../modules/access/quyen-chi-nhanh.js';

// [2026-11-13 08:00 PM kiennt] NT-HT-003 — màn hình + thao tác phân hệ Tài sản (lệnh lõi modules/assets gác qua lenh) (đóng góp)
import './man-hinh-tai-san.js';
// [2026-11-17 04:10 PM khanhtd] NT-HT-003 — GĐ3 (H7): lệnh theo mã tài sản tra chi nhánh của tài sản (người bị giới hạn chi nhánh không chạm tài sản chi nhánh khác)
dangKyChiNhanhBanGhi({
  url: /^\/api\/v1\/assets\/:code(\/.*)?$/,
  tra: async (t, p) => (p.code ? motMa((await sql<{ c: string }>`
    SELECT b.code AS c FROM assets a JOIN branches b ON b.id = a.branch_id WHERE a.tenant_id = ${t} AND a.code = ${p.code}`.execute(db)).rows) : []),
});

export const taiSan: ApiModule = { key: 'tai-san', label: 'Tài sản', routes: [...LEDGER, assetRoutes, assetPlanRoutes] };
