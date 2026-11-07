// @bizcity-layer P module-sdk
// [2026-11-06 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: tổng quan cấu hình cho màn HT13 (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md)
/**
 * TỔNG QUAN CẤU HÌNH (HT13, chỉ đọc):
 *   GET /api/v1/settings/overview   mọi khoá của registry `bizcity_settings@1` — lớp A / B / C, nhóm, phạm vi, nơi lưu, có phiên bản hay chưa,
 *                                   giá trị hiện hành (chỉ khoá có phiên bản và không phải bí mật), số phiên bản, thay đổi gần nhất, bản sắp hiệu lực,
 *                                   căn cứ đang áp (1.2: của phiên bản hiện hành, không thì căn cứ mặc định ở registry, không thì thiếu), nơi dùng (usedBy), sức khoẻ cấu hình.
 * Không ghi gì. Không bao giờ trả giá trị của khoá bí mật hoặc khoá chưa đi đường chung (D030-13, NC-8): màn chỉ hiện trạng thái.
 * Lịch sử từng khoá: GET /api/v1/settings/values/:key/history (đã có, chỉ khoá có phiên bản).
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db } from '@bizcity/platform/db/client';
import { authOf, requireAuthenticated } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { addDays, verifySeals, vnToday } from '@bizcity/platform/core/evidence-export';
import { getSetting, settingsRegistry, settingsToday, type SettingBasis } from '@bizcity/platform/core/settings';

const tags = ['Cấu hình'];

export type OverviewGroup = 'duyet' | 'ketoan' | 'nhaplieu' | 'he-thong';
/** Nhóm của màn HT13 theo miền của khoá (24 §4.1). Khoá miền lạ vào nhóm 'he-thong'. */
const GROUP_OF_DOMAIN: Record<string, OverviewGroup> = {
  payment: 'duyet', lock: 'duyet',
  posting: 'ketoan',
  intake: 'nhaplieu', item: 'nhaplieu',
};
export const groupOf = (key: string): OverviewGroup => GROUP_OF_DOMAIN[key.split('.')[1] ?? ''] ?? 'he-thong';

/** Khoá chứa bí mật hoặc không nên hiện giá trị: chỉ trạng thái (D030-13). */
export const isSecretKey = (key: string) => /(^|\.)(connections|secret|password|token|apikey|api_key)(\.|$)/i.test(key);

export const RECENT_DAYS = 30;

export async function settingsOverviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/settings/overview', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Tổng quan cấu hình của đơn vị cho màn HT13: mọi khoá registry, lớp, phiên bản, thay đổi gần nhất, thiếu căn cứ, sức khoẻ' },
    handler: async (req) => {
      const auth = authOf(req);
      const today = settingsToday();
      return db.transaction().execute(async (trx) => {
        const entries = [...settingsRegistry().values()].sort((a, b) => a.key.localeCompare(b.key));
        const stats = await sql<{ key: string; versions: string; last_at: Date | null; recent: boolean }>`
          SELECT key, count(*)::text AS versions, max(created_at) AS last_at,
                 bool_or(created_at >= now() - make_interval(days => ${RECENT_DAYS})) AS recent
            FROM setting_values WHERE tenant_id = ${auth.tenantId} GROUP BY key`.execute(trx);
        const statByKey = new Map(stats.rows.map((r) => [r.key, r]));
        const last = await sql<{ key: string; version: number; reason: string | null; created_by: string; created_at: Date; valid_from: string }>`
          SELECT DISTINCT ON (key) key, version, reason, created_by, created_at, to_char(valid_from, 'YYYY-MM-DD') AS valid_from
            FROM setting_values WHERE tenant_id = ${auth.tenantId} ORDER BY key, created_at DESC, id DESC`.execute(trx);
        const lastByKey = new Map(last.rows.map((r) => [r.key, r]));
        const upcoming = await sql<{ key: string; valid_from: string; version: number }>`
          SELECT DISTINCT ON (key) key, to_char(valid_from, 'YYYY-MM-DD') AS valid_from, version
            FROM setting_values WHERE tenant_id = ${auth.tenantId} AND valid_from > ${today}::date ORDER BY key, valid_from ASC, version ASC`.execute(trx);
        const upcomingByKey = new Map(upcoming.rows.map((r) => [r.key, r]));

        const cv = await sql<{ v: string }>`SELECT config_version AS v FROM tenants WHERE id = ${auth.tenantId}`.execute(trx);
        const configVersion = Number(cv.rows[0]?.v ?? 0);
        const items = [];
        for (const e of entries) {
          const secret = isSecretKey(e.key);
          const versioned = Boolean(e.valueType);
          let current: { value: unknown; source: unknown } | null = null;
          let versionBasis: SettingBasis | null = null;
          if (versioned && !secret) {
            const r = await getSetting(trx, auth.tenantId, e.key);
            current = { value: r.value, source: r.source };
            versionBasis = r.basis ?? null;
          }
          const st = statByKey.get(e.key);
          const l = lastByKey.get(e.key);
          const up = upcomingByKey.get(e.key);
          items.push({
            key: e.key, group: groupOf(e.key), class: e.class ?? null, owner: e.owner, scopes: e.scopes, storage: e.storage,
            valueType: e.valueType ?? null, permission: e.permission ?? null,
            versioned, secret,
            // Căn cứ đang áp (1.2): của phiên bản hiện hành nếu có, không thì căn cứ mặc định của khoá ở registry, không thì null = "thiếu căn cứ".
            basis: (versionBasis ?? e.basis ?? null) as SettingBasis | null,
            basisFrom: (versionBasis ? 'version' : e.basis ? 'registry' : null) as 'version' | 'registry' | null,
            usedBy: e.usedBy ?? [],
            current,
            versions: st ? Number(st.versions) : 0,
            lastChange: l ? { version: Number(l.version), by: l.created_by, at: new Date(l.created_at).toISOString(), reason: l.reason, validFrom: l.valid_from } : null,
            upcoming: up ? { validFrom: up.valid_from, version: Number(up.version) } : null,
          });
        }

        // Ngày đã đóng quá hạn chưa niêm phong bằng chứng (ADR-0030, EVIDENCE_SEAL_MISSING); không đọc được thư mục thì null, không làm hỏng màn.
        let sealMissing: number | null = null;
        try {
          const t = vnToday();
          const r = await verifySeals(trx, auth.tenantId, addDays(t, -31), addDays(t, -1), t);
          sealMissing = r.findings.filter((f) => f.code === 'EVIDENCE_SEAL_MISSING').length;
        } catch {
          sealMissing = null;
        }

        const health = {
          total: items.length,
          missingBasis: items.filter((i) => i.basis === null).length,
          withBasis: items.filter((i) => i.basis !== null).length,
          changedRecently: items.filter((i) => statByKey.get(i.key)?.recent).length,
          changedRecentlyClassA: items.filter((i) => i.class === 'A' && statByKey.get(i.key)?.recent).length,
          upcoming: items.filter((i) => i.upcoming).length,
          versioned: items.filter((i) => i.versioned).length,
          sealMissing,
          recentDays: RECENT_DAYS,
        };
        return ok({ configVersion, today, health, items });
      });
    },
  });
}
