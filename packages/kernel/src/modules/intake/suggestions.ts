// @bizcity-layer K kernel/intake
// [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (S021-23, ADR-0014 D9; R-INTAKE-8): gợi ý cấu hình từ lỗi lặp — chỉ GỢI Ý cho kế toán trưởng, không bao giờ tự sửa cấu hình
/**
 * Một lỗi cấu hình lặp lại nhiều lần (chi nhánh chưa khai, lý do định khoản chưa khai, tài khoản ngầm định thiếu, nhóm hạch toán
 * thiếu, mặt hàng nháp) thường là gốc chung của nhiều chứng từ — sửa một chỗ ở cấu hình thay vì sửa từng chứng từ.
 * Gom các phát hiện của mục bể trong N ngày theo (mã, giá trị đã gửi) và đếm số mục; từ MIN_REPEAT lần mới gợi ý.
 * Câu gợi ý lấy từ phương án khắc phục của mã (INTAKE_REMEDIES) — không viết lại luật ở đây. Không đổi dữ liệu nào.
 * Giá trị đã gửi (`got`) chỉ là mã cấu hình (mã chi nhánh, mã lý do…), cắt 120 ký tự; người xem phải có documents:edit-all.
 */
import { INTAKE_CATALOG, intakeFinding, type IntakeCode } from '@ketoan/contracts';
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';

/** Mã mà gốc sửa là cấu hình / danh mục (không phải lỗi riêng của từng chứng từ). */
export const CONFIG_CODES = ['IN-MD-001', 'IN-ITEM-009', 'IN-POST-001', 'IN-POST-002', 'IN-POST-003'] as const satisfies readonly IntakeCode[];
export const MIN_REPEAT = 3;

export interface Suggestion {
  code: IntakeCode; title: string; value: string | null; items: number; lastSeenAt: string;
  suggestion: string; screen: { code: string; path: string; label: string } | null; role: string | null;
}

export async function configSuggestions(trx: Db, tenantId: string, opts: { days?: number; min?: number } = {}): Promise<Suggestion[]> {
  const days = opts.days ?? 30;
  const min = opts.min ?? MIN_REPEAT;
  const rows = await sql<{ code: IntakeCode; value: string | null; items: number; last_seen: Date }>`
    SELECT f->>'code' AS code, left(nullif(f->>'got', ''), 120) AS value, count(DISTINCT i.id)::int AS items, max(i.last_seen_at) AS last_seen
      FROM intake_inbox i, jsonb_array_elements(i.findings) f
     WHERE i.tenant_id = ${tenantId} AND i.status <> 'trial' AND i.last_seen_at >= now() - make_interval(days => ${days})
       AND f->>'code' IN (${sql.join([...CONFIG_CODES])})
     GROUP BY 1, 2 HAVING count(DISTINCT i.id) >= ${min}
     ORDER BY items DESC, last_seen DESC LIMIT 20`.execute(trx);
  return rows.rows.map((r) => {
    const remedy = intakeFinding(r.code, null).remedy;
    const withScreen = remedy?.steps.find((s) => s.screen);
    return {
      code: r.code, title: INTAKE_CATALOG[r.code].title, value: r.value, items: r.items, lastSeenAt: new Date(r.last_seen).toISOString(),
      suggestion: `${r.value ? `"${r.value}" ` : ''}gặp ở ${r.items} chứng từ trong ${days} ngày. ${withScreen?.text ?? remedy?.steps[0]?.text ?? ''}`.trim(),
      screen: withScreen?.screen ?? null, role: withScreen?.role ?? remedy?.owner ?? null,
    };
  });
}
