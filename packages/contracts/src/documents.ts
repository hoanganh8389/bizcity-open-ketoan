// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Khuôn chứng từ gửi vào phần mềm kế toán (API: POST /api/v1/documents).
 *
 * Nguyên tắc:
 * - Mỗi chứng từ có `docKey` duy nhất trong một đơn vị và `version` tăng dần.
 *   Gửi lại cùng version → bỏ qua (không ghi trùng). Version mới → chờ định khoản lại
 *   ở trạm ACC14 (bút toán cũ giữ tới khi định khoản lại, đảo bằng ghi số âm).
 * - Số tiền là số đã chốt ở hệ thống nguồn (đúng như trên hoá đơn đã phát hành).
 *   Phần mềm kế toán không tính lại thuế, chỉ kiểm tra tổng và định khoản.
 * - Mọi mã (chi nhánh, lý do, loại thuế, hình thức thanh toán) là mã đã khai báo
 *   ở phần Danh mục của phần mềm kế toán.
 */
import { z } from 'zod';

const money = z.number().finite();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'Ngày phải theo dạng YYYY-MM-DD hoặc ISO 8601');

/** Đối tượng (khách hàng, nhà cung cấp). */
export const partnerInputSchema = z.object({
  code: z.string().trim().min(1).max(64).describe('Mã đối tượng ổn định ở hệ thống nguồn (ví dụ số điện thoại khách)'),
  name: z.string().trim().max(255).default(''),
  taxCode: z.string().trim().max(32).optional(),
  address: z.string().trim().max(500).optional(),
  email: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(32).optional(),
});
export type PartnerInput = z.infer<typeof partnerInputSchema>;

/** Thông tin hoá đơn đã phát hành (nếu có): ghi vào sổ hoá đơn, bảng kê bán ra / mua vào. */
export const invoiceInputSchema = z.object({
  no: z.string().trim().min(1).max(32),
  serial: z.string().trim().max(32).default(''),
  form: z.string().trim().max(32).default(''),
  date: isoDate,
  status: z.enum(['valid', 'replaced', 'adjusted', 'cancelled']).default('valid'),
  provider: z.string().trim().max(32).optional(),
  lookupCode: z.string().trim().max(128).optional(),
  /** Số hoá đơn bị thay thế / bị điều chỉnh bởi hoá đơn này. */
  relatedInvoiceNo: z.string().trim().max(32).optional(),
  relation: z.enum(['replaces', 'adjusts']).optional(),
  buyerName: z.string().trim().max(255).optional(),
  buyerLegalName: z.string().trim().max(255).optional(),
  buyerTaxCode: z.string().trim().max(32).optional(),
  buyerAddress: z.string().trim().max(500).optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

/** Một dòng hàng. */
export const documentLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(64).describe('Khoá dòng ở hệ thống nguồn'),
  sku: z.string().trim().max(64).default(''),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  /** Số lượng quy về đơn vị nhỏ nhất (đơn vị tính tồn kho). */
  qty: z.number().finite().default(0),
  /** Số lượng theo đơn vị bán trên phiếu (lốc, thùng…) và tỉ lệ quy đổi ra đơn vị nhỏ nhất (thông tin, để hiện đúng ĐVT). */
  unitQty: z.number().finite().optional(),
  unitRatio: z.number().positive().optional(),
  /** Đơn giá trước thuế (sau chiết khấu nếu nguồn đã trừ). Chỉ để tham khảo, sổ dùng amountBeforeTax. */
  unitPrice: money.default(0),
  /** Tiền hàng trước thuế, ĐÃ trừ chiết khấu, đã làm tròn như trên hoá đơn. */
  amountBeforeTax: money,
  /** Chiết khấu của dòng (thông tin, đã trừ trong amountBeforeTax). */
  discount: money.default(0),
  /** Mã loại thuế đã khai báo (ví dụ R08, R05, KCT). */
  taxCode: z.string().trim().min(1).max(16),
  taxAmount: money.default(0),
  warehouseCode: z.string().trim().max(64).optional(),
  /** Hàng tặng, khuyến mãi (tiền 0). */
  isGift: z.boolean().default(false),
  /** Không tính vào đơn giá bình quân tháng (quà KM người tiêu dùng nhận kèm phiếu mua — không chia vào giá vốn). Vẫn vào tồn. */
  excludeFromCost: z.boolean().optional(),
  lotNo: z.string().trim().max(64).optional(),
  /** Hạn dùng của lô (thông tin). */
  expDate: isoDate.optional(),
  /** Ghi chú của dòng hàng (thông tin). */
  note: z.string().trim().max(500).optional(),
  /** Giá vốn của dòng nếu nguồn đã có. Để trống thì ghi giá vốn sau. */
  cost: money.optional(),
});
export type DocumentLine = z.infer<typeof documentLineSchema>;

/** Một khoản thanh toán đi kèm chứng từ. */
export const documentPaymentSchema = z.object({
  methodCode: z.string().trim().min(1).max(32).describe('Mã hình thức thanh toán đã khai báo'),
  amount: money,
  reference: z.string().trim().max(255).optional(),
  paidAt: isoDate.optional(),
});
export type DocumentPayment = z.infer<typeof documentPaymentSchema>;

export const documentTotalsSchema = z.object({
  beforeTax: money,
  tax: money,
  total: money,
});

/** Phần chung của mọi chứng từ. */
const baseDocument = {
  docKey: z.string().trim().min(3).max(160),
  version: z.number().int().min(1).default(1),
  branchCode: z.string().trim().min(1).max(32),
  docNo: z.string().trim().min(1).max(64),
  docDate: isoDate,
  reasonCode: z.string().trim().max(32).optional(),
  description: z.string().trim().max(1000).default(''),
  /**
   * Phiếu nội bộ (ví dụ bill tách hàng không xuất hoá đơn): không ghi sổ hoá đơn, không chuyển sang hệ thống
   * thuế (cơ sở dữ liệu thuế riêng) dù có số hoá đơn.
   */
  internalOnly: z.boolean().default(false),
  partner: partnerInputSchema.optional(),
  /**
   * Nhân viên phụ trách chứng từ (người bán, người thu tiền). Ghi vào mọi dòng sổ của chứng từ
   * để xem công nợ, doanh thu theo nhân viên. Mã chưa có thì tự thêm vào danh mục Nhân viên.
   */
  employee: z.object({ code: z.string().trim().min(1).max(64), name: z.string().trim().max(255).default('') }).optional(),
  invoice: invoiceInputSchema.optional(),
  /** Hạn thanh toán của khoản công nợ chứng từ sinh ra (bán nợ, mua nợ); trống = ngày chứng từ + hạn thanh toán của đối tượng. */
  dueDate: isoDate.optional(),
  sourceSystem: z.string().trim().max(32).default('external'),
  /**
   * Phiếu gốc ở hệ thống nguồn: loại phiếu (ví dụ "sale_order", "customer_return", "transfer_export"), mã phiếu và
   * đường dẫn mở phiếu (nếu có). Chỉ để tra cứu và lọc ở trạm ACC14, không dùng để định khoản.
   */
  sourceRef: z.object({ type: z.string().trim().max(64), id: z.string().trim().max(64), label: z.string().trim().max(120).optional(), url: z.string().trim().max(500).optional() }).optional(),
  /** Dữ liệu thêm của hệ thống nguồn, lưu nguyên để tra cứu, không dùng để định khoản. */
  extra: z.record(z.unknown()).optional(),
};

export const saleDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('sale'),
  lines: z.array(documentLineSchema).min(0).max(2000),
  payments: z.array(documentPaymentSchema).default([]),
  /**
   * Đối trừ (đổi trả): khách trả hàng rồi mua đơn này, tiền hàng trả lại được trừ vào đơn — KHÔNG phải tiền thật.
   * Mỗi dòng: docKey của phiếu hoàn được đối trừ, số tiền. Không sinh bút toán tiền; công nợ của khách giữa phiếu hoàn
   * và đơn này được đối trừ với nhau (khách chỉ trả thêm phần chênh bằng phiếu thu thật).
   */
  offsets: z.array(z.object({ docKey: z.string().trim().min(3).max(160), amount: money.positive() })).default([]),
  totals: documentTotalsSchema,
});

export const saleReturnDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('sale_return'),
  /** docKey của hoá đơn bán gốc. */
  originalDocKey: z.string().trim().max(160).optional(),
  lines: z.array(documentLineSchema).min(1).max(2000),
  /** Tiền trả lại khách (nếu có). */
  payments: z.array(documentPaymentSchema).default([]),
  totals: documentTotalsSchema,
});

/**
 * Nhập mua hàng. `partner` là nhà cung cấp; `invoice` là hoá đơn đầu vào (có thì ghi sổ hoá đơn và
 * bảng kê mua vào). Dòng hàng dùng loại thuế đầu vào (V05, V08, V10…). `payments`: tiền trả ngay.
 */
export const purchaseDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('purchase'),
  lines: z.array(documentLineSchema).min(1).max(2000),
  payments: z.array(documentPaymentSchema).default([]),
  totals: documentTotalsSchema,
});

/** Trả hàng cho nhà cung cấp. Số tiền là số DƯƠNG (số hàng trả). */
export const purchaseReturnDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('purchase_return'),
  /** docKey của phiếu nhập mua gốc. */
  originalDocKey: z.string().trim().max(160).optional(),
  lines: z.array(documentLineSchema).min(1).max(2000),
  /** Tiền nhà cung cấp trả lại (nếu có). */
  payments: z.array(documentPaymentSchema).default([]),
  totals: documentTotalsSchema,
});

/** Một dòng hàng của phiếu kho (chuyển kho, điều chỉnh kho): chỉ có số lượng và giá trị. */
export const stockLineSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().max(500).default(''),
  unit: z.string().trim().max(32).default(''),
  qty: z.number().finite(),
  /**
   * Giá trị của dòng theo giá vốn (số dương). Để 0 khi hệ thống nguồn chưa có giá vốn:
   * phần mềm định giá khi tính giá vốn bình quân của tháng.
   */
  amount: money.default(0),
  /** Kho của dòng (chuyển kho: kho XUẤT của chi nhánh xuất). Trống = kho mặc định của chi nhánh. */
  warehouseCode: z.string().trim().max(64).optional(),
  /** Chuyển kho (một chứng từ cho cả cặp): kho NHẬN của chi nhánh nhận. Trống = kho mặc định của chi nhánh nhận.
   *  Chuyển giữa hai kho trong CÙNG chi nhánh (toBranchCode = branchCode): bắt buộc warehouseCode và toWarehouseCode khác nhau. */
  toWarehouseCode: z.string().trim().max(64).optional(),
});
export type StockLine = z.infer<typeof stockLineSchema>;

const stockTotalsSchema = z.object({ total: money });

/**
 * Chuyển kho giữa hai chi nhánh. Hai cách gửi:
 *   - Một chứng từ cho cả cặp (không có `leg`): `branchCode` là chi nhánh XUẤT, `toBranchCode` (bắt buộc) là chi nhánh
 *     NHẬN. Phía xuất ghi sổ ngay; phía nhận ghi khi `status = 'received'` (gửi lại `version` mới khi đã nhận).
 *   - Mỗi đầu một chứng từ (`leg`), như phiếu xuất nội bộ / phiếu nhận nội bộ của từng cửa hàng: `branchCode` luôn là
 *     chi nhánh của CHÍNH phiếu; `leg = 'out'` (xuất đi, `toBranchCode` = nơi nhận nếu biết) chỉ ghi bút toán và thẻ kho
 *     xuất của chi nhánh đó; `leg = 'in'` (nhận về, `fromBranchCode` = nơi gửi nếu biết) chỉ ghi phần nhập. Nơi đến /
 *     nơi gửi chỉ để mô tả và đặt đối tượng trên tài khoản hàng đang chuyển; không biết thì để trống.
 */
export const transferDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('transfer'),
  leg: z.enum(['out', 'in']).optional(),
  toBranchCode: z.string().trim().min(1).max(32).optional(),
  fromBranchCode: z.string().trim().min(1).max(32).optional(),
  status: z.enum(['shipped', 'received']).default('received'),
  lines: z.array(stockLineSchema).min(1).max(2000),
  totals: stockTotalsSchema,
});

/**
 * Điều chỉnh kho: tăng (kiểm kê thừa…), giảm (kiểm kê thiếu, hàng hỏng, xuất dùng…), hoặc `mixed` — mỗi dòng mang
 * số lượng CÓ DẤU (dương = tăng, âm = giảm), như phiếu điều chỉnh tồn ghi chênh lệch +/− từng mặt hàng.
 */
export const stockAdjustmentDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('stock_adjustment'),
  direction: z.enum(['increase', 'decrease', 'mixed']),
  lines: z.array(stockLineSchema).min(1).max(2000),
  totals: stockTotalsSchema,
});

/**
 * Chuyển tiền giữa hai chi nhánh (`branchCode` = nơi chuyển, `toBranchCode` = nơi nhận), hoặc trong một
 * chi nhánh giữa quỹ và ngân hàng (`toBranchCode` = `branchCode`, hai hình thức khác nhau).
 * Hình thức thanh toán quyết định tài khoản tiền mỗi phía (TM → 1111, CK → 112…); có mã tài khoản ngân hàng
 * (`fromBankCode` / `toBankCode`, danh mục Tài khoản ngân hàng) thì tài khoản tiền là tài khoản kế toán của ngân hàng đó.
 * Phía chuyển ghi sổ ngay; phía nhận ghi khi `status = 'received'`.
 * `reasonCode` là lý do chi (phía chuyển), `toReasonCode` là lý do thu (phía nhận).
 */
export const cashTransferDocumentSchema = z.object({
  ...baseDocument,
  docType: z.literal('cash_transfer'),
  toBranchCode: z.string().trim().min(1).max(32),
  fromMethodCode: z.string().trim().min(1).max(32).default('TM'),
  toMethodCode: z.string().trim().min(1).max(32).default('TM'),
  /** Tài khoản ngân hàng rút tiền (phía chuyển); trống = theo hình thức (tiền mặt). */
  fromBankCode: z.string().trim().max(32).optional(),
  /** Tài khoản ngân hàng nộp tiền (phía nhận); trống = theo hình thức (tiền mặt). */
  toBankCode: z.string().trim().max(32).optional(),
  /** Lý do thu phía nhận; trống hoặc lý do không ghi sổ = lý do mặc định của chuyển tiền. */
  toReasonCode: z.string().trim().max(32).optional(),
  status: z.enum(['sent', 'received']).default('received'),
  totals: z.object({ total: money.positive() }),
});

/** Một khoản phân bổ của phiếu thu / trả tiền: trả cho công nợ nào, của chi nhánh nào. */
export const paymentAllocationSchema = z.object({
  lineKey: z.string().trim().min(1).max(64),
  amount: money.positive(),
  /** Chi nhánh đang giữ công nợ (hoá đơn). Bỏ trống = chi nhánh lập phiếu. Khác chi nhánh lập phiếu = thu hộ / trả hộ. */
  branchCode: z.string().trim().max(32).optional(),
  /** docKey của hoá đơn được trả (để tra cứu). */
  invoiceDocKey: z.string().trim().max(160).optional(),
  description: z.string().trim().max(500).optional(),
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

const paymentDocument = {
  ...baseDocument,
  /** Hình thức thanh toán: quyết định tài khoản tiền (TM → 1111, CK → 112…). */
  methodCode: z.string().trim().min(1).max(32),
  /**
   * Chiều tiền: in = thu vào quỹ / tài khoản, out = chi ra. Bỏ trống: thanh toán khách hàng = in, thanh toán nhà cung cấp
   * = out. Chi trả tiền khách (hàng bán trả lại, trả tiền thừa) = customer_payment + out; nhà cung cấp trả lại tiền =
   * supplier_payment + in.
   */
  direction: z.enum(['in', 'out']).optional(),
  /** Các khoản phân bổ. Tổng phân bổ ≤ tổng phiếu; phần còn lại ghi vào công nợ tại chi nhánh lập phiếu. */
  lines: z.array(paymentAllocationSchema).max(2000).default([]),
  totals: z.object({ total: money.positive() }),
};

/**
 * Thanh toán khách hàng (phiếu thu tiền khách, hoặc phiếu chi trả tiền khách khi `direction = out`). `partner` là khách;
 * `branchCode` là nơi thu / chi tiền. Phiếu thu của đơn bán: mỗi phiếu một chứng từ, ngày = ngày thu, `lines[].invoiceDocKey`
 * = docKey của phiếu bán (phiếu chi trả khách: docKey phiếu hoàn) — công nợ tự đối trừ đúng hoá đơn đó.
 */
export const customerPaymentDocumentSchema = z.object({ ...paymentDocument, docType: z.literal('customer_payment') });
/** Trả tiền nhà cung cấp. `partner` là nhà cung cấp; `branchCode` là nơi chi tiền. */
export const supplierPaymentDocumentSchema = z.object({ ...paymentDocument, docType: z.literal('supplier_payment') });

export const ingestDocumentSchema = z.discriminatedUnion('docType', [
  saleDocumentSchema,
  saleReturnDocumentSchema,
  purchaseDocumentSchema,
  purchaseReturnDocumentSchema,
  transferDocumentSchema,
  stockAdjustmentDocumentSchema,
  cashTransferDocumentSchema,
  customerPaymentDocumentSchema,
  supplierPaymentDocumentSchema,
]);
export type IngestDocument = z.infer<typeof ingestDocumentSchema>;
export type SaleDocument = z.infer<typeof saleDocumentSchema>;
export type SaleReturnDocument = z.infer<typeof saleReturnDocumentSchema>;
export type PurchaseDocument = z.infer<typeof purchaseDocumentSchema>;
export type PurchaseReturnDocument = z.infer<typeof purchaseReturnDocumentSchema>;
export type TransferDocument = z.infer<typeof transferDocumentSchema>;
export type StockAdjustmentDocument = z.infer<typeof stockAdjustmentDocumentSchema>;
export type CashTransferDocument = z.infer<typeof cashTransferDocumentSchema>;
export type CustomerPaymentDocument = z.infer<typeof customerPaymentDocumentSchema>;
export type SupplierPaymentDocument = z.infer<typeof supplierPaymentDocumentSchema>;

/** Chứng từ mua bán: có tiền hàng, thuế, hoá đơn, thanh toán. */
export type TradeDocument = SaleDocument | SaleReturnDocument | PurchaseDocument | PurchaseReturnDocument;
/** Phiếu kho: chỉ có số lượng và giá trị hàng. */
export type StockDocument = TransferDocument | StockAdjustmentDocument;
/** Phiếu tiền: chuyển tiền, thu tiền khách, trả tiền nhà cung cấp. */
export type CashDocument = CashTransferDocument | CustomerPaymentDocument | SupplierPaymentDocument;

export function isStockDocumentType(doc: IngestDocument): doc is StockDocument {
  return doc.docType === 'transfer' || doc.docType === 'stock_adjustment';
}

export function isCashDocument(doc: IngestDocument): doc is CashDocument {
  return doc.docType === 'cash_transfer' || doc.docType === 'customer_payment' || doc.docType === 'supplier_payment';
}

/** Mã hàng xuất hiện trên chứng từ (phiếu tiền không có). */
export function skusOf(doc: IngestDocument): string[] {
  if (isCashDocument(doc)) return [];
  return [...new Set((doc.lines as { sku: string }[]).map((l) => l.sku).filter(Boolean))];
}

export function isTradeDocument(doc: IngestDocument): doc is TradeDocument {
  return doc.docType === 'sale' || doc.docType === 'sale_return' || doc.docType === 'purchase' || doc.docType === 'purchase_return';
}

/** Chiều của chứng từ mua bán đối với sổ hoá đơn: bán ra (output) hay mua vào (input). */
export function invoiceDirection(doc: TradeDocument): 'output' | 'input' {
  return doc.docType === 'purchase' || doc.docType === 'purchase_return' ? 'input' : 'output';
}

/** Gửi nhiều chứng từ một lần (tối đa 200). */
export const ingestBatchSchema = z.object({
  documents: z.array(z.unknown()).min(1).max(200),
});

/** Kết quả xử lý một chứng từ. */
export interface IngestResult {
  docKey: string;
  version: number;
  /** pending: chứng từ đã lưu, đang chờ định khoản ở trạm ACC14. */
  status: 'posted' | 'unchanged' | 'error' | 'pending';
  /** Mã bút toán đã ghi. */
  entryIds?: string[];
  /** Định khoản lại: số bút toán giữ nguyên (không đổi) và số bút toán bị đảo. */
  kept?: number;
  /** Trong số bút toán giữ: số bút toán chỉ cập nhật thông tin đầu tại chỗ (số hoá đơn, diễn giải…). */
  updated?: number;
  reversed?: number;
  error?: { code: string; message: string };
}

/**
 * Chế độ định khoản theo loại chứng từ (cài ở trạm Định khoản tự động — ACC14):
 *   approve : (mặc định) chứng từ tới chỉ được lưu, hiện ở trạm ACC14 thẻ "Chờ định khoản"; chưa vào sổ, kho, bán hàng,
 *             sổ hoá đơn cho tới khi kế toán định khoản (chọn nhiều, định khoản theo lô);
 *   auto    : định khoản ngay khi chứng từ tới.
 * Áp dụng cho chứng từ đẩy vào cổng chờ (POST /api/v1/documents). Chứng từ kéo về từ hệ thống kết nối luôn chờ định
 * khoản. Phiếu thu chi, phiếu kế toán do kế toán tự lập thì ghi ngay ở chính phiếu.
 */
export const APPROVABLE_DOC_TYPES = ['sale', 'sale_return', 'purchase', 'purchase_return', 'transfer', 'stock_adjustment', 'cash_transfer', 'customer_payment', 'supplier_payment'] as const;
export type ApprovableDocType = (typeof APPROVABLE_DOC_TYPES)[number];
export const postingModesSchema = z.object(Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, z.enum(['auto', 'approve']).default('approve')])) as Record<ApprovableDocType, z.ZodDefault<z.ZodEnum<['auto', 'approve']>>>);
export type PostingModes = z.infer<typeof postingModesSchema>;
