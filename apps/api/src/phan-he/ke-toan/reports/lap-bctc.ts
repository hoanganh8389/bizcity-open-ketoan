// @bizcity-layer D modules/ke-toan
// [2026-11-11 Nguyễn Văn Thủy] Lập báo cáo tài chính: lập số B01, B02, B03 theo kỳ, sửa tay, người ký, lưu bộ đã lập (đóng góp)
/**
 * LẬP BÁO CÁO TÀI CHÍNH (ACC99) — cùng cách tính với các màn B01-DN, B02-DN, B03-DN (đọc sổ), thêm phần lưu:
 *   build   lấy số từ sổ cho một kỳ: B01 số cuối kỳ / số đầu năm; B02, B03 kỳ này / cùng kỳ năm trước.
 *           Mỗi dòng kèm công thức (mã số, dấu) để giao diện tính lại dòng tổng khi kế toán sửa số chi tiết.
 *   save    lưu bộ đã lập (bảng financial_statements): số từng chỉ tiêu (gồm số sửa tay), người lập, người đại diện,
 *           ngày lập, đã kiểm toán / ý kiến kiểm toán. Lưu là chụp số lúc lập; sổ đổi sau đó thì bấm "Lấy lại dữ liệu".
 *   list / get / remove.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../../../db/client.js';
import { Errors } from '../../../core/errors.js';
import type { AuthContext } from '../../../core/auth.js';
import { reportService } from './report.service.js';
import { BALANCE_SHEET_LINES } from './balance-sheet.js';
import { INCOME_STATEMENT_LINES, yearBefore } from './income-statement.js';
import { CASH_FLOW_LINES } from './journals.js';

export const BCTC_REPORTS = ['B01-DN', 'B02-DN', 'B03-DN'] as const;
export type BctcReport = (typeof BCTC_REPORTS)[number];

export interface BctcRow { code: string; name: string; bold: boolean; level?: number; formula?: [string, number][]; cur: number | null; prev: number | null }

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

export const bctcSaveSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  periodKind: z.string().min(1).max(20),
  periodLabel: z.string().min(1).max(60),
  year: z.coerce.number().int().min(2000).max(2100),
  from: day,
  to: day,
  goingConcern: z.boolean().default(true),
  reports: z.array(z.enum(BCTC_REPORTS)).min(1),
  data: z.record(z.string(), z.record(z.string(), z.tuple([z.number().nullable(), z.number().nullable()]))),
  audited: z.boolean().default(false),
  auditOpinion: z.string().max(200).default(''),
  preparer: z.string().trim().min(1, 'Người lập không được bỏ trống').max(120),
  legalRep: z.string().trim().min(1, 'Người đại diện theo pháp luật không được bỏ trống').max(120),
  preparedDate: day,
});
export type BctcSave = z.infer<typeof bctcSaveSchema>;

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const lapBctcService = {
  async build(auth: AuthContext, q: { from: string; to: string; reports: BctcReport[] }) {
    const yearStart = `${q.to.slice(0, 4)}-01-01`;
    const want = new Set(q.reports);
    const out: Partial<Record<BctcReport, BctcRow[]>> = {};
    const jobs: Promise<void>[] = [];
    if (want.has('B01-DN')) jobs.push((async () => {
      // Số đầu năm: số dư trước ngày 01/01 của năm báo cáo (kỳ giữa năm vẫn so với đầu năm).
      const bs = await reportService.balanceSheet(auth, { from: yearStart, to: q.to });
      const def = new Map(BALANCE_SHEET_LINES.map((d) => [d.code, d]));
      out['B01-DN'] = bs.rows.map((r) => ({ code: r.code, name: r.name, level: r.level, bold: r.level <= 2, formula: def.get(r.code)?.formula, cur: n(r.closing), prev: n(r.opening) }));
    })());
    if (want.has('B02-DN')) jobs.push((async () => {
      const is = await reportService.incomeStatement(auth, { from: q.from, to: q.to });
      const def = new Map(INCOME_STATEMENT_LINES.map((d) => [d.code, d]));
      out['B02-DN'] = is.rows.map((r) => ({ code: r.code, name: r.name, bold: r.bold, formula: def.get(r.code)?.formula, cur: n(r.current), prev: n(r.previous) }));
    })());
    if (want.has('B03-DN')) jobs.push((async () => {
      const [c, p] = await Promise.all([
        reportService.cashFlow(auth, { from: q.from, to: q.to }),
        reportService.cashFlow(auth, { from: yearBefore(q.from), to: yearBefore(q.to) }),
      ]);
      const def = new Map(CASH_FLOW_LINES.map((d) => [d.code, d]));
      out['B03-DN'] = c.rows.map((r, i) => ({
        code: r.code, name: r.name, bold: r.bold,
        formula: r.code ? def.get(r.code)?.formula?.map((x) => [x, 1] as [string, number]) : undefined,
        cur: n(r.value), prev: n(p.rows[i]?.value),
      }));
    })());
    await Promise.all(jobs);
    return out;
  },

  async list(auth: AuthContext) {
    const r = await sql<{ id: string; period_label: string; year: number; date_from: string; date_to: string; reports: string[]; preparer: string; prepared_date: string; updated_at: string }>`
      SELECT id, period_label, year, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to, reports,
             preparer, to_char(prepared_date, 'YYYY-MM-DD') AS prepared_date, updated_at
        FROM financial_statements WHERE tenant_id = ${auth.tenantId} ORDER BY date_to DESC, id DESC`.execute(db);
    return r.rows.map((x) => ({ id: Number(x.id), periodLabel: x.period_label, year: x.year, from: x.date_from, to: x.date_to, reports: x.reports, preparer: x.preparer, preparedDate: x.prepared_date, updatedAt: x.updated_at }));
  },

  async get(auth: AuthContext, id: number) {
    const r = await sql<{ id: string; period_kind: string; period_label: string; year: number; date_from: string; date_to: string; going_concern: boolean; reports: string[]; data: BctcSave['data']; audited: boolean; audit_opinion: string; preparer: string; legal_rep: string; prepared_date: string; updated_by: string; updated_at: string }>`
      SELECT id, period_kind, period_label, year, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to, going_concern,
             reports, data, audited, audit_opinion, preparer, legal_rep, to_char(prepared_date, 'YYYY-MM-DD') AS prepared_date, updated_by, updated_at
        FROM financial_statements WHERE tenant_id = ${auth.tenantId} AND id = ${id}`.execute(db);
    const x = r.rows[0];
    if (!x) throw Errors.notFound('báo cáo tài chính đã lập');
    return {
      id: Number(x.id), periodKind: x.period_kind, periodLabel: x.period_label, year: x.year, from: x.date_from, to: x.date_to, goingConcern: x.going_concern,
      reports: x.reports, data: x.data, audited: x.audited, auditOpinion: x.audit_opinion, preparer: x.preparer, legalRep: x.legal_rep, preparedDate: x.prepared_date,
      updatedBy: x.updated_by, updatedAt: x.updated_at,
    };
  },

  async save(auth: AuthContext, b: BctcSave) {
    if (b.from > b.to) throw Errors.validation('Từ ngày phải trước Đến ngày');
    const reports = `{${b.reports.join(',')}}`;
    const data = JSON.stringify(b.data);
    if (b.id) {
      const r = await sql<{ id: string }>`
        UPDATE financial_statements SET period_kind = ${b.periodKind}, period_label = ${b.periodLabel}, year = ${b.year}, date_from = ${b.from}::date, date_to = ${b.to}::date,
               going_concern = ${b.goingConcern}, reports = ${reports}::text[], data = ${data}::jsonb, audited = ${b.audited}, audit_opinion = ${b.auditOpinion},
               preparer = ${b.preparer}, legal_rep = ${b.legalRep}, prepared_date = ${b.preparedDate}::date, updated_by = ${auth.actorName}, updated_at = now()
         WHERE tenant_id = ${auth.tenantId} AND id = ${b.id} RETURNING id`.execute(db);
      if (!r.rows[0]) throw Errors.notFound('báo cáo tài chính đã lập');
      return { id: b.id };
    }
    const r = await sql<{ id: string }>`
      INSERT INTO financial_statements (tenant_id, period_kind, period_label, year, date_from, date_to, going_concern, reports, data, audited, audit_opinion,
                                        preparer, legal_rep, prepared_date, created_by, updated_by)
      VALUES (${auth.tenantId}, ${b.periodKind}, ${b.periodLabel}, ${b.year}, ${b.from}::date, ${b.to}::date, ${b.goingConcern}, ${reports}::text[], ${data}::jsonb,
              ${b.audited}, ${b.auditOpinion}, ${b.preparer}, ${b.legalRep}, ${b.preparedDate}::date, ${auth.actorName}, ${auth.actorName})
      RETURNING id`.execute(db);
    return { id: Number(r.rows[0]!.id) };
  },

  async remove(auth: AuthContext, id: number) {
    const r = await sql`DELETE FROM financial_statements WHERE tenant_id = ${auth.tenantId} AND id = ${id}`.execute(db);
    if (!Number(r.numAffectedRows ?? 0)) throw Errors.notFound('báo cáo tài chính đã lập');
    return { id };
  },
};
