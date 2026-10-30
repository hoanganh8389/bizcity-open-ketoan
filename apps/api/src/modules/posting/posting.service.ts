// @bizcity-layer K kernel/posting
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
import { isCashDocument, skusOf, type IngestDocument } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { entryBodyHash, entryContentHash, ledgerService } from '../ledger/ledger.service.js';
import type { DraftEntry } from '../ledger/ledger.types.js';
import { postingConfigRepository } from '../posting-config/posting-config.repository.js';
import { AccountResolver } from './account-resolver.js';
import { buildSaleParts, type RuleContext, type StockContext } from './rules/sale.rule.js';
import { buildSaleReturnParts } from './rules/sale-return.rule.js';
import { buildPurchaseParts, buildPurchaseReturnParts } from './rules/purchase.rule.js';
import { buildStockAdjustmentLines, buildTransferParts, type PostingPart } from './rules/stock.rule.js';
import { buildCashTransferParts, buildPaymentParts } from './rules/cash.rule.js';

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
    const cfg = await postingConfigRepository.loadPostingConfig(trx, ctx.tenantId, skus);
    const resolver = new AccountResolver(cfg);
    const parts = rule(doc, { resolver, partnerId: ctx.partnerId, stock: ctx.stock }).filter((p) => p.lines.length);
    if (!parts.length) return []; // chứng từ 0 đồng: không có gì để ghi
    // Ghi mã lý do đã dùng (kể cả lý do mặc định) để sổ, bảng tổng hợp chứng từ tách được theo lý do.
    const reasonCode = doc.reasonCode ?? resolver.reason(undefined, defaultReasonKey(doc)).code;

    const date = doc.docDate.slice(0, 10);
    const ids: string[] = [];
    // Bộ phận của chi nhánh và khoản mục của lý do: ghi vào mọi dòng của bút toán (dòng chưa có sẵn), để báo cáo
    // lãi lỗ, công nợ, chi phí lọc được theo cửa hàng, khoản mục.
    const reason = resolver.reason(doc.reasonCode, defaultReasonKey(doc));
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
          await trx.updateTable('ledger_entries').set({
            doc_no: draft.docNo, invoice_no: draft.invoiceNo ?? null, reason_code: draft.reasonCode ?? null, partner_id: draft.partnerId ?? null,
            description: draft.description, content_hash: full, event_version: draft.sourceVersion ?? null,
          }).where('id', '=', header).execute();
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
};

function defaultDescription(doc: IngestDocument): string {
  const inv = doc.invoice ? ` – HĐ ${doc.invoice.no}` : '';
  const extra = doc.docType === 'transfer' && doc.leg === 'in' ? (doc.fromBranchCode ? ` ← ${doc.fromBranchCode}` : ' (nhận về)')
    : doc.docType === 'transfer' && doc.leg === 'out' ? (doc.toBranchCode ? ` → ${doc.toBranchCode}` : ' (xuất đi)')
    : doc.docType === 'transfer' || doc.docType === 'cash_transfer' ? ` → ${doc.toBranchCode}` : doc.docType === 'stock_adjustment' ? (doc.direction === 'increase' ? ' (tăng)' : doc.direction === 'decrease' ? ' (giảm)' : ' (tăng / giảm)') : '';
  return `${DESCRIPTION[doc.docType]} ${doc.docNo}${extra}${inv}`;
}
