// @bizcity-layer K kernel/intake
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-18, 20-KIEN-TRUC §8; ADR-0014 Q3): bảng điểm đầu vào — đạt lần đầu, điểm TB, mục mở, thời gian xử lý, sửa tại bể; nhóm theo nguồn / người lập / loại / mã / tuần
/**
 * BẢNG ĐIỂM ĐẦU VÀO — chỉ mã, điểm, số đếm; không nội dung chứng từ (R-INTAKE-12). Mọi kế toán xem được (Q3).
 *
 * Một "chứng từ gửi" = một docKey khác nhau nhận trong khung (sự việc `accounting_events.received_at` hoặc mục bể
 * `intake_inbox.received_at`, không tính mục thử); mục bể không đọc được docKey tính riêng từng mục.
 *   Đạt lần đầu  = chứng từ gửi chưa từng có mục bể ÷ chứng từ gửi.
 *   Điểm TB      = trung bình điểm các mục bể trong khung.
 *   Thời gian xử lý = trung vị (resolved_at − received_at) các mục đóng trong khung, giờ.
 *   Sửa tại bể   = (resubmitted + accepted) ÷ mục đã đóng trong khung.
 * Nguồn: khoá app → `app:<khoá>`; còn lại sourceSystem của chứng từ (manual = nhập tay), không đọc được thì kênh.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';

export type ScoreGroup = 'source' | 'actor' | 'docType' | 'week';

export interface ScoreRow { key: string; sent: number; firstPass: number; firstPassRate: number | null; avgScore: number | null; topCode: string | null }

const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function intakeScore(trx: Db, tenantId: string, from: Date, to: Date) {
  const docs = sql`
    WITH d AS (
      SELECT doc_key AS k, source_system AS source, coalesce(created_by, '') AS actor, doc_type, received_at AS at, false AS rejected, NULL::int AS score, NULL::text[] AS codes
        FROM accounting_events WHERE tenant_id = ${tenantId} AND received_at >= ${from} AND received_at < ${to}
      UNION ALL
      SELECT coalesce(doc_key, '#' || id), CASE WHEN app_key IS NOT NULL THEN 'app:' || app_key ELSE coalesce(source_system, channel) END, actor, coalesce(doc_type, '?'), received_at, true, score,
             (SELECT coalesce(array_agg(DISTINCT x->>'code'), '{}') FROM jsonb_array_elements(findings) x)
        FROM intake_inbox WHERE tenant_id = ${tenantId} AND status <> 'trial' AND received_at >= ${from} AND received_at < ${to}
    ),
    k AS (
      SELECT k, (array_agg(source ORDER BY rejected DESC, at))[1] AS source, (array_agg(actor ORDER BY rejected DESC, at))[1] AS actor,
             (array_agg(doc_type ORDER BY rejected DESC, at))[1] AS doc_type, min(at) AS at, bool_or(rejected) AS rejected
        FROM d GROUP BY k
    )`;
  const groupExpr = (g: ScoreGroup) => (g === 'source' ? sql`source` : g === 'actor' ? sql`actor` : g === 'docType' ? sql`doc_type` : sql`to_char(date_trunc('week', at), 'IYYY-"W"IW')`);
  const group = async (g: ScoreGroup): Promise<ScoreRow[]> => {
    const rows = await sql<{ key: string; sent: number; first: number; avg: number | null; top: string | null }>`
      ${docs},
      g AS (SELECT ${groupExpr(g)} AS key, count(*)::int AS sent, count(*) FILTER (WHERE NOT rejected)::int AS first FROM k GROUP BY 1),
      s AS (SELECT ${groupExpr(g)} AS key, round(avg(score))::int AS avg FROM d WHERE rejected GROUP BY 1),
      c AS (SELECT DISTINCT ON (key) key, code FROM (SELECT ${groupExpr(g)} AS key, unnest(codes) AS code FROM d WHERE rejected) x GROUP BY key, code ORDER BY key, count(*) DESC, code)
      SELECT g.key, g.sent, g.first, s.avg, c.code AS top FROM g LEFT JOIN s USING (key) LEFT JOIN c USING (key) ORDER BY ${g === 'week' ? sql`g.key` : sql`g.sent DESC, g.key`}`.execute(trx);
    return rows.rows.map((r) => ({ key: r.key ?? '', sent: r.sent, firstPass: r.first, firstPassRate: rate(r.first, r.sent), avgScore: r.avg, topCode: r.top }));
  };

  const [total, bySource, byActor, byDocType, byWeek, codes, open, closed] = await Promise.all([
    sql<{ sent: number; first: number; avg: number | null }>`${docs}
      SELECT (SELECT count(*)::int FROM k) AS sent, (SELECT count(*) FILTER (WHERE NOT rejected)::int FROM k) AS first, (SELECT round(avg(score))::int FROM d WHERE rejected) AS avg`.execute(trx),
    group('source'), group('actor'), group('docType'), group('week'),
    sql<{ code: string; n: number }>`${docs}
      SELECT code, count(*)::int AS n FROM (SELECT unnest(codes) AS code FROM d WHERE rejected) x GROUP BY code ORDER BY n DESC, code LIMIT 10`.execute(trx),
    trx.selectFrom('intake_inbox').where('tenant_id', '=', tenantId).where('status', '=', 'open')
      .select([sql<number>`count(*)::int`.as('n'), sql<Date | null>`min(received_at)`.as('oldest'), sql<string | null>`(array_agg(coalesce(doc_key, '#' || id) ORDER BY received_at))[1]`.as('oldestKey')]).executeTakeFirst(),
    trx.selectFrom('intake_inbox').where('tenant_id', '=', tenantId).where('status', 'not in', ['open', 'trial']).where('resolved_at', '>=', from).where('resolved_at', '<', to)
      .select([sql<number>`count(*)::int`.as('n'), sql<number>`count(*) FILTER (WHERE status IN ('resubmitted', 'accepted'))::int`.as('patched'),
        sql<number | null>`round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - received_at)) / 3600)::numeric, 1)::float8`.as('medianHours')]).executeTakeFirst(),
  ]);
  const t = total.rows[0] ?? { sent: 0, first: 0, avg: null };
  // Người lập: user:<id> → họ tên, apikey:<id> → "khoá API <tên>" (chỉ tên, không thông tin khác)
  const ids = (kind: string) => byActor.map((r) => r.key).filter((a) => a.startsWith(`${kind}:`)).map((a) => a.slice(kind.length + 1)).filter((x) => /^\d+$/.test(x));
  const names = new Map<string, string>();
  if (ids('user').length) for (const u of await trx.selectFrom('users').select(['id', 'full_name']).where('tenant_id', '=', tenantId).where('id', 'in', ids('user')).execute()) names.set(`user:${u.id}`, u.full_name);
  if (ids('apikey').length) for (const k of await trx.selectFrom('api_keys').select(['id', 'name']).where('tenant_id', '=', tenantId).where('id', 'in', ids('apikey')).execute()) names.set(`apikey:${k.id}`, `khoá API ${k.name}`);
  return {
    from: from.toISOString(), to: to.toISOString(),
    totals: {
      sent: t.sent, firstPass: t.first, firstPassRate: rate(t.first, t.sent), avgScore: t.avg,
      open: open?.n ?? 0, oldestOpenAt: open?.oldest ? new Date(open.oldest).toISOString() : null, oldestOpenKey: open?.oldestKey ?? null,
      closed: closed?.n ?? 0, patchedAtInbox: closed?.patched ?? 0, patchedRate: rate(closed?.patched ?? 0, closed?.n ?? 0), medianResolveHours: closed?.medianHours ?? null,
    },
    bySource, byActor: byActor.map((r) => ({ ...r, label: names.get(r.key) ?? (r.key || 'không rõ') })), byDocType, byWeek,
    topCodes: codes.rows,
  };
}
