// @bizcity-layer K kernel/conformance
// [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: kiểm L3 CONFORMANCE_STALE (theo đơn vị; không ở L1 vì health/ready chạy L1 không gắn đơn vị) — lượt Kiểm chuẩn gần nhất quá 2 ngày (lịch đêm không chạy); cùng mã với lane DG-CONF-1.
/**
 * Lịch Kiểm chuẩn còn chạy không (F22-ENV-12) — CHỈ ĐỌC, mức warn. Ngưỡng 2 ngày là quy chế nội bộ.
 * Đơn vị mới (tạo chưa tới 2 ngày) chưa có lượt nào thì không báo.
 */
import { sql } from 'kysely';
import { SCREENS } from '@ketoan/contracts';
import { type DiagCheck } from '@bizcity/platform/system/diagnostics';

export const CONFORMANCE_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'CONFORMANCE_STALE', layer: 'L3', level: 'warn', scoped: false,
    remedy: {
      steps: [
        { text: 'Vận hành kiểm tiến trình API còn chạy (đồng hồ sự kiện chạy trong API)', role: 'operator' },
        { text: 'Xem việc giao bị dead của core.conformance-nightly (Hệ thống → sự kiện), sửa rồi phát lại', role: 'operator' },
        { text: 'Chạy kiểm chuẩn tay', screen: SCREENS.HT06, role: 'chief_accountant' },
      ],
      owner: 'operator', verify: { code: 'CONFORMANCE_STALE' },
    },
    title: 'Lượt Kiểm chuẩn gần nhất không quá 2 ngày (lịch đêm còn chạy)',
    fix: 'Lịch đêm không chạy thì bảng điểm cũ, lỗi theo thời gian (hoá đơn chờ, sự việc treo, cuối kỳ) không được phát hiện. Mẫu: ngày lượt gần nhất.',
    async run(trx, s) {
      if (!s.tenantId) return { examined: 0, count: 0, sample: [] };
      const r = await sql<{ last: Date | null; young: boolean }>`
        SELECT (SELECT max(created_at) FROM conformance_runs WHERE tenant_id = ${s.tenantId}) AS last,
               (SELECT created_at > now() - interval '2 days' FROM tenants WHERE id = ${s.tenantId}) AS young`.execute(trx);
      const row = r.rows[0];
      const last = row?.last ? new Date(row.last) : null;
      const stale = last ? last.getTime() < Date.now() - 2 * 86_400_000 : !row?.young;
      return { examined: 1, count: stale ? 1 : 0, sample: stale ? [last ? `lượt gần nhất ${last.toISOString().slice(0, 10)}` : 'chưa có lượt nào'] : [] };
    },
  },
];
