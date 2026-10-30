// @bizcity-layer K kernel/intake
/**
 * Nhận và xử lý chứng từ gốc.
 *
 * Luồng ingest():
 *   1. Kiểm khuôn dữ liệu (zod) và kiểm tổng tiền khớp các dòng.
 *   2. Tìm chi nhánh; tạo/cập nhật đối tượng (không có thì dùng "Khách lẻ").
 *   3. Trong MỘT giao dịch:
 *        - khoá dòng chứng từ theo docKey;
 *        - cùng phiên bản và đã ghi sổ → trả "unchanged" (gửi lại không ghi trùng);
 *        - phiên bản cũ hơn bản đang có → từ chối;
 *        - có bút toán cũ → ghi bút toán đảo; lưu phiên bản cũ vào lịch sử;
 *        - định khoản, ghi sổ từng bộ sổ, ghi sổ hoá đơn, đánh dấu "posted".
 *   4. Định khoản lỗi (thiếu cấu hình, kỳ khoá…) → giao dịch huỷ hết, rồi lưu chứng từ ở
 *      trạng thái "error" kèm lý do để kế toán sửa cấu hình và bấm "Ghi sổ lại".
 */
import { listSignatures } from '../signatures/signature.routes.js';
import { assertDateRules, dateRuleViolation, readDataLock } from '../../core/date-rules.js';
import { isAutoMode, needsApproval } from '../../core/posting-modes.js';
import {
  ingestDocumentSchema,
  isTradeDocument,
  moneyEquals,
  sumMoney,
  type IngestDocument,
  type IngestResult,
  isCashDocument,
} from '@ketoan/contracts';
import { db, toNumber, type Db } from '../../db/client.js';
import { AppError, Errors } from '../../core/errors.js';
import { writeAudit } from '../../core/audit.js';
import { assertCanModify, type AuthContext } from '../../core/auth.js';
import { emitKernelEvent } from './kernel-events.js';
import { accountRepository } from '../accounts/account.repository.js';
import { ledgerRepository } from '../ledger/ledger.repository.js';
import { ledgerService } from '../ledger/ledger.service.js';
import { partnerRepository } from '../partners/partner.repository.js';
import { postingConfigRepository } from '../posting-config/posting-config.repository.js';
import { hasTaxInvoice, isStockDocument, needsBranchContext, postingService } from '../posting/posting.service.js';
import type { StockContext } from '../posting/rules/sale.rule.js';
import { inventoryMovementRepository } from '../inventory/inventory-movement.repository.js';
import { taxInvoiceRepository } from '../tax-invoices/tax-invoice.repository.js';
import { settleByInvoiceKeys, settleLinkedTo, settleOffsets } from '../debts/debt.service.js';
import { documentRepository, type DocumentListFilter } from './document.repository.js';
import { applyTaxFlags, applyTaxPatch, loadTaxPatch } from '../tax-info/tax-patch.js';
import { applyReceiptConfirmation, confirmationMatches, isoTime, loadReceiptConfirmation } from './receipt-confirmation.js';
import { sql } from 'kysely';
import { connectionService } from '../connections/connection.service.js';

export const RETAIL_PARTNER = { code: 'KHACH-LE', name: 'Khách lẻ' };
export const RETAIL_SUPPLIER = { code: 'NCC-LE', name: 'Nhà cung cấp lẻ' };

/** Kiểm tổng tiền của chứng từ khớp tổng các dòng (tới xu). */
function assertTotals(doc: IngestDocument): void {
  if (doc.docType === 'cash_transfer') return; // một số tiền, đã kiểm dương ở khuôn
  if (doc.docType === 'customer_payment' || doc.docType === 'supplier_payment') {
    const allocated = sumMoney(doc.lines.map((l) => l.amount));
    if (allocated > doc.totals.total + 0.004) throw Errors.validation('Tổng tiền chứng từ không khớp', [`Tổng phân bổ ${allocated} lớn hơn tổng phiếu ${doc.totals.total}`]);
    return;
  }
  if (!isTradeDocument(doc)) {
    const sum = sumMoney(doc.lines.map((l) => Math.abs(l.amount)));
    if (!moneyEquals(sum, Math.abs(doc.totals.total))) throw Errors.validation('Tổng tiền chứng từ không khớp', [`Tổng giá trị ${doc.totals.total} ≠ tổng các dòng ${sum}`]);
    return;
  }
  const before = sumMoney(doc.lines.map((l) => l.amountBeforeTax));
  const tax = sumMoney(doc.lines.map((l) => l.taxAmount));
  const problems: string[] = [];
  if (!moneyEquals(before, doc.totals.beforeTax)) problems.push(`Tổng tiền trước thuế ${doc.totals.beforeTax} ≠ tổng các dòng ${before}`);
  if (!moneyEquals(tax, doc.totals.tax)) problems.push(`Tổng thuế ${doc.totals.tax} ≠ tổng các dòng ${tax}`);
  if (!moneyEquals(sumMoney([doc.totals.beforeTax, doc.totals.tax]), doc.totals.total)) problems.push('Tổng thanh toán ≠ tiền trước thuế + thuế');
  if (problems.length) throw Errors.validation('Tổng tiền chứng từ không khớp', problems);
}

/**
 * Chi nhánh theo mã hệ thống nguồn gửi sang (mã shop):
 *   1. đúng mã chi nhánh;
 *   2. đúng "Mã tham chiếu ở hệ thống nguồn" (branches.external_ref, khai ở danh mục Chi nhánh DM02);
 *   3. đúng MỘT chi nhánh có mã = mã gửi sang + đuôi chữ (08016 → 08016Plus, 00003 → 00003_OFF — mã của danh mục cũ).
 * Không tìm được, hoặc nhiều chi nhánh cùng khớp đuôi, thì báo rõ để kế toán khai mã tham chiếu.
 */
async function findBranch(trx: Db, tenantId: string, code: string) {
  const cols = ['id', 'code', 'name', 'accounting_unit_id'] as const;
  const exact = await trx.selectFrom('branches').select(cols).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (exact) return exact;
  const byRef = await trx.selectFrom('branches').select(cols).where('tenant_id', '=', tenantId).where('external_ref', '=', code).execute();
  if (byRef.length === 1) return byRef[0]!;
  const like = code.replace(/[\\%_]/g, (c) => `\\${c}`);
  const suffixed = (await trx.selectFrom('branches').select(cols).where('tenant_id', '=', tenantId).where('code', 'like', `${like}%`).execute())
    .filter((b) => /^[A-Za-z_]/.test(b.code.slice(code.length)));
  if (byRef.length === 0 && suffixed.length === 1) return suffixed[0]!;
  const many = [...byRef, ...suffixed].map((b) => b.code);
  throw Errors.validation(many.length
    ? `Chi nhánh ${code} khớp nhiều chi nhánh (${[...new Set(many)].join(', ')}): ghi ${code} vào ô "Mã tham chiếu ở hệ thống nguồn" của đúng chi nhánh (DM02)`
    : `Chi nhánh ${code} chưa khai báo trong danh mục (thêm chi nhánh, hoặc ghi ${code} vào ô "Mã tham chiếu ở hệ thống nguồn" của chi nhánh tương ứng ở DM02)`);
}

async function findBranchId(trx: Db, tenantId: string, code: string): Promise<string> {
  return (await findBranch(trx, tenantId, code)).id;
}

/** Đối tượng đại diện cho một chi nhánh (dùng trên tài khoản nội bộ, tài khoản chờ xử lý theo dõi đối tượng). */
function branchPartnerId(trx: Db, tenantId: string, b: { code: string; name: string }): Promise<string> {
  return partnerRepository.upsert(trx, tenantId, { code: `CN-${b.code}`, name: b.name || `Chi nhánh ${b.code}` }, 'internal');
}

/** Đối tượng của chứng từ: khách (bán), nhà cung cấp (mua); phiếu kho chỉ có khi chứng từ ghi. */
async function documentPartnerId(trx: Db, tenantId: string, doc: IngestDocument): Promise<string | null> {
  if (doc.docType === 'purchase' || doc.docType === 'purchase_return' || doc.docType === 'supplier_payment') {
    return partnerRepository.upsert(trx, tenantId, doc.partner?.code ? doc.partner : RETAIL_SUPPLIER, 'supplier');
  }
  if (isStockDocument(doc) || doc.docType === 'cash_transfer') return doc.partner?.code ? partnerRepository.upsert(trx, tenantId, doc.partner) : null;
  return partnerRepository.upsert(trx, tenantId, doc.partner?.code ? doc.partner : RETAIL_PARTNER);
}

/**
 * Ngữ cảnh chi nhánh của chứng từ liên quan nhiều chi nhánh: chi nhánh nhận (chuyển kho, chuyển tiền),
 * các chi nhánh được thu hộ / trả hộ, đối tượng đại diện từng chi nhánh, có cùng đơn vị hạch toán không.
 */
async function stockContext(trx: Db, tenantId: string, doc: IngestDocument, branch: { id: string; code: string; name: string; accounting_unit_id: string | null }): Promise<StockContext | undefined> {
  if (!needsBranchContext(doc)) return undefined;
  const ctx: StockContext = { branchId: branch.id, branchCode: branch.code, branchPartnerId: await branchPartnerId(trx, tenantId, branch) };
  if (doc.docType === 'customer_payment' || doc.docType === 'supplier_payment') {
    ctx.refs = new Map();
    for (const code of new Set(doc.lines.map((l) => l.branchCode).filter((c): c is string => Boolean(c) && c !== branch.code))) {
      const b = await findBranch(trx, tenantId, code);
      ctx.refs.set(code, { id: b.id, code: b.code, partnerId: await branchPartnerId(trx, tenantId, b) });
    }
  }
  if (doc.docType === 'transfer' || doc.docType === 'cash_transfer') {
    // Phiếu một đầu (leg): chi nhánh bên kia chỉ để mô tả, không biết thì coi như cùng đơn vị hạch toán.
    const leg = doc.docType === 'transfer' ? doc.leg : undefined;
    const other = leg === 'in' && doc.docType === 'transfer' ? doc.fromBranchCode : doc.toBranchCode;
    if (!other && !leg) throw Errors.validation('Thiếu chi nhánh nhận (toBranchCode)');
    // Cùng chi nhánh (toBranchCode = branchCode): chuyển giữa hai kho nếu dòng ghi warehouseCode ≠ toWarehouseCode. KHÔNG chặn ở
    // cổng nhận khi thiếu / trùng kho — hệ thống bán hàng vẫn gửi phiếu cùng chi nhánh không ghi kho (xuất rồi nhận lại cùng kho
    // mặc định, tồn không đổi); màn nhập tay (KHO01) tự bắt chọn hai kho khác nhau.
    // Phiếu một đầu: mã chi nhánh bên kia chưa có trong danh mục thì bỏ qua (chỉ để mô tả), không chặn cả phiếu.
    const to = other ? (leg ? await findBranch(trx, tenantId, other).catch(() => null) : await findBranch(trx, tenantId, other)) : null;
    if (to) {
      ctx.toBranchId = to.id;
      ctx.toBranchPartnerId = await branchPartnerId(trx, tenantId, to);
      ctx.sameAccountingUnit = (branch.accounting_unit_id ?? null) === (to.accounting_unit_id ?? null);
    } else ctx.sameAccountingUnit = true;
  }
  return ctx;
}

/** Phiếu bán có lý do ghi giá vốn theo giá bán (bán nội bộ cho chi nhánh khác)? */
async function costAtSalePrice(trx: Db, tenantId: string, doc: IngestDocument): Promise<boolean> {
  if (doc.docType !== 'sale' || !doc.reasonCode) return false;
  const r = await trx.selectFrom('posting_reasons').select('flags').where('tenant_id', '=', tenantId).where('code', '=', doc.reasonCode).executeTakeFirst();
  return Boolean((r?.flags as Record<string, unknown> | undefined)?.costAtSalePrice);
}

async function loadTaxCodes(trx: Db, tenantId: string) {
  return (await postingConfigRepository.loadPostingConfig(trx, tenantId)).taxCodes;
}

/** Thêm nhân viên vào danh mục nếu chưa có; đã có thì chỉ cập nhật tên khi tên gửi lên khác rỗng. */
async function ensureEmployee(trx: Db, tenantId: string, code: string, name: string): Promise<void> {
  await trx
    .insertInto('dimensions')
    .values({ tenant_id: tenantId, kind: 'employee', code, name: name || code })
    .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'code']).doUpdateSet(name ? { name } : { code }))
    .execute();
}

/** Mã hàng mới trên chứng từ thì thêm vào danh mục mặt hàng (chỉ thêm, không ghi đè mặt hàng đã có). */
async function ensureProducts(trx: Db, tenantId: string, doc: IngestDocument): Promise<void> {
  if (isCashDocument(doc)) return;
  const seen = new Map<string, { name: string; unit: string }>();
  for (const l of doc.lines as { sku?: string; name?: string; unit?: string }[]) {
    if (l.sku && !seen.has(l.sku)) seen.set(l.sku, { name: l.name ?? '', unit: l.unit ?? '' });
  }
  if (!seen.size) return;
  await trx
    .insertInto('products')
    .values([...seen].map(([sku, v]) => ({ tenant_id: tenantId, sku, name: v.name, unit: v.unit, source_system: 'document' })))
    .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing())
    .execute();
}

/**
 * Hàng bán trả lại / trả hàng nhà cung cấp: ghi liên kết "return" từ bút toán trả hàng tới bút toán đang có hiệu lực
 * của chứng từ gốc (originalDocKey). Chứng từ gốc chưa nhận thì bỏ qua (trả hàng vẫn ghi sổ bình thường).
 */
async function linkReturnToOriginal(trx: Db, auth: AuthContext, doc: IngestDocument, entryIds: string[]): Promise<void> {
  if (!entryIds.length || (doc.docType !== 'sale_return' && doc.docType !== 'purchase_return') || !doc.originalDocKey) return;
  const original = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', doc.originalDocKey).executeTakeFirst();
  if (!original) return;
  const targets = await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, original.id);
  for (const id of entryIds) {
    for (const t of targets) {
      await ledgerRepository.addLink(trx, { tenantId: auth.tenantId, entryId: id, targetEntryId: t.id, type: 'return', reason: `Trả lại hàng của ${t.doc_no}`, actor: auth.actor });
    }
  }
}

/** Đảo mọi bút toán còn hiệu lực của chứng từ. */
/** Chứng từ hệ thống tự sinh / lập tay: bỏ định khoản ở màn nào. */
const UNPOST_ELSEWHERE: Record<string, string> = {
  closing: 'chứng từ kết chuyển — huỷ ở Kết chuyển lãi/lỗ (ACC6)',
  cogs: 'chứng từ giá vốn — tính lại ở Tính giá vốn (ACC49)',
  depreciation: 'chứng từ khấu hao, phân bổ — tính lại ở ACC31',
  opening: 'số dư đầu kỳ — sửa hoặc huỷ ở Số dư tài khoản (ACC15)',
};

async function reverseActiveEntries(trx: Db, tenantId: string, actor: string, sourceDocumentId: string, reason: string): Promise<number> {
  const active = await ledgerRepository.findActiveEntriesBySource(trx, tenantId, sourceDocumentId);
  return reverseEntries(trx, tenantId, actor, active.map((e) => e.id), reason);
}

async function reverseEntries(trx: Db, tenantId: string, actor: string, ids: string[], reason: string): Promise<number> {
  if (!ids.length) return 0;
  const accounts = await accountRepository.mapByCode(trx, tenantId);
  for (const id of ids) await ledgerService.reverse(trx, tenantId, actor, id, accounts, reason);
  return ids.length;
}

/**
 * Đề xuất huỷ trong giao dịch có sẵn. Loại chứng từ đặt chế độ "Tự động": huỷ luôn (ghi số âm bút toán), như lúc tự định khoản
 * khi phiếu tới; chế độ "Chờ định khoản": vào cổng chờ (Chờ huỷ), kế toán định khoản huỷ ở ACC14.
 * hold: luôn vào Chờ huỷ, không theo chế độ (trợ lý AI chỉ được đề xuất — STD-MCP-6).
 */
export async function requestCancelIn(trx: Db, auth: AuthContext, docKey: string, reason: string, opts: { hold?: boolean } = {}): Promise<{ requested: boolean; reversed: number; cancelled?: boolean }> {
  const row = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, docKey);
  if (!row) throw Errors.notFound(`chứng từ ${docKey}`);
  if (row.status === 'cancelled') return { requested: false, reversed: 0 };
  if (!opts.hold && (await isAutoMode(trx, auth.tenantId, row.doc_type))) {
    const reversed = await reverseActiveEntries(trx, auth.tenantId, auth.actor, row.id, `Huỷ chứng từ: ${reason}`);
    await taxInvoiceRepository.removeForDocument(trx, row.id);
    await inventoryMovementRepository.removeForDocument(trx, row.id);
    await documentRepository.update(trx, row.id, { status: 'cancelled', error_message: reason, cancel_requested_at: null, cancel_reason: null });
    await logPosting(trx, { tenantId: auth.tenantId, eventId: row.id, docType: row.doc_type, docNo: row.doc_no, version: row.version, action: 'cancel', reversed, message: `Tự động huỷ (chế độ Tự động): ${reason}`, actor: auth.actor });
    if (reversed) await emitReversed(trx, auth, row, reversed, 'cancel');
    return { requested: true, reversed, cancelled: true };
  }
  if (row.cancel_requested_at) return { requested: false, reversed: 0 };
  await documentRepository.update(trx, row.id, { status: 'pending', cancel_requested_at: new Date(), cancel_reason: reason });
  await logPosting(trx, { tenantId: auth.tenantId, eventId: row.id, docType: row.doc_type, docNo: row.doc_no, version: row.version, action: 'cancel_request', message: reason, actor: auth.actor });
  return { requested: true, reversed: 0 };
}

/**
 * Lập chứng từ nháp (trợ lý AI, bizcity_mcp@1 §5.2): luôn chờ ở ACC14 dù loại chứng từ đặt chế độ "Tự động" (hold).
 * preview: định khoản thử ngay trong giao dịch (người gọi huỷ giao dịch) để trả bút toán xem trước (STD-MCP-4).
 */
export async function draftDocumentIn(trx: Db, auth: AuthContext, doc: IngestDocument, opts: { preview?: boolean } = {}): Promise<IngestResult> {
  assertTotals(doc);
  return postDocumentIn(trx, auth, doc, opts.preview ? { post: true, force: true } : { hold: true });
}

/** Phát bizcity.ledger.entry.reversed khi huỷ / bỏ định khoản đảo bút toán mà không ghi phiên bản mới. */
function emitReversed(trx: Db, auth: AuthContext, row: { doc_key: string; doc_type: string; doc_no: string; version: number }, reversed: number, reason: 'cancel' | 'unpost') {
  return emitKernelEvent(trx, auth, 'bizcity.ledger.entry.reversed', row.doc_key, { docKey: row.doc_key, docType: row.doc_type, docNo: row.doc_no, version: row.version, reversed, reason });
}

/** Ghi một dòng nhật ký định khoản (posting_log). */
export async function logPosting(trx: Db, v: {
  tenantId: string; eventId: string; docType: string; docNo: string; version: number;
  action: 'receive' | 'post' | 'repost' | 'error' | 'cancel' | 'cancel_request' | 'unpost'; entryIds?: string[]; reversed?: number; total?: number | null; message?: string | null; actor: string;
}): Promise<void> {
  await trx.insertInto('posting_log').values({
    tenant_id: v.tenantId, event_id: v.eventId, doc_type: v.docType, doc_no: v.docNo, version: v.version, action: v.action,
    entry_ids: v.entryIds ?? [], reversed: v.reversed ?? 0, total: v.total === undefined || v.total === null ? null : String(v.total), message: v.message ?? null, actor: v.actor,
  }).execute();
}

/**
 * Nhận và (nếu được) định khoản một chứng từ trong giao dịch có sẵn. Mọi nguồn — kéo qua kết nối (hold: luôn chờ), hệ thống
 * bán hàng đẩy vào cổng chờ, trạm ACC14 định khoản (post) — đều qua đây.
 *
 * 1. Lưu chứng từ gốc: chứng từ mới thì thêm; phiên bản mới thì cất phiên bản cũ (accounting_event_versions) rồi ghi đè.
 *    Danh sách chứng từ (trạm ACC14) luôn thấy nội dung MỚI NHẤT.
 * 2. Định khoản ngay hay chờ: loại chứng từ đặt chế độ "chờ định khoản" (mặc định) thì dừng ở đây — status 'pending',
 *    bút toán của phiên bản cũ (nếu có) vẫn giữ nguyên trong sổ; kế toán định khoản ở trạm (opts.post).
 * 3. Định khoản: đảo (ghi số âm) bút toán đang có hiệu lực, ghi bút toán theo nội dung mới nhất, ghi các bảng phụ
 *    (sổ hoá đơn, số liệu bán hàng, hàng vào / ra kho); posted_version = phiên bản vừa định khoản. Không xoá gì.
 * Mỗi bước ghi nhật ký định khoản (posting_log).
 */
export async function postDocumentIn(trx: Db, auth: AuthContext, doc: IngestDocument, opts: { force?: boolean; post?: boolean; hold?: boolean } = {}): Promise<IngestResult> {
  const branch = await findBranch(trx, auth.tenantId, doc.branchCode);
  const branchId = branch.id;
  const partnerId = await documentPartnerId(trx, auth.tenantId, doc);
  if (doc.employee?.code) await ensureEmployee(trx, auth.tenantId, doc.employee.code, doc.employee.name);
  const stock = await stockContext(trx, auth.tenantId, doc, branch);
  const existing = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, doc.docKey);

  if (existing) {
    if (existing.version > doc.version) {
      throw Errors.conflict(`Đã có phiên bản ${existing.version} mới hơn phiên bản gửi lên (${doc.version})`);
    }
    if (existing.version === doc.version && (existing.status === 'posted' || existing.status === 'pending') && !opts.force && !opts.post) {
      return { docKey: doc.docKey, version: doc.version, status: 'unchanged' as const };
    }
  }

  // Thông tin thuế kế toán đã bổ sung (ACC78): hoá đơn về muộn, sửa ký hiệu, người bán… Nội dung gốc vẫn lưu nguyên.
  // Kế toán xác nhận đã nhận tiền (phiếu chuyển tiền "sent"): ghi như "received" nếu còn khớp nội dung.
  const eff = applyReceiptConfirmation(
    applyTaxPatch(doc, existing ? await loadTaxPatch(trx, existing.id) : undefined),
    existing ? await loadReceiptConfirmation(trx, existing.id) : undefined,
  );
  const fields = {
    source_system: doc.sourceSystem,
    version: doc.version,
    doc_type: doc.docType,
    branch_id: branchId,
    doc_no: doc.docNo,
    doc_date: doc.docDate.slice(0, 10),
    partner_id: partnerId,
    invoice_no: eff.invoice?.no ?? null,
    total: doc.totals.total,
    payload: JSON.stringify(doc),
  };

  let docId: string;
  const newVersion = !existing || existing.version !== doc.version;
  if (existing) {
    docId = existing.id;
    if (existing.version !== doc.version) await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
    // Nguồn gửi lại phiếu (phiên bản mới) sau khi đã báo xoá: phiếu còn → bỏ đánh dấu Chờ huỷ.
    await documentRepository.update(trx, existing.id, { ...fields, received_at: new Date(), ...(newVersion ? { cancel_requested_at: null, cancel_reason: null } : {}) });
  } else {
    docId = (await documentRepository.insert(trx, { tenant_id: auth.tenantId, doc_key: doc.docKey, created_by: auth.actor, ...fields })).id;
  }
  const log = (action: 'receive' | 'post' | 'repost', extra: { entryIds?: string[]; reversed?: number; message?: string } = {}) =>
    logPosting(trx, { tenantId: auth.tenantId, eventId: docId, docType: doc.docType, docNo: doc.docNo, version: doc.version, action, total: doc.totals.total, actor: auth.actor, ...extra });

  // Chưa định khoản: chờ ở trạm ACC14.
  // hold: chứng từ kéo về từ hệ thống kết nối luôn chờ, không theo chế độ định khoản của loại chứng từ.
  if (!opts.post && (opts.hold || (await needsApproval(trx, auth.tenantId, doc.docType)))) {
    await documentRepository.update(trx, docId, { status: 'pending', error_code: null, error_message: null });
    if (newVersion) await log('receive', existing?.posted_version ? { message: `Phiên bản mới; sổ đang theo phiên bản ${existing.posted_version}` } : {});
    return { docKey: doc.docKey, version: doc.version, status: 'pending' as const };
  }

  // Đổi trả chỉ trong cùng một shop: phiếu hoàn được đối trừ phải cùng chi nhánh với đơn bán.
  if (doc.docType === 'sale' && doc.offsets.length) {
    const rets = await trx.selectFrom('accounting_events').select(['doc_no', 'branch_id']).where('tenant_id', '=', auth.tenantId).where('doc_key', 'in', doc.offsets.map((o) => o.docKey)).execute();
    const other = rets.filter((r) => String(r.branch_id) !== String(branchId));
    if (other.length) throw Errors.validation(`Đối trừ phải cùng chi nhánh: phiếu hoàn ${other.map((r) => r.doc_no).join(', ')} thuộc chi nhánh khác`);
  }
  // Định khoản lại chỉ phần thay đổi: bút toán dựng lại trùng dấu vân tay với bút toán đang có hiệu lực thì giữ nguyên
  // (ví dụ thu thêm tiền / đổi hình thức thanh toán: bút toán bán hàng giữ, chỉ bút toán thu tiền đảo và ghi lại).
  const active = await ledgerRepository.findActiveEntriesBySource(trx, auth.tenantId, docId);
  const reuse = new Map<string, string[]>();
  for (const e of active) if (e.content_hash) reuse.set(e.content_hash, [...(reuse.get(e.content_hash) ?? []), String(e.id)]);
  // Trùng phần số liệu, chỉ khác thông tin đầu (vừa có số hoá đơn, đổi diễn giải…): cập nhật tại chỗ, không đảo (0062).
  const reuseBody = new Map<string, string[]>();
  for (const e of active) if (e.body_hash) reuseBody.set(e.body_hash, [...(reuseBody.get(e.body_hash) ?? []), String(e.id)]);
  const kept: string[] = [];
  const updated: string[] = [];
  const entryIds = await postingService.post(trx, eff, {
    tenantId: auth.tenantId,
    actor: auth.actor,
    sourceDocumentId: docId,
    sourceVersion: doc.version,
    branchId,
    partnerId,
    stock,
    reuse,
    reuseBody,
    kept,
    updated,
  });
  const keptSet = new Set(kept);
  const reversed = await reverseEntries(trx, auth.tenantId, auth.actor, active.map((e) => String(e.id)).filter((x) => !keptSet.has(x)), `Định khoản lại theo phiên bản ${doc.version}`);
  await linkReturnToOriginal(trx, auth, doc, entryIds);
  await ensureProducts(trx, auth.tenantId, doc);

  if (hasTaxInvoice(eff) && isTradeDocument(eff)) {
    await taxInvoiceRepository.saveForDocument(trx, { tenantId: auth.tenantId, branchId, sourceDocumentId: docId, partnerId, doc: eff, taxCodes: await loadTaxCodes(trx, auth.tenantId) });
    await applyTaxFlags(trx, docId);
  } else {
    await taxInvoiceRepository.removeForDocument(trx, docId);
  }
  await inventoryMovementRepository.saveForDocument(trx, { tenantId: auth.tenantId, branchId, toBranchId: stock?.toBranchId, eventId: docId, doc, pricedAtSale: await costAtSalePrice(trx, auth.tenantId, doc) });

  // Thanh toán theo hoá đơn: phiếu thanh toán ghép công nợ với đúng hoá đơn nó ghi trả; hoá đơn định khoản sau thì ghép
  // lại các phiếu thanh toán đã nhận trước.
  // Đổi trả: phiếu bán đối trừ phiếu hoàn (offsets) — chỉ đối trừ công nợ, không có tiền thật.
  if (doc.docType === 'customer_payment' || doc.docType === 'supplier_payment') await settleByInvoiceKeys(trx, auth.tenantId, docId, auth.actor);
  else if (isTradeDocument(doc)) {
    if (doc.docType === 'sale') await settleOffsets(trx, auth.tenantId, docId, auth.actor);
    await settleLinkedTo(trx, auth.tenantId, doc.docKey, auth.actor);
  }
  await documentRepository.update(trx, docId, { status: 'posted', posted_at: new Date(), posted_version: doc.version, error_code: null, error_message: null });
  await emitKernelEvent(trx, auth, 'bizcity.ledger.entry.posted', doc.docKey, {
    docKey: doc.docKey, docType: doc.docType, docNo: doc.docNo, version: doc.version, entryIds, reversed, kept: kept.length, total: doc.totals.total,
  });
  const repost = Boolean(active.length);
  await log(repost ? 'repost' : 'post', { entryIds, reversed, message: repost ? (kept.length ? `Giữ ${kept.length} bút toán${updated.length ? ` (cập nhật thông tin đầu ${updated.length}: số hoá đơn, diễn giải…)` : ' không đổi'}${entryIds.length ? `; đảo ${reversed}, ghi ${entryIds.length} bút toán mới` : '; không có gì thay đổi'}` : `Đảo ${reversed}, ghi ${entryIds.length} bút toán mới`) : undefined });
  return { docKey: doc.docKey, version: doc.version, status: 'posted' as const, entryIds, kept: kept.length, updated: updated.length, reversed };
}

async function processDocument(auth: AuthContext, doc: IngestDocument, opts: { force?: boolean; post?: boolean } = {}): Promise<IngestResult> {
  assertTotals(doc);
  try {
    return await db.transaction().execute((trx) => postDocumentIn(trx, auth, doc, opts));
  } catch (err) {
    if (!(err instanceof AppError) || err.code === 'CONFLICT' || err.code === 'VALIDATION_ERROR') throw err;
    await recordFailure(auth, doc, err);
    return { docKey: doc.docKey, version: doc.version, status: 'error', error: { code: err.code, message: describe(err) } };
  }
}

function describe(err: AppError): string {
  const details = Array.isArray(err.details) ? `: ${err.details.join('; ')}` : '';
  return `${err.message}${details}`;
}

/** Lưu chứng từ ở trạng thái lỗi định khoản (giữ nguyên bút toán cũ nếu có) và ghi nhật ký. */
async function recordFailure(auth: AuthContext, doc: IngestDocument, err: AppError): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const branchId = await findBranchId(trx, auth.tenantId, doc.branchCode);
    const existing = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, doc.docKey);
    const fields = {
      version: doc.version,
      doc_type: doc.docType,
      branch_id: branchId,
      doc_no: doc.docNo,
      doc_date: doc.docDate.slice(0, 10),
      invoice_no: doc.invoice?.no ?? null,
      total: doc.totals.total,
      payload: JSON.stringify(doc),
    };
    let id: string;
    if (existing) {
      id = existing.id;
      if (existing.version !== doc.version) await documentRepository.archiveVersion(trx, existing.id, existing.version, existing.payload, existing.received_at);
      await documentRepository.update(trx, existing.id, { ...fields, status: 'error', error_code: err.code, error_message: describe(err) });
    } else {
      const created = await documentRepository.insert(trx, { tenant_id: auth.tenantId, doc_key: doc.docKey, source_system: doc.sourceSystem, partner_id: null, created_by: auth.actor, ...fields });
      id = created.id;
      await documentRepository.update(trx, created.id, { status: 'error', error_code: err.code, error_message: describe(err) });
    }
    await logPosting(trx, { tenantId: auth.tenantId, eventId: id, docType: doc.docType, docNo: doc.docNo, version: doc.version, action: 'error', total: doc.totals.total, message: describe(err), actor: auth.actor });
  });
}

/** Tên người làm (user:<id> → họ tên, apikey:<id> → tên khoá API). */
async function actorNames(tenantId: string, actors: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = (kind: string) => actors.filter((a) => a.startsWith(`${kind}:`)).map((a) => a.slice(kind.length + 1)).filter((x) => /^\d+$/.test(x));
  const users = ids('user');
  const keys = ids('apikey');
  if (users.length) for (const u of await db.selectFrom('users').select(['id', 'full_name']).where('tenant_id', '=', tenantId).where('id', 'in', users).execute()) out.set(`user:${u.id}`, u.full_name);
  if (keys.length) for (const k of await db.selectFrom('api_keys').select(['id', 'name']).where('tenant_id', '=', tenantId).where('id', 'in', keys).execute()) out.set(`apikey:${k.id}`, k.name);
  return out;
}

export const documentService = {
  /** Nhận một chứng từ (dữ liệu thô từ API). */
  async ingest(auth: AuthContext, input: unknown): Promise<IngestResult> {
    // Đẩy vào bằng khoá API: chuẩn hoá như chứng từ kéo qua kết nối cùng mã nguồn (đổi hình thức thanh toán…).
    const prep = auth.kind === 'apikey' ? await connectionService.prepareIncoming(auth.tenantId, input) : { doc: input };
    const raw = prep.doc;
    if (prep.skip) return { docKey: String((raw as { docKey?: unknown })?.docKey ?? '?'), version: Number((raw as { version?: unknown })?.version ?? 1), status: 'unchanged' };
    const parsed = ingestDocumentSchema.safeParse(raw);
    if (!parsed.success) throw Errors.validation('Chứng từ không đúng khuôn', parsed.error.flatten());
    return processDocument(auth, parsed.data);
  },

  /** Nhận nhiều chứng từ; mỗi chứng từ xử lý độc lập, lỗi chứng từ này không chặn chứng từ khác. */
  async ingestBatch(auth: AuthContext, raws: unknown[]): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const raw of raws) {
      const key = (raw as { docKey?: string })?.docKey ?? '?';
      const version = Number((raw as { version?: number })?.version ?? 1);
      try {
        results.push(await documentService.ingest(auth, raw));
      } catch (err) {
        const e = err instanceof AppError ? err : Errors.posting((err as Error).message);
        results.push({ docKey: key, version, status: 'error', error: { code: e.code, message: describe(e) } });
      }
    }
    return results;
  },

  /**
   * Trạm định khoản (ACC14): định khoản các chứng từ đã chọn theo nội dung mới nhất.
   *   repost = false: chứng từ chờ định khoản / lỗi định khoản (chứng từ đã định khoản đúng phiên bản thì bỏ qua);
   *   repost = true : định khoản lại cả chứng từ đã định khoản (sau khi sửa cấu hình hạch toán).
   * Bút toán cũ được đảo bằng ghi số âm (lưu vết, có liên kết), không xoá. Mỗi chứng từ một giao dịch; chứng từ lỗi
   * chuyển sang trạng thái Lỗi định khoản, không chặn chứng từ khác. Phiếu thu chi, phiếu kế toán sửa ở chính phiếu.
   */
  async postMany(auth: AuthContext, ids: string[], repost: boolean): Promise<{ posted: number; unchanged: number; skipped: { docNo: string; message: string }[]; errors: { docNo: string; message: string }[] }> {
    let posted = 0;
    // Định khoản lại mà bút toán dựng lại trùng hệt bút toán đang có hiệu lực: giữ nguyên, không đảo / ghi lại.
    let unchanged = 0;
    const skipped: { docNo: string; message: string }[] = [];
    const errors: { docNo: string; message: string }[] = [];
    for (const id of ids) {
      const row = await documentRepository.findById(db, auth.tenantId, id);
      if (!row) { errors.push({ docNo: id, message: 'Không tìm thấy chứng từ' }); continue; }
      if (row.status === 'cancelled') { skipped.push({ docNo: row.doc_no, message: 'Chứng từ đã huỷ' }); continue; }
      if (row.cancel_requested_at) {
        // Chờ huỷ (phiếu đã xoá ở nguồn): định khoản = huỷ chứng từ.
        try {
          await documentService.cancel(auth, row.doc_key, row.cancel_reason || 'Phiếu đã xoá ở hệ thống nguồn');
          posted++;
        } catch (e) {
          errors.push({ docNo: row.doc_no, message: e instanceof AppError ? describe(e) : (e as Error).message });
        }
        continue;
      }
      if (!repost && row.status === 'posted' && row.posted_version === row.version) { skipped.push({ docNo: row.doc_no, message: 'Đã định khoản (dùng Định khoản lại nếu cần)' }); continue; }
      const parsed = ingestDocumentSchema.safeParse(row.payload);
      if (!parsed.success) { skipped.push({ docNo: row.doc_no, message: 'Phiếu lập trong phần mềm kế toán (thu chi, phiếu kế toán…): sửa và ghi ở chính phiếu' }); continue; }
      try {
        const res = await db.transaction().execute(async (trx) => {
          await assertDateRules(trx, auth, 'lập', [row.doc_date]);
          return postDocumentIn(trx, auth, { ...parsed.data, version: row.version }, { post: true, force: true });
        });
        if ('kept' in res && res.kept && !res.entryIds?.length && !res.reversed && !res.updated) unchanged++;
        else posted++;
      } catch (e) {
        const msg = e instanceof AppError ? describe(e) : (e as Error).message;
        if (e instanceof AppError && e.code !== 'VALIDATION_ERROR' && e.code !== 'CONFLICT') await recordFailure(auth, { ...parsed.data, version: row.version }, e);
        errors.push({ docNo: row.doc_no, message: msg });
      }
    }
    return { posted, unchanged, skipped, errors };
  },

  /**
   * Kế toán xác nhận nơi nhận đã nhận tiền của phiếu chuyển tiền "sent" (chỉ người dùng, không qua khoá API — nhân
   * viên cửa hàng / hệ thống bán hàng không xác nhận). Lưu xác nhận kèm số tiền, chi nhánh nhận, ngân hàng nhận rồi định
   * khoản (lại) ngay: thêm bút toán nơi nhận.
   */
  async confirmReceipt(auth: AuthContext, id: string, note = '') {
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ kế toán (người dùng đăng nhập) mới xác nhận đã nhận tiền');
    const row = await documentRepository.findById(db, auth.tenantId, id);
    if (!row) throw Errors.notFound('chứng từ');
    if (row.doc_type !== 'cash_transfer') throw Errors.validation('Chỉ phiếu chuyển tiền mới xác nhận đã nhận tiền');
    if (row.status === 'cancelled' || row.cancel_requested_at) throw Errors.validation('Phiếu đã huỷ / chờ huỷ: không xác nhận được');
    const parsed = ingestDocumentSchema.safeParse(row.payload);
    if (!parsed.success || parsed.data.docType !== 'cash_transfer') throw Errors.validation('Nội dung phiếu chuyển tiền không hợp lệ');
    const doc = parsed.data;
    if (doc.toBranchCode === doc.branchCode) throw Errors.validation('Chuyển tiền trong một chi nhánh không cần xác nhận nhận tiền');
    if (doc.status === 'received') throw Errors.validation('Hệ thống nguồn đã báo nơi nhận nhận tiền: không cần xác nhận');
    const before = await loadReceiptConfirmation(db, row.id);
    if (before && confirmationMatches(doc, before)) throw Errors.conflict(`Phiếu ${row.doc_no} đã được xác nhận lúc ${before.confirmedAt} bởi ${before.confirmedBy}`);
    await db.transaction().execute(async (trx) => {
      const values = { amount: doc.totals.total, to_branch_code: doc.toBranchCode, to_bank_code: doc.toBankCode ?? '', note: note.trim(), confirmed_by: auth.actorName, confirmed_at: new Date() };
      await trx.insertInto('cash_transfer_confirmations').values({ tenant_id: auth.tenantId, event_id: row.id, ...values })
        .onConflict((oc) => oc.column('event_id').doUpdateSet(values)).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cash_transfer.confirm_receipt', objectType: 'accounting_event', objectId: row.doc_no, before: before ?? null, after: values });
    });
    return { confirmed: true, posting: await documentService.postMany(auth, [row.id], true) };
  },

  /** Bỏ xác nhận đã nhận tiền (xác nhận nhầm): định khoản lại, bút toán nơi nhận bị đảo. */
  async unconfirmReceipt(auth: AuthContext, id: string) {
    if (auth.kind !== 'user') throw Errors.forbidden('Chỉ kế toán (người dùng đăng nhập) mới bỏ xác nhận');
    const row = await documentRepository.findById(db, auth.tenantId, id);
    if (!row) throw Errors.notFound('chứng từ');
    const before = await loadReceiptConfirmation(db, row.id);
    if (!before) throw Errors.validation(`Phiếu ${row.doc_no} chưa được xác nhận`);
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('cash_transfer_confirmations').where('event_id', '=', row.id).execute();
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'cash_transfer.unconfirm_receipt', objectType: 'accounting_event', objectId: row.doc_no, before, after: null });
    });
    const posting = row.status === 'cancelled' ? null : await documentService.postMany(auth, [row.id], true);
    return { confirmed: false, posting };
  },

  /**
   * Màn Q2 "Phiếu chuyển tiền" (phân hệ Quỹ): phiếu chuyển tiền giữa chi nhánh trong khoảng ngày, kèm trạng thái nhận
   * tiền — waiting (chờ kế toán xác nhận) · confirmed (kế toán đã xác nhận) · invalid (xác nhận cũ hết hiệu lực vì phiếu
   * đã đổi) · source (hệ thống nguồn đã báo nhận). Chi nhánh lọc theo nơi chuyển HOẶC nơi nhận. Không lấy phiếu đã huỷ.
   */
  async listCashTransfers(auth: AuthContext, q: { from: string; to: string; branchCodes?: string[]; receipt?: 'waiting' | 'confirmed' | 'all' }) {
    const rows = await sql<{ id: string; doc_key: string; doc_no: string; doc_date: string; status: string; version: number; posted_version: number | null; error_message: string | null;
      cancel_requested_at: Date | null; branch_code: string; branch_name: string; payload: Record<string, unknown>; total: string;
      c_amount: string | null; c_to_branch: string | null; c_to_bank: string | null; c_note: string | null; c_by: string | null; c_at: Date | null }>`
      SELECT d.id, d.doc_key, d.doc_no, d.doc_date::text AS doc_date, d.status, d.version, d.posted_version, d.error_message, d.cancel_requested_at,
             b.code AS branch_code, b.name AS branch_name, d.payload, d.total,
             c.amount AS c_amount, c.to_branch_code AS c_to_branch, c.to_bank_code AS c_to_bank, c.note AS c_note, c.confirmed_by AS c_by, c.confirmed_at AS c_at
        FROM accounting_events d
        JOIN branches b ON b.id = d.branch_id
        LEFT JOIN cash_transfer_confirmations c ON c.event_id = d.id
       WHERE d.tenant_id = ${auth.tenantId} AND d.doc_type = 'cash_transfer' AND d.status <> 'cancelled'
         AND d.doc_date BETWEEN ${q.from}::date AND ${q.to}::date
         ${q.branchCodes?.length ? sql`AND (b.code IN (${sql.join(q.branchCodes)}) OR d.payload->>'toBranchCode' IN (${sql.join(q.branchCodes)}))` : sql``}
       ORDER BY d.doc_date DESC, d.id DESC`.execute(db);
    const toNames = new Map((await db.selectFrom('branches').select(['code', 'name']).where('tenant_id', '=', auth.tenantId)
      .where('code', 'in', [...new Set(rows.rows.map((r) => String(r.payload?.toBranchCode ?? '')).filter(Boolean)), '-']).execute()).map((b) => [b.code, b.name]));
    const out = rows.rows.map((r) => {
      const p = r.payload as Record<string, string | undefined>;
      const parsed = ingestDocumentSchema.safeParse(r.payload);
      const c = r.c_by !== null ? { amount: toNumber(r.c_amount ?? 0), toBranchCode: r.c_to_branch ?? '', toBankCode: r.c_to_bank ?? '', note: r.c_note ?? '', confirmedBy: r.c_by, confirmedAt: isoTime(r.c_at) } : null;
      const valid = Boolean(c && parsed.success && confirmationMatches(parsed.data, c));
      const sameBranch = p.toBranchCode === r.branch_code;
      const receipt = p.status === 'received' || sameBranch ? 'source' : valid ? 'confirmed' : c ? 'invalid' : 'waiting';
      return {
        id: String(r.id), docKey: r.doc_key, docNo: r.doc_no, docDate: r.doc_date, status: r.status, version: r.version, postedVersion: r.posted_version,
        errorMessage: r.error_message, cancelRequestedAt: r.cancel_requested_at,
        fromBranchCode: r.branch_code, fromBranchName: r.branch_name, toBranchCode: p.toBranchCode ?? '', toBranchName: toNames.get(p.toBranchCode ?? '') ?? '',
        fromBankCode: p.fromBankCode ?? '', toBankCode: p.toBankCode ?? '', fromMethodCode: p.fromMethodCode ?? 'TM', toMethodCode: p.toMethodCode ?? 'TM',
        reasonCode: p.reasonCode ?? '', toReasonCode: p.toReasonCode ?? '', description: p.description ?? '', total: toNumber(r.total),
        receipt, confirmedBy: valid ? c!.confirmedBy : null, confirmedAt: valid ? c!.confirmedAt : null, confirmNote: valid ? c!.note : null,
      };
    });
    return q.receipt === 'waiting' ? out.filter((r) => r.receipt === 'waiting' || r.receipt === 'invalid')
      : q.receipt === 'confirmed' ? out.filter((r) => r.receipt === 'confirmed' || r.receipt === 'source') : out;
  },

  /** Xác nhận đã nhận tiền nhiều phiếu một lần (màn Q2): từng phiếu một, lỗi phiếu nào ghi phiếu đó. */
  async confirmReceipts(auth: AuthContext, ids: string[], note = '') {
    let confirmed = 0;
    const errors: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        const r = await documentService.confirmReceipt(auth, id, note);
        if (r.posting.errors.length) errors.push({ id, message: r.posting.errors.map((e) => `${e.docNo}: ${e.message}`).join('; ') });
        else confirmed++;
      } catch (e) {
        errors.push({ id, message: e instanceof AppError ? describe(e) : (e as Error).message });
      }
    }
    return { confirmed, errors };
  },

  /** Xác nhận nhận tiền theo docKey (hệ thống bán hàng đọc để hiện "Kế toán đã xác nhận" và khoá sửa phiếu). */
  async receiptConfirmations(auth: AuthContext, docKeys: string[]) {
    if (!docKeys.length) return [];
    const rows = await db
      .selectFrom('cash_transfer_confirmations as c')
      .innerJoin('accounting_events as d', 'd.id', 'c.event_id')
      .select(['d.doc_key', 'd.payload', 'c.amount', 'c.to_branch_code', 'c.to_bank_code', 'c.note', 'c.confirmed_by', 'c.confirmed_at'])
      .where('c.tenant_id', '=', auth.tenantId)
      .where('d.doc_key', 'in', docKeys)
      .execute();
    return rows.map((r) => {
      const parsed = ingestDocumentSchema.safeParse(r.payload);
      const c = { amount: toNumber(r.amount), toBranchCode: r.to_branch_code, toBankCode: r.to_bank_code, note: r.note, confirmedBy: r.confirmed_by, confirmedAt: isoTime(r.confirmed_at) };
      return { docKey: r.doc_key, ...c, valid: parsed.success && confirmationMatches(parsed.data, c) };
    });
  },

  /**
   * Xem trước định khoản (ACC14): chạy đúng quy trình định khoản của chứng từ (nội dung mới nhất, cấu hình hiện tại)
   * trong một giao dịch rồi HUỶ giao dịch — không ghi gì, không cấp số bút toán. Trả về các bút toán sẽ ghi (kèm số
   * bút toán đang có hiệu lực sẽ bị đảo), dòng hàng vào / ra kho, có lên sổ hoá đơn không; lỗi cấu hình thì trả lỗi.
   */
  async preview(auth: AuthContext, id: string) {
    const row = await documentRepository.findById(db, auth.tenantId, id);
    if (!row) throw Errors.notFound('chứng từ');
    const parsed = ingestDocumentSchema.safeParse(row.payload);
    if (!parsed.success) throw Errors.validation('Phiếu lập trong phần mềm kế toán (thu chi, phiếu kế toán…) ghi sổ ngay ở chính phiếu, không xem trước ở đây');
    const willReverse = Number((await db.selectFrom('ledger_entries').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('tenant_id', '=', auth.tenantId).where('event_id', '=', id).where('status', '=', 'posted').where('is_reversal', '=', false).executeTakeFirstOrThrow()).n);
    if (row.cancel_requested_at) {
      const moves = await db.selectFrom('inventory_movements').select((eb) => eb.fn.countAll<string>().as('n')).where('event_id', '=', id).executeTakeFirstOrThrow();
      const invoice = await db.selectFrom('tax_invoices').select(['invoice_no', 'invoice_serial', 'invoice_date']).where('event_id', '=', id).executeTakeFirst();
      return {
        ok: true, cancel: true, cancelReason: row.cancel_reason, version: row.version, postedVersion: row.posted_version, willReverse, willKeep: 0,
        removeMovements: Number(moves.n), entries: [], movements: [],
        invoice: invoice ? { no: invoice.invoice_no, serial: invoice.invoice_serial, date: invoice.invoice_date } : null,
      };
    }
    class Rollback extends Error { constructor(readonly data: unknown) { super('rollback'); } }
    try {
      await db.transaction().execute(async (trx) => {
        const res = await postDocumentIn(trx, auth, { ...parsed.data, version: row.version }, { post: true, force: true });
        const ids = res.entryIds ?? [];
        const entries = ids.length ? await trx.selectFrom('ledger_entries as e').innerJoin('branches as b', 'b.id', 'e.branch_id')
          .select(['e.id', 'e.posting_date', 'e.description', 'e.total', 'e.doc_type', 'e.doc_no', 'b.code as branch_code']).where('e.id', 'in', ids).orderBy('e.id').execute() : [];
        const lines = ids.length ? await trx.selectFrom('ledger_lines as l')
          .innerJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'l.tenant_id').onRef('a.code', '=', 'l.account_code'))
          .leftJoin('partners as p', 'p.id', 'l.partner_id')
          .select(['l.entry_id', 'l.line_no', 'l.pair_no', 'l.account_code', 'a.name as account_name', 'l.debit', 'l.credit', 'l.part', 'l.tax_code', 'l.description', 'l.product_sku', 'p.code as partner_code', 'p.name as partner_name', 'l.dims'])
          .where('l.entry_id', 'in', ids).orderBy('l.entry_id').orderBy('l.line_no').execute() : [];
        const moves = await trx.selectFrom('inventory_movements as m').innerJoin('branches as b', 'b.id', 'm.branch_id')
          .select(['b.code as branch_code', 'm.kind', 'm.sku', 'm.name', 'm.qty', 'm.amount']).where('m.event_id', '=', id).orderBy('m.line_no').execute();
        const invoice = await trx.selectFrom('tax_invoices').select(['invoice_no', 'invoice_serial', 'invoice_date']).where('event_id', '=', id).executeTakeFirst();
        throw new Rollback({
          ok: true, version: row.version, postedVersion: row.posted_version, willReverse: res.reversed ?? 0, willKeep: res.kept ?? 0,
          entries: entries.map((e) => ({
            branchCode: e.branch_code, postingDate: e.posting_date, description: e.description, total: toNumber(e.total), docType: e.doc_type, docNo: e.doc_no,
            lines: lines.filter((l) => String(l.entry_id) === String(e.id)).map((l) => ({
              pairNo: l.pair_no, accountCode: l.account_code, accountName: l.account_name, debit: toNumber(l.debit), credit: toNumber(l.credit),
              part: l.part, taxCode: l.tax_code, description: l.description, sku: l.product_sku, partnerCode: l.partner_code, partnerName: l.partner_name, dims: l.dims,
            })),
          })),
          movements: moves.map((m) => ({ branchCode: m.branch_code, kind: m.kind, sku: m.sku, name: m.name, qty: toNumber(m.qty), amount: m.amount === null ? null : toNumber(m.amount) })),
          invoice: invoice ? { no: invoice.invoice_no, serial: invoice.invoice_serial, date: invoice.invoice_date } : null,
        });
      });
    } catch (e) {
      if (e instanceof Rollback) return e.data;
      if (e instanceof AppError && e.code !== 'VALIDATION_ERROR') return { ok: false, version: row.version, postedVersion: row.posted_version, willReverse, error: describe(e) };
      throw e;
    }
    throw Errors.posting('Không xem trước được');
  },

  /** Nhật ký định khoản: của một chứng từ (eventId) hoặc theo khoảng ngày, loại chứng từ, hành động, chi nhánh. */
  async postingLog(auth: AuthContext, q: { eventId?: string; from?: string; to?: string; docType?: string; action?: string; branchCodes?: string[]; limit?: number }) {
    let query = db.selectFrom('posting_log as g')
      .innerJoin('accounting_events as d', 'd.id', 'g.event_id')
      .innerJoin('branches as b', 'b.id', 'd.branch_id')
      .select(['g.id', 'g.event_id', 'g.doc_type', 'g.doc_no', 'g.version', 'g.action', 'g.entry_ids', 'g.reversed', 'g.total', 'g.message', 'g.actor', 'g.created_at', 'b.code as branch_code', 'd.status as doc_status', 'd.version as doc_version'])
      .where('g.tenant_id', '=', auth.tenantId);
    if (q.eventId) query = query.where('g.event_id', '=', q.eventId);
    if (q.from) query = query.where('g.created_at', '>=', new Date(`${q.from}T00:00:00+07:00`));
    if (q.to) query = query.where('g.created_at', '<', new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 86_400_000));
    if (q.docType) query = query.where('g.doc_type', '=', q.docType);
    if (q.action) query = query.where('g.action', '=', q.action as 'post');
    if (q.branchCodes?.length) query = query.where('b.code', 'in', q.branchCodes);
    const rows = await query.orderBy('g.created_at', 'desc').orderBy('g.id', 'desc').limit(Math.min(q.limit ?? 5000, 20000)).execute();
    const actors = await actorNames(auth.tenantId, [...new Set(rows.map((r) => r.actor))]);
    const entryNos = new Map<string, string>();
    const allIds = [...new Set(rows.flatMap((r) => r.entry_ids))];
    for (let i = 0; i < allIds.length; i += 1000) {
      for (const e of await db.selectFrom('ledger_entries').select(['id', 'entry_no']).where('id', 'in', allIds.slice(i, i + 1000)).execute()) entryNos.set(String(e.id), e.entry_no);
    }
    return rows.map((r) => ({
      id: r.id, eventId: r.event_id, docType: r.doc_type, docNo: r.doc_no, version: r.version, action: r.action, branchCode: r.branch_code,
      entryNos: r.entry_ids.map((x) => entryNos.get(String(x)) ?? String(x)), reversed: r.reversed, total: r.total === null ? null : toNumber(r.total),
      message: r.message, actor: r.actor, actorName: actors.get(r.actor) ?? r.actor, createdAt: r.created_at, docStatus: r.doc_status, docVersion: r.doc_version,
    }));
  },

  /**
   * Hệ thống nguồn báo phiếu đã xoá: KHÔNG huỷ ngay mà đưa chứng từ về cổng chờ ở trạng thái Chờ huỷ (sổ giữ nguyên),
   * ghi nhật ký; kế toán xem trước rồi định khoản mới huỷ. Chứng từ đã huỷ / đã chờ huỷ thì thôi.
   */
  async requestCancel(auth: AuthContext, docKey: string, reason: string): Promise<{ requested: boolean; reversed: number; cancelled?: boolean }> {
    return db.transaction().execute((trx) => requestCancelIn(trx, auth, docKey, reason));
  },

  /** Huỷ chứng từ: đảo bút toán, bỏ khỏi sổ hoá đơn. */
  async cancel(auth: AuthContext, docKey: string, reason: string): Promise<{ reversed: number }> {
    return db.transaction().execute(async (trx) => {
      const row = await documentRepository.findByKeyForUpdate(trx, auth.tenantId, docKey);
      if (!row) throw Errors.notFound(`chứng từ ${docKey}`);
      if (row.status === 'cancelled') return { reversed: 0 };
      assertCanModify(auth, row, 'huỷ');
      await assertDateRules(trx, auth, 'huỷ', [row.doc_date]);
      const reversed = await reverseActiveEntries(trx, auth.tenantId, auth.actor, row.id, `Huỷ chứng từ: ${reason}`);
      await taxInvoiceRepository.removeForDocument(trx, row.id);
      await inventoryMovementRepository.removeForDocument(trx, row.id);
      await documentRepository.update(trx, row.id, { status: 'cancelled', error_message: reason });
      await logPosting(trx, { tenantId: auth.tenantId, eventId: row.id, docType: row.doc_type, docNo: row.doc_no, version: row.version, action: 'cancel', reversed, message: reason, actor: auth.actor });
      if (reversed) await emitReversed(trx, auth, row, reversed, 'cancel');
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'document.cancel', objectType: 'source_document', objectId: docKey, after: { reason } });
      return { reversed };
    });
  },

  /**
   * Bỏ định khoản (nút Xoá ở màn Chứng từ kế toán — HTsoft xoá bút toán, giữ phiếu gốc): đảo bút toán đang hiệu lực, gỡ sổ
   * hoá đơn / biến động kho như khi huỷ, nhưng chứng từ về "Chờ định khoản" (ACC14) để định khoản lại thay vì huỷ.
   * Chỉ chứng từ do hệ thống nguồn gửi sang (định khoản lại được ở ACC14); phiếu lập tay, kết chuyển, giá vốn, khấu hao… thì
   * sửa / huỷ ở màn của chúng.
   */
  async unpost(auth: AuthContext, id: string, reason: string): Promise<{ reversed: number }> {
    return db.transaction().execute(async (trx) => {
      const found = await documentRepository.findById(trx, auth.tenantId, id);
      if (!found) throw Errors.notFound('chứng từ');
      const row = (await documentRepository.findByKeyForUpdate(trx, auth.tenantId, found.doc_key))!;
      if (row.source_system === 'manual') throw Errors.validation(`${row.doc_no}: ${UNPOST_ELSEWHERE[row.doc_type] ?? 'phiếu lập tay — sửa hoặc huỷ ở màn phiếu của nó'}`);
      if (row.status === 'cancelled') throw Errors.validation(`${row.doc_no}: chứng từ đã huỷ`);
      assertCanModify(auth, row, 'huỷ');
      await assertDateRules(trx, auth, 'huỷ', [row.doc_date]);
      const reversed = await reverseActiveEntries(trx, auth.tenantId, auth.actor, row.id, `Bỏ định khoản: ${reason}`);
      await taxInvoiceRepository.removeForDocument(trx, row.id);
      await inventoryMovementRepository.removeForDocument(trx, row.id);
      await documentRepository.update(trx, row.id, { status: 'pending', posted_at: null, posted_version: null, error_message: `Bỏ định khoản: ${reason}` });
      await logPosting(trx, { tenantId: auth.tenantId, eventId: row.id, docType: row.doc_type, docNo: row.doc_no, version: row.version, action: 'unpost', reversed, message: reason, actor: auth.actor });
      if (reversed) await emitReversed(trx, auth, row, reversed, 'unpost');
      await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'document.unpost', objectType: 'source_document', objectId: row.doc_key, after: { reason, reversed } });
      return { reversed };
    });
  },

  list(auth: AuthContext, f: DocumentListFilter) {
    return documentRepository.list(db, auth.tenantId, f);
  },

  /** Chi tiết chứng từ: nội dung gốc + các bút toán (kể cả bút toán đã đảo). */
  async get(auth: AuthContext, id: string) {
    const row = await documentRepository.findById(db, auth.tenantId, id);
    if (!row) throw Errors.notFound('chứng từ');
    const entries = await db
      .selectFrom('ledger_entries as e')
      .select(['e.id', 'e.entry_no', 'e.posting_date', 'e.status', 'e.reverses_entry_id', 'e.description', 'e.total', 'e.event_version'])
      .where('e.tenant_id', '=', auth.tenantId)
      .where('e.event_id', '=', id)
      .orderBy('e.created_at')
      .execute();
    const lines = entries.length
      ? await db
          .selectFrom('ledger_lines as l')
          .innerJoin('accounts as a', (j) => j.onRef('a.tenant_id', '=', 'l.tenant_id').onRef('a.code', '=', 'l.account_code'))
          .select(['l.entry_id', 'l.line_no', 'l.pair_no', 'l.account_code', 'a.name as account_name', 'l.debit', 'l.credit', 'l.part', 'l.tax_code', 'l.description', 'l.product_sku'])
          .where('l.entry_id', 'in', entries.map((e) => e.id))
          .orderBy('l.entry_id')
          .orderBy('l.line_no')
          .execute()
      : [];
    const branch = await db.selectFrom('branches').select(['code', 'name']).where('id', '=', row.branch_id).executeTakeFirst();
    const [kind, actorId] = (row.created_by ?? '').split(':');
    const createdByName = kind === 'user' && actorId
      ? (await db.selectFrom('users').select('full_name').where('tenant_id', '=', auth.tenantId).where('id', '=', actorId).executeTakeFirst())?.full_name
      : kind === 'apikey' && actorId
        ? (await db.selectFrom('api_keys').select('name').where('tenant_id', '=', auth.tenantId).where('id', '=', actorId).executeTakeFirst())?.name
        : undefined;
    let canModify = true;
    try { assertCanModify(auth, row, 'sửa'); } catch { canModify = false; }
    let modifyBlockedReason: string | null = null;
    if (canModify && auth.kind === 'user') {
      const t = await db.selectFrom('tenants').select('settings').where('id', '=', auth.tenantId).executeTakeFirstOrThrow();
      modifyBlockedReason = dateRuleViolation(readDataLock(t.settings), auth, 'sửa', [row.doc_date]);
      if (modifyBlockedReason) canModify = false;
    }
    // Phiếu trả hàng: kèm số chứng từ của phiếu gốc (khoá phiếu gốc chỉ mang mã nội bộ của hệ thống bán hàng).
    const p = row.payload as Record<string, unknown>;
    const originalKey = typeof p?.originalDocKey === 'string' ? p.originalDocKey : null;
    const originalDocNo = originalKey && !p.originalDocNo
      ? (await db.selectFrom('accounting_events').select('doc_no').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', originalKey).executeTakeFirst())?.doc_no
      : undefined;
    // Phiếu bán / hoàn: các phiếu thanh toán khách hàng trỏ về phiếu này (invoiceDocKey) và phần đối trừ đổi trả (offsets).
    let linkedPayments: { id: string; docNo: string; docDate: string; methodCode: string; amount: number; direction: string; status: string }[] = [];
    let offsets: { docKey: string; docNo: string | null; amount: number; id?: string; docDate?: string; status?: string }[] = [];
    // Phiếu hoàn: các phiếu bán đổi trả đã đối trừ vào phiếu hoàn này (offsets của phiếu bán trỏ về).
    let offsetBy: { id: string; docNo: string; docDate: string; amount: number; status: string }[] = [];
    // Phiếu thanh toán: các hoá đơn mà phiếu này thanh toán (invoiceDocKey từng dòng).
    let linkedInvoices: { id: string | null; docKey: string; docNo: string | null; docDate: string | null; docType: string | null; invoiceNo: string | null; total: number | null; status: string | null; amount: number }[] = [];
    if (row.doc_type === 'sale' || row.doc_type === 'sale_return') {
      const pays = await sql<{ id: string; doc_no: string; doc_date: string; method: string | null; amount: string | null; direction: string | null; status: string }>`
        SELECT pay.id, pay.doc_no, pay.doc_date::text AS doc_date, pay.payload->>'methodCode' AS method, l.j->>'amount' AS amount,
               pay.payload->>'direction' AS direction, pay.status
          FROM accounting_events pay
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pay.payload->'lines', '[]'::jsonb)) AS l(j)
         WHERE pay.tenant_id = ${auth.tenantId} AND pay.doc_type = 'customer_payment' AND pay.status <> 'cancelled'
           AND l.j->>'invoiceDocKey' = ${row.doc_key}
         ORDER BY pay.doc_date, pay.id`.execute(db);
      linkedPayments = pays.rows.map((x) => ({ id: String(x.id), docNo: x.doc_no, docDate: x.doc_date, methodCode: x.method ?? '', amount: toNumber(x.amount ?? 0), direction: x.direction ?? 'in', status: x.status }));
      const raw = ((p?.offsets as { docKey?: string; amount?: number }[] | undefined) ?? []).filter((o) => o.docKey);
      if (raw.length) {
        const found = new Map((await db.selectFrom('accounting_events').select(['id', 'doc_key', 'doc_no', 'doc_date', 'status']).where('tenant_id', '=', auth.tenantId).where('doc_key', 'in', raw.map((o) => o.docKey!)).execute()).map((x) => [x.doc_key, x]));
        offsets = raw.map((o) => {
          const f = found.get(o.docKey!);
          return { docKey: o.docKey!, docNo: f?.doc_no ?? null, amount: Number(o.amount ?? 0), id: f ? String(f.id) : undefined, docDate: f ? String(f.doc_date).slice(0, 10) : undefined, status: f?.status };
        });
      }
      if (row.doc_type === 'sale_return') {
        const by = await sql<{ id: string; doc_no: string; doc_date: string; amount: string | null; status: string }>`
          SELECT s.id, s.doc_no, s.doc_date::text AS doc_date, o.j->>'amount' AS amount, s.status
            FROM accounting_events s
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payload->'offsets', '[]'::jsonb)) AS o(j)
           WHERE s.tenant_id = ${auth.tenantId} AND s.doc_type = 'sale' AND s.status <> 'cancelled' AND o.j->>'docKey' = ${row.doc_key}
           ORDER BY s.doc_date, s.id`.execute(db);
        offsetBy = by.rows.map((x) => ({ id: String(x.id), docNo: x.doc_no, docDate: x.doc_date, amount: toNumber(x.amount ?? 0), status: x.status }));
      }
    }
    if (row.doc_type === 'customer_payment' || row.doc_type === 'supplier_payment') {
      const lines = ((p?.lines as { invoiceDocKey?: string; amount?: number }[] | undefined) ?? []).filter((l) => l.invoiceDocKey);
      if (lines.length) {
        const inv = new Map((await db.selectFrom('accounting_events').select(['id', 'doc_key', 'doc_no', 'doc_date', 'doc_type', 'invoice_no', 'total', 'status'])
          .where('tenant_id', '=', auth.tenantId).where('doc_key', 'in', lines.map((l) => l.invoiceDocKey!)).execute()).map((x) => [x.doc_key, x]));
        linkedInvoices = lines.map((l) => {
          const f = inv.get(l.invoiceDocKey!);
          return {
            id: f ? String(f.id) : null, docKey: l.invoiceDocKey!, docNo: f?.doc_no ?? null, docDate: f ? String(f.doc_date).slice(0, 10) : null, docType: f?.doc_type ?? null,
            invoiceNo: f?.invoice_no ?? null, total: f ? toNumber(f.total) : null, status: f?.status ?? null, amount: Number(l.amount ?? 0),
          };
        });
      }
    }
    // Phiếu chuyển tiền: kế toán đã xác nhận nhận tiền chưa, xác nhận còn khớp nội dung mới nhất không.
    let receiptConfirmation: (Awaited<ReturnType<typeof loadReceiptConfirmation>> & { valid: boolean }) | null = null;
    if (row.doc_type === 'cash_transfer') {
      const c = await loadReceiptConfirmation(db, row.id);
      const parsed = ingestDocumentSchema.safeParse(row.payload);
      if (c) receiptConfirmation = { ...c, valid: parsed.success && confirmationMatches(parsed.data, c) };
    }
    return {
      receiptConfirmation,
      linkedPayments,
      offsets,
      offsetBy,
      linkedInvoices,
      createdBy: row.created_by,
      createdByName: createdByName ?? null,
      canModify,
      modifyBlockedReason,
      signatures: await listSignatures(db, auth.tenantId, row.id, row.version),
      id: row.id,
      docKey: row.doc_key,
      sourceSystem: row.source_system,
      version: row.version,
      docType: row.doc_type,
      docNo: row.doc_no,
      docDate: row.doc_date,
      invoiceNo: row.invoice_no,
      total: toNumber(row.total),
      status: row.status,
      postedVersion: row.posted_version,
      errorMessage: row.error_message,
      cancelRequestedAt: row.cancel_requested_at,
      cancelReason: row.cancel_reason,
      branch,
      payload: originalDocNo ? { ...p, originalDocNo } : row.payload,
      receivedAt: row.received_at,
      postedAt: row.posted_at,
      entries: entries.map((e) => ({
        id: e.id,
        entryNo: e.entry_no,
        postingDate: e.posting_date,
        status: e.status,
        isReversal: Boolean(e.reverses_entry_id),
        description: e.description,
        total: toNumber(e.total),
        sourceVersion: e.event_version,
        lines: lines
          .filter((l) => l.entry_id === e.id)
          .map((l) => ({ lineNo: l.line_no, pairNo: l.pair_no, accountCode: l.account_code, accountName: l.account_name, debit: toNumber(l.debit), credit: toNumber(l.credit), part: l.part, taxCode: l.tax_code, description: l.description, productSku: l.product_sku })),
      })),
    };
  },
};
