// @bizcity-layer D modules/kho
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — nhập xuất tồn + báo cáo hàng hoá lấy từ GOODS (loi.ts), không import báo cáo của ke-toan (SC-MOD-1)
/** Phân hệ KHO: nhập xuất, chuyển kho, tồn kho, giá vốn, báo cáo hàng hoá. */
import type { ApiModule } from '../types.js';
import { GOODS, LEDGER } from '../loi.js';

export const kho: ApiModule = { key: 'kho', label: 'Kho', routes: [...LEDGER, ...GOODS] };
