// @bizcity-layer K kernel/intake
// [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 (2.17, ADR-0014 D3, R-INTAKE-3/4/5): bộ tiền kiểm L1–L4 — gom MỌI phát hiện IN-* của một chứng từ bằng chính luật cửa nạp (zod khuôn nạp, totalsProblems, findBranch, ownDocument, phiên bản); chỉ đọc
/**
 * TIỀN KIỂM CHỨNG TỪ (ADR-0014 D3; RULE-INTAKE). Trả MỌI phát hiện của chứng từ — không dừng ở lỗi đầu — kèm điểm 0–100.
 * CHỈ ĐỌC: không ghi sự việc, không ghi bể chờ (W2), không ghi sổ.
 *
 *   L1 khuôn       ingestDocumentSchema (zod của packages/contracts) → mỗi issue thành IN-SHAPE-* (không đưa câu của zod ra ngoài)
 *   L2 số học      totalsProblems (cùng hàm cửa nạp dùng) → IN-SUM-001/002/005/006; kiểm hướng dẫn IN-SUM-003 (thuế suất),
 *                  IN-SUM-004 (đơn giá × số lượng). Khuôn hỏng thì vẫn chạy L2 trên phần đọc được (số ép kiểu)
 *   L3 danh mục    findBranch (cùng hàm cửa nạp) → IN-MD-001; mã hàng chưa có → IN-MD-004 (gợi ý); MST sai định dạng → IN-MD-005
 *   L4 nghiệp vụ   chủ chứng từ (ownDocument, khoá app) → IN-BIZ-003; phiên bản lùi → IN-BIZ-004; cùng phiên bản khác nội dung
 *                  → IN-BIZ-005; số hoá đơn trùng chứng từ khác → IN-BIZ-006; ngày hoá đơn xa ngày chứng từ → IN-BIZ-007
 *   L5             định khoản thử — W5 (PHASE-021), không ở đây
 *
 * R-INTAKE-4: mã `block` + `door` ⇔ cửa nạp từ chối cùng dữ liệu — kiểm bằng test cặp (apps/api/test/intake-preflight.test.ts).
 */
import { ingestDocumentSchema, intakeFinding, intakeScore, sortFindings, type IngestDocument, type IntakeFinding } from '@ketoan/contracts';
import { ownDocument } from '@bizcity/platform/core/actions';
import { AppError } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';
import type { Db } from '@bizcity/platform/db/client';
import { findBranch, totalsProblems } from '../documents/document.service.js';
import { draftItemFindings } from './draft-items.js';

export interface PreflightResult {
  findings: IntakeFinding[];
  score: number;
  /** Có khi khuôn L1 đạt. */
  parsed?: IngestDocument;
}

type ZodIssueLike = { code: string; path: (string | number)[]; received?: unknown; expected?: unknown; options?: unknown[]; validation?: unknown; type?: string };

const pathOf = (p: (string | number)[]) => p.reduce<string>((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : k), '') || null;
const isDateField = (p: (string | number)[]) => /date$/i.test(String(p[p.length - 1] ?? ''));

/** issue zod → mã IN-SHAPE-* (L1). */
function shapeFinding(i: ZodIssueLike, raw: unknown): IntakeFinding {
  const path = pathOf(i.path);
  const got = valueAt(raw, i.path);
  switch (i.code) {
    case 'invalid_union_discriminator':
      return intakeFinding('IN-SHAPE-004', path, { got, expected: (i.options ?? []).join(', ') });
    case 'invalid_type':
      return i.received === 'undefined'
        ? intakeFinding('IN-SHAPE-001', path, { expected: String(i.expected ?? '') })
        : intakeFinding('IN-SHAPE-002', path, { got, expected: String(i.expected ?? '') });
    case 'too_small':
      return intakeFinding('IN-SHAPE-001', path, { got });
    case 'too_big':
      return intakeFinding('IN-SHAPE-005', path, { got: typeof got === 'string' ? `${got.length} ký tự` : Array.isArray(got) ? `${got.length} phần tử` : got });
    case 'invalid_enum_value':
    case 'invalid_literal':
      return intakeFinding('IN-SHAPE-006', path, { got, expected: (i.options ?? (i.expected !== undefined ? [i.expected] : [])).join(', ') });
    case 'invalid_string':
      return isDateField(i.path) ? intakeFinding('IN-SHAPE-003', path, { got, expected: 'YYYY-MM-DD' }) : intakeFinding('IN-SHAPE-002', path, { got });
    default:
      return isDateField(i.path) ? intakeFinding('IN-SHAPE-003', path, { got, expected: 'YYYY-MM-DD' }) : intakeFinding('IN-SHAPE-002', path, { got });
  }
}

function valueAt(raw: unknown, p: (string | number)[]): unknown {
  let cur: unknown = raw;
  for (const k of p) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);

/** Phần đọc được của chứng từ khi khuôn hỏng: số ép kiểu, đủ cho L2 (tổng tiền). */
function lenient(raw: unknown): IngestDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.docType !== 'string' || !Array.isArray(r.lines) || !r.totals || typeof r.totals !== 'object') return null;
  const t = r.totals as Record<string, unknown>;
  return {
    ...r,
    lines: (r.lines as Record<string, unknown>[]).map((l) => ({ ...l, amount: num(l?.amount), amountBeforeTax: num(l?.amountBeforeTax), taxAmount: num(l?.taxAmount) })),
    totals: { beforeTax: num(t.beforeTax), tax: num(t.tax), total: num(t.total) },
  } as unknown as IngestDocument;
}

const MST_RE = /^\d{10}(-\d{3})?$/;
const DAY_MS = 86_400_000;

/** Tiền kiểm một chứng từ thô (chưa parse). Đọc trong `trx` (RLS theo đơn vị của người gọi). */
export async function preflight(trx: Db, auth: AuthContext, raw: unknown): Promise<PreflightResult> {
  const findings: IntakeFinding[] = [];

  // ── L1 khuôn ──
  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) for (const i of parsed.error.issues as ZodIssueLike[]) findings.push(shapeFinding(i, raw));
  const doc = parsed.success ? parsed.data : lenient(raw);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // ── L2 số học ──
  if (doc) {
    try {
      for (const p of totalsProblems(doc)) findings.push(intakeFinding(p.code, p.path, { got: p.message }));
    } catch { /* phần đọc được không đủ để cộng — L1 đã báo */ }
    const docLines = (doc as { lines?: unknown }).lines;
    if (Array.isArray(docLines) && docLines.length && typeof docLines[0] === 'object' && 'taxCode' in (docLines[0] as object)) {
      const lines = docLines as unknown as { taxCode?: string; amountBeforeTax?: number; taxAmount?: number; unitPrice?: number; qty?: number; discount?: number }[];
      const codes = [...new Set(lines.map((l) => l.taxCode).filter((c): c is string => Boolean(c)))];
      const rates = codes.length
        ? new Map((await trx.selectFrom('tax_codes').select(['code', 'rate']).where('tenant_id', '=', auth.tenantId).where('code', 'in', codes).execute()).map((t) => [t.code, Number(t.rate)]))
        : new Map<string, number>();
      lines.forEach((l, n) => {
        const rate = l.taxCode ? rates.get(l.taxCode) : undefined;
        if (rate !== undefined && l.amountBeforeTax) {
          const want = Math.round((num(l.amountBeforeTax) * rate) / 100);
          if (Math.abs(want - num(l.taxAmount)) > 1) findings.push(intakeFinding('IN-SUM-003', `lines[${n}].taxAmount`, { got: num(l.taxAmount), expected: `${want} (= ${num(l.amountBeforeTax)} × ${rate}%)` }));
        }
        const price = num(l.unitPrice), qty = num(l.qty);
        if (price > 0 && qty !== 0) {
          const gross = Math.round(price * qty);
          const want = gross - num(l.discount);
          if (Math.abs(want - num(l.amountBeforeTax)) > 1 && Math.abs(gross - num(l.amountBeforeTax)) > 1) {
            findings.push(intakeFinding('IN-SUM-004', `lines[${n}].amountBeforeTax`, { got: num(l.amountBeforeTax), expected: `${want} (= ${price} × ${qty} − ${num(l.discount)})` }));
          }
        }
      });
    }
  }

  // ── L3 danh mục ──
  if (typeof r.branchCode === 'string' && r.branchCode.trim()) {
    try {
      await findBranch(trx, auth.tenantId, r.branchCode.trim());
    } catch (err) {
      findings.push(intakeFinding('IN-MD-001', 'branchCode', { got: r.branchCode, expected: err instanceof AppError ? err.message : 'mã chi nhánh đã khai' }));
    }
  }
  const skus = Array.isArray(r.lines) ? [...new Set((r.lines as { sku?: unknown }[]).map((l) => (typeof l?.sku === 'string' ? l.sku.trim() : '')).filter(Boolean))] : [];
  if (skus.length) {
    const have = new Set((await trx.selectFrom('products').select('sku').where('tenant_id', '=', auth.tenantId).where('sku', 'in', skus).execute()).map((p) => p.sku));
    for (const s of skus) if (!have.has(s)) findings.push(intakeFinding('IN-MD-004', 'lines[].sku', { got: s }));
    // [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: mặt hàng nháp → IN-ITEM-009 (cùng luật cửa nạp, R-INTAKE-4)
    findings.push(...(await draftItemFindings(trx, auth.tenantId, skus)));
  }
  const taxCode = (r.partner as { taxCode?: unknown } | undefined)?.taxCode;
  if (typeof taxCode === 'string' && taxCode.trim() && !MST_RE.test(taxCode.trim())) findings.push(intakeFinding('IN-MD-005', 'partner.taxCode', { got: taxCode, expected: '10 chữ số hoặc 10 chữ số-3 chữ số' }));

  // ── L4 nghiệp vụ ──
  const docKey = typeof r.docKey === 'string' ? r.docKey.trim() : '';
  if (auth.app && docKey) {
    try { ownDocument(auth.app, { docKey, sourceSystem: r.sourceSystem }, 'app'); } catch { findings.push(intakeFinding('IN-BIZ-003', 'docKey', { got: docKey, expected: `${auth.app}:…` })); }
  }
  if (docKey) {
    const existing = await trx.selectFrom('accounting_events').select(['version', 'payload']).where('tenant_id', '=', auth.tenantId).where('doc_key', '=', docKey).executeTakeFirst();
    const version = parsed.success ? parsed.data.version : num(r.version) || 1;
    if (existing && existing.version > version) findings.push(intakeFinding('IN-BIZ-004', 'version', { got: version, expected: `> ${existing.version}` }));
    if (existing && existing.version === version && parsed.success) {
      const before = typeof existing.payload === 'string' ? existing.payload : JSON.stringify(existing.payload);
      if (stable(JSON.parse(before)) !== stable(parsed.data)) findings.push(intakeFinding('IN-BIZ-005', 'version', { got: version, expected: `${version + 1} (nội dung đã đổi)` }));
    }
  }
  const inv = (r.invoice ?? undefined) as { no?: unknown; date?: unknown } | undefined;
  if (inv && typeof inv.no === 'string' && inv.no.trim()) {
    const dup = await trx.selectFrom('accounting_events').select('doc_key').where('tenant_id', '=', auth.tenantId).where('invoice_no', '=', inv.no.trim())
      .where('doc_key', '!=', docKey || '').where('status', '!=', 'cancelled').executeTakeFirst();
    if (dup) findings.push(intakeFinding('IN-BIZ-006', 'invoice.no', { got: inv.no, expected: `chưa dùng (đang ở ${dup.doc_key})` }));
    if (typeof inv.date === 'string' && typeof r.docDate === 'string') {
      const gap = Math.abs(Date.parse(inv.date) - Date.parse(r.docDate)) / DAY_MS;
      if (Number.isFinite(gap) && gap > 5) findings.push(intakeFinding('IN-BIZ-007', 'invoice.date', { got: inv.date, expected: `trong 5 ngày quanh ${r.docDate}` }));
    }
  }

  const sorted = sortFindings(findings);
  return { findings: sorted, score: intakeScore(sorted), ...(parsed.success ? { parsed: parsed.data } : {}) };
}

/** JSON có khoá sắp xếp — so nội dung không phụ thuộc thứ tự khoá. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
