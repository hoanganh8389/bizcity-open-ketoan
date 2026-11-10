// @bizcity-layer K kernel/posting
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting/posting.service.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15: luật manual_journal; lý do của bút toán = lý do dòng đầu khi chứng từ không ghi; tra đối tượng theo dòng
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — áp bảng quy tắc định khoản (rule-table.ts) lên bút toán luật dựng; simulatePosting cho màn chạy thử (đóng góp)
/**
 * Điều phối định khoản một chứng từ gốc:
 *   1. Quyết định bộ sổ (nội bộ luôn có; thuế nếu có hoá đơn hợp lệ và không phải phiếu nội bộ;
 *      phiếu kho vào cả hai sổ vì hàng thật sự đổi chỗ).
 *   2. Nạp cấu hình hạch toán, chọn luật theo loại chứng từ, dựng dòng.
 *   3. Ghi bút toán cho mỗi bộ sổ qua ledgerService. Luật có thể chia chứng từ thành nhiều phần,
 *      mỗi phần một chi nhánh (chuyển kho: một bút toán ở nơi xuất, một ở nơi nhận).
 *
 * Thêm loại chứng từ mới: viết rules/<loai>.rule.ts và thêm vào RULES.
 */
import { sql } from 'kysely';
import { isCashDocument, skusOf, type IngestDocument } from '@ketoan/contracts';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { writeAudit } from '@bizcity/platform/core/audit';
import { entryBodyHash, entryContentHash, ledgerService } from '../ledger/ledger.service.js';
import type { DraftEntry } from '../ledger/ledger.types.js';
import { postingConfigRepository } from '../posting-config/posting-config.repository.js';
import { AccountResolver } from './account-resolver.js';
import { buildSaleParts, type RuleContext, type StockContext } from './rules/sale.rule.js';
import { buildSaleReturnParts } from './rules/sale-return.rule.js';
import { buildPurchaseParts, buildPurchaseReturnParts } from './rules/purchase.rule.js';
import { buildStockAdjustmentLines, buildTransferParts, type PostingPart } from './rules/stock.rule.js';
import { buildCashTransferParts, buildPaymentParts } from './rules/cash.rule.js';
import { buildManualJournalParts } from './rules/journal.rule.js';
import { applyRuleTable, type RuleHit, type RuleTable } from './rule-table.js';
import type { PostingConfig } from '../posting-config/posting-config.repository.js';

// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-13 (D004-10): danh sách đóng bảy cột E2 — khớp trigger guard_ledger_entry_mutation (0049); test db-rules / e2-header-audit so với CSDL
/** Cột của ledger_entries mà đường E2 (cập nhật thông tin đầu) được đổi. Thêm cột = đổi trigger + chữ chốt (RULE-LEDGER E2), không chỉ sửa hằng này. */
export const E2_COLUMNS = ['doc_no', 'invoice_no', 'reason_code', 'partner_id', 'description', 'content_hash', 'event_version'] as const;
// [2026-11-09 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14: cột mà CSDL cho đổi khi bút toán posted (trigger không ép) = E2_COLUMNS + hai cột tên chụp của 0087; trigger ledger_entries_header_audit ghi dấu vết cả chín. Ứng dụng chỉ ghi bảy cột đầu
/** Cột của ledger_entries mà trigger bất biến KHÔNG ép khi bút toán posted (đổi được về kỹ thuật). partner_name / partner_attr_id (0087) có ghi chú "không đổi về sau" nhưng chưa được ép: chờ chủ S029-19 quyết (Q004-9). */
export const E2_DB_COLUMNS = [...E2_COLUMNS, 'partner_name', 'partner_attr_id'] as const;
/** So hai giá trị cột: null ngang null; bigint của pg là chuỗi còn giá trị nhập có thể là số. */
const sameValue = (a: unknown, b: unknown): boolean => (a == null || b == null ? a == null && b == null : String(a) === String(b));

type Doc<T extends IngestDocument['docType']> = Extract<IngestDocument, { docType: T }>;
type RuleFn = (doc: IngestDocument, ctx: RuleContext) => PostingPart[];
const single = (lines: PostingPart['lines']): PostingPart[] => [{ lines }];

const RULES: Record<IngestDocument['docType'], RuleFn> = {
  sale: (doc, ctx) => buildSaleParts(doc as Doc<'sale'>, ctx),
  sale_return: (doc, ctx) => buildSaleReturnParts(doc as Doc<'sale_return'>, ctx),
  purchase: (doc, ctx) => buildPurchaseParts(doc as Doc<'purchase'>, ctx),
  purchase_return: (doc, ctx) => buildPurchaseReturnParts(doc as Doc<'purchase_return'>, ctx),
  transfer: (doc, ctx) => buildTransferParts(doc as Doc<'transfer'>, ctx),
  stock_adjustment: (doc, ctx) => single(buildStockAdjustmentLines(doc as Doc<'stock_adjustment'>, ctx)),
  cash_transfer: (doc, ctx) => buildCashTransferParts(doc as Doc<'cash_transfer'>, ctx),
  customer_payment: (doc, ctx) => buildPaymentParts(doc as Doc<'customer_payment'>, ctx),
  supplier_payment: (doc, ctx) => buildPaymentParts(doc as Doc<'supplier_payment'>, ctx),
  manual_journal: (doc, ctx) => buildManualJournalParts(doc as Doc<'manual_journal'>, ctx),
};

/** Phiếu kho: chỉ có số lượng và giá trị, không có hoá đơn. */
export function isStockDocument(doc: IngestDocument): boolean {
  return doc.docType === 'transfer' || doc.docType === 'stock_adjustment';
}

/** Chứng từ liên quan nhiều chi nhánh: cần ngữ cảnh chi nhánh (chuyển kho, chuyển tiền, thu hộ, trả hộ…). */
export function needsBranchContext(doc: IngestDocument): boolean {
  return isStockDocument(doc) || isCashDocument(doc);
}

/** Chứng từ có hoá đơn hợp lệ cần ghi sổ hoá đơn (bảng kê bán ra / mua vào): có hoá đơn chưa huỷ, không phải phiếu nội bộ. */
export function hasTaxInvoice(doc: IngestDocument): boolean {
  return Boolean(doc.invoice && doc.invoice.status !== 'cancelled' && !doc.internalOnly);
}

/** Khoá tra lý do mặc định: loại chứng từ, riêng điều chỉnh kho tách theo chiều tăng / giảm. */
export function defaultReasonKey(doc: IngestDocument): string {
  if (doc.docType !== 'stock_adjustment') return doc.docType;
  // Điều chỉnh tăng / giảm theo từng dòng: lý do mặc định theo chiều của dòng đầu (mỗi dòng vẫn tra đối ứng theo chiều riêng).
  const dir = doc.direction === 'mixed' ? ((doc.lines[0]?.qty ?? 0) > 0 ? 'increase' : 'decrease') : doc.direction;
  return `stock_adjustment:${dir}`;
}

export interface PostContext {
  tenantId: string;
  actor: string;
  sourceDocumentId: string;
  sourceVersion: number;
  branchId: string;
  partnerId: string | null;
  stock?: StockContext;
  /**
   * Định khoản lại: bút toán đang có hiệu lực của chứng từ theo dấu vân tay (mã băm → id). Bút toán dựng lại trùng dấu
   * vân tay thì không ghi, id được đưa vào `kept` và bỏ khỏi `reuse`; phần còn lại trong `reuse` là bút toán phải đảo.
   */
  reuse?: Map<string, string[]>;
  /**
   * Như `reuse` nhưng theo dấu vân tay PHẦN SỐ LIỆU (body_hash, migration 0062): trùng phần số liệu mà khác thông tin đầu
   * (số hoá đơn, số chứng từ, diễn giải, lý do, đối tượng ở đầu) → cập nhật tại chỗ thông tin đầu, giữ bút toán, không đảo.
   */
  reuseBody?: Map<string, string[]>;
  kept?: string[];
  /** Bút toán được giữ nhưng cập nhật thông tin đầu tại chỗ (đếm là có thay đổi). */
  updated?: string[];
  /** Ra: phiên bản chính sách kế toán đã dùng (ADR-0009) — ghi vào posting_log. */
  policyVersion?: number | null;
}

/** Đối tượng theo dòng của phiếu kế toán module lập: mã → id. Chỉ tra đối tượng có sẵn (không tự thêm); mã lạ → lỗi khuôn. */
async function linePartners(trx: Db, tenantId: string, lines: { lineKey: string; partnerCode?: string }[]): Promise<Map<string, string>> {
  const codes = [...new Set(lines.map((l) => l.partnerCode).filter((c): c is string => Boolean(c)))];
  if (!codes.length) return new Map();
  const rows = await trx.selectFrom('partners').select(['id', 'code']).where('tenant_id', '=', tenantId).where('code', 'in', codes).execute();
  const map = new Map(rows.map((r) => [r.code, String(r.id)]));
  const missing = codes.filter((c) => !map.has(c));
  if (missing.length) throw Errors.validation(`Đối tượng chưa có trong danh mục: ${missing.join(', ')}`, missing.map((c) => `dòng ${lines.filter((l) => l.partnerCode === c).map((l) => l.lineKey).join(', ')}: ${c}`));
  return map;
}

/** Mã chương trình / chính sách trên các dòng của chứng từ (policyRef.key) — để nạp loại chương trình cho bảng quy tắc. */
export function programKeysOf(doc: IngestDocument): string[] {
  const lines = (doc as { lines?: { policyRef?: { key?: string } }[] }).lines ?? [];
  return [...new Set(lines.map((l) => l.policyRef?.key).filter((k): k is string => Boolean(k)))];
}

/**
 * Áp bảng quy tắc định khoản lên các phần bút toán (đổi tài khoản, không đổi số tiền). Quy tắc ngang hàng → chặn định khoản.
 * Không có quy tắc nào → giữ nguyên (chỉ bỏ nhãn).
 */
export function applyRulesToParts(parts: PostingPart[], cfg: PostingConfig, date: string): { parts: PostingPart[]; hits: (RuleHit & { part: string; partIndex: number })[] } {
  const tracks = (code: string) => { const a = cfg.accounts.get(code); return Boolean(a && (a.track_partner || a.is_debt || a.normal_side === 'both')); };
  const hits: (RuleHit & { part: string; partIndex: number })[] = [];
  const errors: string[] = [];
  const out = parts.map((p, i) => {
    const r = applyRuleTable(p.lines, cfg.ruleTable, { date, book: 'internal', tracksPartner: tracks });
    errors.push(...r.errors);
    hits.push(...r.hits.map((h) => ({ ...h, partIndex: i })));
    return { ...p, lines: r.lines };
  });
  if (errors.length) throw Errors.posting('Bảng quy tắc định khoản có quy tắc ngang hàng', [...new Set(errors)]);
  return { parts: out, hits };
}

/**
 * Định khoản THỬ một chứng từ (không ghi gì): đúng đường của post() — nạp cấu hình theo ngày chứng từ, luật dựng bút toán, áp bảng
 * quy tắc. Màn khai báo quy tắc / sơ đồ dây chuyền dùng để thấy bút toán thật trước khi duyệt.
 */
export async function simulatePosting(trx: Db, tenantId: string, doc: IngestDocument, ctx: { partnerId?: string | null; stock?: StockContext; actor?: string; table?: (t: RuleTable) => RuleTable } = {}) {
  const rule = RULES[doc.docType];
  if (!rule) throw Errors.posting(`Chưa có luật định khoản cho loại chứng từ ${doc.docType}`);
  const date = doc.docDate.slice(0, 10);
  const cfg = await postingConfigRepository.loadPostingConfig(trx, tenantId, skusOf(doc), { asOf: date, actor: ctx.actor ?? 'simulate', programKeys: programKeysOf(doc) });
  if (ctx.table) cfg.ruleTable = ctx.table(cfg.ruleTable);
  const resolver = new AccountResolver(cfg);
  const built = rule(doc, { resolver, partnerId: ctx.partnerId ?? null, stock: ctx.stock }).filter((p) => p.lines.length);
  const before = built.map((p) => ({ ...p, lines: p.lines.map(({ ruleTags: _t, ...l }) => l) }));
  const { parts, hits } = applyRulesToParts(built, cfg, date);
  return { parts, before, tagged: built, hits, table: cfg.ruleTable, accounts: cfg.accounts, policyVersion: cfg.policyVersion };
}

/** Lấy một id khỏi map theo khoá và bỏ id đó khỏi các map còn lại (một bút toán chỉ được giữ một lần). */
function takeReuse(key: string, from: Map<string, string[]> | undefined, others: (Map<string, string[]> | undefined)[]): string | undefined {
  const list = from?.get(key);
  const id = list?.shift();
  if (!id) return undefined;
  for (const m of others) for (const ids of m?.values() ?? []) { const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); }
  return id;
}

export const postingService = {
  /** Định khoản và ghi sổ. Trả về id bút toán đã ghi. Chạy trong giao dịch của người gọi. */
  async post(trx: Db, doc: IngestDocument, ctx: PostContext): Promise<string[]> {
    const rule = RULES[doc.docType];
    if (!rule) throw Errors.posting(`Chưa có luật định khoản cho loại chứng từ ${doc.docType}`);

    const skus = skusOf(doc);
    // Chính sách kế toán áp cho NGÀY HẠCH TOÁN của chứng từ (ADR-0009): định khoản lại chứng từ cũ không theo quy tắc mới.
    const cfg = await postingConfigRepository.loadPostingConfig(trx, ctx.tenantId, skus, { asOf: doc.docDate.slice(0, 10), actor: ctx.actor, programKeys: programKeysOf(doc) });
    ctx.policyVersion = cfg.policyVersion;
    const resolver = new AccountResolver(cfg);
    const partners = doc.docType === 'manual_journal' ? await linePartners(trx, ctx.tenantId, doc.lines) : undefined;
    // Bảng quy tắc định khoản (0096): cài đặt quyết tài khoản; ledgerService.post bên dưới vẫn kiểm Nợ = Có, tài khoản, đối tượng, kỳ khoá.
    const parts = applyRulesToParts(rule(doc, { resolver, partnerId: ctx.partnerId, stock: ctx.stock, partners }).filter((p) => p.lines.length), cfg, doc.docDate.slice(0, 10)).parts;
    if (!parts.length) return []; // chứng từ 0 đồng: không có gì để ghi
    // Ghi mã lý do đã dùng (kể cả lý do mặc định) để sổ, bảng tổng hợp chứng từ tách được theo lý do.
    // Phiếu kế toán module lập không có lý do mặc định: chứng từ không ghi lý do thì lấy lý do của dòng đầu.
    const headReason = doc.reasonCode ?? (doc.docType === 'manual_journal' ? doc.lines[0]?.reasonCode : undefined);
    const reasonCode = headReason ?? resolver.reason(undefined, defaultReasonKey(doc)).code;

    const date = doc.docDate.slice(0, 10);
    const ids: string[] = [];
    // Bộ phận của chi nhánh và khoản mục của lý do: ghi vào mọi dòng của bút toán (dòng chưa có sẵn), để báo cáo
    // lãi lỗ, công nợ, chi phí lọc được theo cửa hàng, khoản mục.
    const reason = resolver.reason(headReason, defaultReasonKey(doc));
    const costItem = typeof (reason.flags as Record<string, unknown>)?.costItem === 'string' ? String((reason.flags as Record<string, unknown>).costItem) : undefined;
    const branchIds = [...new Set(parts.map((p) => p.branchId ?? ctx.branchId))];
    const depOf = new Map((await trx.selectFrom('branches').select(['id', 'department_code']).where('id', 'in', branchIds).execute()).map((b) => [b.id, b.department_code]));
    const enrich = (lines: (typeof parts)[number]['lines'], branchId: string) => lines.map((l) => {
      const dims: Record<string, unknown> = { ...(l.dims ?? {}) };
      if (doc.employee?.code) dims.employee = doc.employee.code; // nhân viên phụ trách: mọi dòng, để báo cáo công nợ, doanh thu theo nhân viên
      const dep = depOf.get(branchId);
      if (dep && !dims.department) dims.department = dep;
      if (costItem && !dims.costItem) dims.costItem = costItem;
      return Object.keys(dims).length ? { ...l, dims } : l;
    });
    {
      for (const part of parts) {
        const draft: DraftEntry = {
          branchId: part.branchId ?? ctx.branchId,
          docType: part.docType ?? doc.docType,
          docNo: part.docNo ?? doc.docNo,
          invoiceNo: part.noInvoice ? null : doc.invoice?.no ?? null,
          docDate: date,
          postingDate: date,
          reasonCode: part.reasonCode ?? reasonCode,
          partnerId: ctx.partnerId,
          description: part.description ?? (doc.description || defaultDescription(doc)),
          sourceDocumentId: ctx.sourceDocumentId,
          sourceVersion: ctx.sourceVersion,
          policyVersion: cfg.policyVersion,
          lines: enrich(part.lines, part.branchId ?? ctx.branchId),
        };
        const full = entryContentHash(draft);
        const same = takeReuse(full, ctx.reuse, [ctx.reuseBody]);
        if (same) {
          ctx.kept?.push(same);
          continue;
        }
        // Chỉ thông tin đầu đổi (ví dụ vừa phát hành hoá đơn): cập nhật tại chỗ, không đảo / ghi lại bút toán.
        const header = takeReuse(entryBodyHash(draft), ctx.reuseBody, [ctx.reuse]);
        if (header) {
          // [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-13 (D004-10, review R1 RV-R1-14): E2 ghi dấu vết trước / sau của các cột thật sự đổi
          const before = await trx.selectFrom('ledger_entries').select([...E2_COLUMNS]).where('id', '=', header).executeTakeFirstOrThrow();
          const next = {
            doc_no: draft.docNo, invoice_no: draft.invoiceNo ?? null, reason_code: draft.reasonCode ?? null, partner_id: draft.partnerId ?? null,
            description: draft.description, content_hash: full, event_version: draft.sourceVersion ?? null,
          };
          await trx.updateTable('ledger_entries').set(next).where('id', '=', header).execute();
          const changed = E2_COLUMNS.filter((c) => !sameValue(before[c], next[c]));
          if (changed.length) {
            // [2026-11-09 08:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14 (D004-12): _txid + _source cho phép đối chiếu với dòng audit_logs do trigger ledger_entries_header_audit ghi (0089): cùng _txid = đã khai báo; chỉ có dòng _source = db = sửa ngoài ứng dụng
            const txid = (await sql<{ t: string }>`SELECT pg_current_xact_id()::text AS t`.execute(trx)).rows[0]!.t;
            await writeAudit(trx, {
              tenantId: ctx.tenantId, actor: ctx.actor, action: 'ledger.entry.header_update', objectType: 'ledger_entry', objectId: String(header),
              before: Object.fromEntries(changed.map((c) => [c, before[c] ?? null])),
              after: { ...Object.fromEntries(changed.map((c) => [c, next[c] ?? null])), _source: 'app', _txid: txid },
            });
          }
          ctx.kept?.push(header);
          ctx.updated?.push(header);
          continue;
        }
        const posted = await ledgerService.post(trx, ctx.tenantId, ctx.actor, draft, cfg.accounts);
        ids.push(posted.id);
      }
    }
    return ids;
  },
};

const DESCRIPTION: Record<IngestDocument['docType'], string> = {
  sale: 'Bán hàng',
  sale_return: 'Hàng bán trả lại',
  purchase: 'Nhập mua hàng',
  purchase_return: 'Trả hàng nhà cung cấp',
  transfer: 'Chuyển kho',
  stock_adjustment: 'Điều chỉnh kho',
  cash_transfer: 'Chuyển tiền',
  customer_payment: 'Thu tiền khách hàng',
  supplier_payment: 'Trả tiền nhà cung cấp',
  manual_journal: 'Phiếu kế toán',
};

function defaultDescription(doc: IngestDocument): string {
  const inv = doc.invoice ? ` – HĐ ${doc.invoice.no}` : '';
  const extra = doc.docType === 'transfer' && doc.leg === 'in' ? (doc.fromBranchCode ? ` ← ${doc.fromBranchCode}` : ' (nhận về)')
    : doc.docType === 'transfer' && doc.leg === 'out' ? (doc.toBranchCode ? ` → ${doc.toBranchCode}` : ' (xuất đi)')
    : doc.docType === 'transfer' || doc.docType === 'cash_transfer' ? ` → ${doc.toBranchCode}` : doc.docType === 'stock_adjustment' ? (doc.direction === 'increase' ? ' (tăng)' : doc.direction === 'decrease' ? ' (giảm)' : ' (tăng / giảm)') : '';
  return `${DESCRIPTION[doc.docType]} ${doc.docNo}${extra}${inv}`;
}
