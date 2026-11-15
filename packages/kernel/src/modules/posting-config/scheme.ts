// @bizcity-layer K kernel/config
// [2026-11-15 Nguyễn Văn Thủy] Quy tắc hạch toán: khung Nợ / Có bất biến của từng nghiệp vụ + tài khoản của quy tắc có phạm vi (đóng góp)
/**
 * QUY TẮC HẠCH TOÁN — một nguồn mô tả cho màn ACC41, API đọc quy tắc và tài liệu (docs/nghiep-vu/24-quy-tac-hach-toan.md).
 *
 *   SCHEME   : khung Nợ / Có của từng nghiệp vụ. Bất biến — đúng như luật định khoản trong rules/*.rule.ts; đổi khung là đổi code.
 *   RULE_KEYS: tài khoản của quy tắc (posting_defaults). Đổi được, nhưng chỉ trong PHẠM VI đầu số và phải là tài khoản chi tiết.
 *
 * Mỗi chân lấy tài khoản từ đúng một nguồn:
 *   rule      tài khoản của quy tắc (RULE_KEYS[key])
 *   payment   hình thức thanh toán (DM05) / tài khoản ngân hàng (DM09)
 *   warehouse loại kho của phân kho trên dòng (DM18); loại kho chưa khai TK → TK kho của quy tắc
 *   tax       loại thuế của dòng (ACC43); loại thuế chưa khai TK → TK thuế của quy tắc
 *   purpose   mục đích xuất của phiếu (bảng stock_purposes); không có mục đích → TK của quy tắc
 */

export type SchemeSource = 'rule' | 'payment' | 'warehouse' | 'tax' | 'purpose';
export type SchemeAmount = 'goods' | 'tax' | 'total' | 'paid' | 'unpaid' | 'cost' | 'discount';

export interface SchemeLine {
  side: 'debit' | 'credit';
  /** Dòng sổ này để làm gì. */
  role: string;
  amount: SchemeAmount;
  source: SchemeSource;
  /** Khoá tài khoản của quy tắc: nguồn 'rule', hoặc tài khoản dự phòng của nguồn khác. */
  key?: string;
  /** Khi nào có dòng này (trống = luôn có). */
  when?: string;
}

export interface SchemeGroup {
  name: string;
  lines: SchemeLine[];
}

export interface SchemeBusiness {
  code: string;
  name: string;
  /** Loại chứng từ ở cổng nhận chứng từ (docType). */
  docType: string;
  description: string;
  groups: SchemeGroup[];
}

export interface RuleKey {
  label: string;
  /** Đầu số được chọn. */
  range: string[];
  /** Tài khoản gợi ý khi đơn vị chưa đặt. */
  suggest: string;
  help: string;
}

/** Tài khoản của quy tắc (posting_defaults). Khoá ngoài danh sách này không được ghi. */
export const RULE_KEYS: Record<string, RuleKey> = {
  receivable: { label: 'Phải thu khách hàng', range: ['131'], suggest: '1311', help: 'Bán chưa thu tiền, thu nợ khách, hàng bán trả lại trừ công nợ.' },
  payable: { label: 'Phải trả nhà cung cấp', range: ['331'], suggest: '3312', help: 'Nhập mua chưa trả tiền, trả hàng NCC, trả tiền NCC.' },
  revenue: { label: 'Doanh thu bán hàng', range: ['511'], suggest: '51111', help: 'Tiền hàng trước thuế của phiếu bán.' },
  sales_return: { label: 'Hàng bán bị trả lại', range: ['521'], suggest: '52131', help: 'Giảm trừ doanh thu khi khách trả hàng.' },
  cogs: { label: 'Giá vốn hàng bán', range: ['632'], suggest: '6321', help: 'Giá vốn hàng bán, ghi khi tính giá vốn cuối tháng.' },
  gift_cogs: { label: 'Giá vốn hàng tặng kèm', range: ['632', '641', '642'], suggest: '6321', help: 'Dòng hàng tặng trên phiếu bán. Để như giá vốn (632) nếu hàng tặng là một phần của giá bán; chọn 641 nếu tính là chi phí khuyến mại.' },
  internal_revenue: { label: 'Doanh thu bán hàng nội bộ', range: ['511'], suggest: '51116', help: 'Bán cho chi nhánh khác (phiếu bán ghi lý do bán nội bộ).' },
  internal_cogs: { label: 'Giá vốn hàng bán nội bộ', range: ['632'], suggest: '6326', help: 'Bán cho chi nhánh khác: giá vốn ghi ngay bằng giá bán.' },
  inventory: { label: 'Kho hàng hoá (khi loại kho chưa khai TK)', range: ['15'], suggest: '1561', help: 'Dự phòng: loại kho của phân kho đã khai TK kho thì dùng TK của loại kho.' },
  tax_output: { label: 'Thuế GTGT đầu ra (khi loại thuế chưa khai TK)', range: ['3331'], suggest: '33311', help: 'Dự phòng: loại thuế đã khai TK thì dùng TK của loại thuế.' },
  tax_input: { label: 'Thuế GTGT đầu vào (khi loại thuế chưa khai TK)', range: ['133'], suggest: '1331', help: 'Dự phòng: loại thuế đã khai TK thì dùng TK của loại thuế.' },
  goods_in_transit: { label: 'Hàng đang chuyển (cùng đơn vị hạch toán)', range: ['15'], suggest: '1579', help: 'Chuyển kho giữa hai chi nhánh cùng đơn vị hạch toán: xuất ghi vào đây, nhận ghi ra.' },
  internal_receivable_goods: { label: 'Phải thu nội bộ hàng', range: ['136', '138'], suggest: '13681', help: 'Chuyển kho sang chi nhánh khác đơn vị hạch toán; bán nội bộ cho chi nhánh khác.' },
  internal_receivable: { label: 'Phải thu nội bộ tiền', range: ['136', '138'], suggest: '13681', help: 'Chuyển tiền sang chi nhánh khác đơn vị hạch toán (phía chuyển).' },
  internal_payable: { label: 'Phải trả nội bộ tiền', range: ['336', '338'], suggest: '33681', help: 'Chuyển tiền từ chi nhánh khác đơn vị hạch toán (phía nhận).' },
  cash_in_transit: { label: 'Tiền đang chuyển', range: ['113'], suggest: '11319', help: 'Chuyển tiền giữa hai chi nhánh cùng đơn vị hạch toán.' },
  stock_surplus: { label: 'Hàng thừa chờ xử lý', range: ['338', '711'], suggest: '3381', help: 'Phiếu tăng kho không ghi mục đích (kiểm kê thừa).' },
  stock_shortage: { label: 'Hàng thiếu chờ xử lý', range: ['138', '632', '811'], suggest: '1381', help: 'Phiếu giảm kho không ghi mục đích (kiểm kê thiếu).' },
  // [2026-11-15 Nguyễn Văn Thủy] chiết khấu thanh toán được hưởng khi trả NCC đúng hạn (đóng góp)
  payment_discount_income: { label: 'Chiết khấu thanh toán được hưởng', range: ['515'], suggest: '5152', help: 'Trả nhà cung cấp đúng hạn được giảm (CKTT): Nợ phải trả NCC / Có tài khoản này.' },
  promotion_expense: { label: 'Chi phí hàng khuyến mại (mua hàng)', range: ['641', '642'], suggest: '64184', help: 'Hàng khuyến mại nhận từ NCC ghi chi phí ở màn mua hàng.' },
};

/** Khung Nợ / Có của từng nghiệp vụ — đúng như luật định khoản. */
export const SCHEME: SchemeBusiness[] = [
  {
    code: 'sale', name: 'Bán hàng', docType: 'sale',
    description: 'Phiếu bán từ cửa hàng / bán buôn. Thu bao nhiêu ghi tiền bấy nhiêu, phần chưa thu thành công nợ khách. Giá vốn ghi khi tính giá vốn cuối tháng.',
    groups: [
      { name: 'Doanh thu', lines: [
        { side: 'debit', role: 'Phải thu khách', amount: 'total', source: 'rule', key: 'receivable' },
        { side: 'credit', role: 'Doanh thu', amount: 'goods', source: 'rule', key: 'revenue' },
        { side: 'credit', role: 'Thuế đầu ra', amount: 'tax', source: 'tax', key: 'tax_output' },
      ] },
      { name: 'Thu tiền (mỗi khoản thu một phiếu thu)', lines: [
        { side: 'debit', role: 'Tiền thu', amount: 'paid', source: 'payment', when: 'Có khoản thu không phải ghi nợ' },
        { side: 'credit', role: 'Giảm phải thu khách', amount: 'paid', source: 'rule', key: 'receivable', when: 'Có khoản thu không phải ghi nợ' },
      ] },
      { name: 'Giá vốn (theo kho xuất)', lines: [
        { side: 'debit', role: 'Giá vốn hàng bán', amount: 'cost', source: 'rule', key: 'cogs', when: 'Dòng hàng bán' },
        { side: 'debit', role: 'Giá vốn hàng tặng kèm', amount: 'cost', source: 'rule', key: 'gift_cogs', when: 'Dòng hàng tặng' },
        { side: 'credit', role: 'Hàng rời kho', amount: 'cost', source: 'warehouse', key: 'inventory' },
      ] },
    ],
  },
  {
    code: 'sale_internal', name: 'Bán nội bộ', docType: 'sale',
    description: 'Bán cho chi nhánh khác: phiếu bán ghi lý do bán nội bộ (cờ giá vốn theo giá bán). Công nợ, doanh thu, giá vốn nội bộ; giá vốn ghi ngay bằng giá bán, không tính vào đơn giá vốn tháng.',
    groups: [
      { name: 'Doanh thu nội bộ', lines: [
        { side: 'debit', role: 'Phải thu nội bộ (chi nhánh mua)', amount: 'total', source: 'rule', key: 'internal_receivable_goods' },
        { side: 'credit', role: 'Doanh thu nội bộ', amount: 'goods', source: 'rule', key: 'internal_revenue' },
        { side: 'credit', role: 'Thuế đầu ra', amount: 'tax', source: 'tax', key: 'tax_output' },
      ] },
      { name: 'Giá vốn nội bộ (bằng giá bán, ghi ngay)', lines: [
        { side: 'debit', role: 'Giá vốn nội bộ', amount: 'goods', source: 'rule', key: 'internal_cogs' },
        { side: 'credit', role: 'Hàng rời kho', amount: 'goods', source: 'warehouse', key: 'inventory' },
      ] },
    ],
  },
  {
    code: 'sale_return', name: 'Hàng bán trả lại', docType: 'sale_return',
    description: 'Khách trả hàng: giảm doanh thu và thuế đầu ra; trả tiền lại khách hoặc trừ công nợ; hàng nhập lại kho.',
    groups: [
      { name: 'Giảm doanh thu', lines: [
        { side: 'debit', role: 'Hàng bán bị trả lại', amount: 'goods', source: 'rule', key: 'sales_return' },
        { side: 'debit', role: 'Giảm thuế đầu ra', amount: 'tax', source: 'tax', key: 'tax_output' },
        { side: 'credit', role: 'Giảm phải thu khách', amount: 'total', source: 'rule', key: 'receivable' },
      ] },
      { name: 'Trả tiền khách (mỗi khoản một phiếu chi)', lines: [
        { side: 'debit', role: 'Phải thu khách', amount: 'paid', source: 'rule', key: 'receivable', when: 'Có khoản trả tiền' },
        { side: 'credit', role: 'Tiền trả', amount: 'paid', source: 'payment', when: 'Có khoản trả tiền' },
      ] },
      { name: 'Hàng về kho', lines: [
        { side: 'debit', role: 'Hàng nhập lại kho', amount: 'cost', source: 'warehouse', key: 'inventory' },
        { side: 'credit', role: 'Giảm giá vốn', amount: 'cost', source: 'rule', key: 'cogs' },
      ] },
    ],
  },
  {
    code: 'purchase', name: 'Mua hàng', docType: 'purchase',
    description: 'Phiếu nhập từ nhà cung cấp: hàng vào kho, thuế được khấu trừ, ghi nợ NCC; trả tiền ngay thì thêm phiếu chi.',
    groups: [
      { name: 'Hàng vào kho', lines: [
        { side: 'debit', role: 'Hàng nhập kho', amount: 'goods', source: 'warehouse', key: 'inventory' },
        { side: 'debit', role: 'Thuế đầu vào', amount: 'tax', source: 'tax', key: 'tax_input' },
        { side: 'credit', role: 'Phải trả NCC', amount: 'total', source: 'rule', key: 'payable' },
      ] },
      { name: 'Trả tiền ngay', lines: [
        { side: 'debit', role: 'Giảm phải trả NCC', amount: 'paid', source: 'rule', key: 'payable', when: 'Có khoản trả tiền' },
        { side: 'credit', role: 'Tiền trả', amount: 'paid', source: 'payment', when: 'Có khoản trả tiền' },
      ] },
      // [2026-11-15 Nguyễn Văn Thủy] quà NCC không hoá đơn: phiếu nhận quà ghi theo mục đích NQUA (sửa ở bảng Mục đích xuất) (đóng góp)
      { name: 'Nhận quà không hoá đơn', lines: [
        { side: 'debit', role: 'Quà vào kho', amount: 'cost', source: 'warehouse', key: 'inventory', when: 'Phiếu nhận quà' },
        { side: 'credit', role: 'Thu nhập quà tặng (mục đích NQUA)', amount: 'cost', source: 'purpose', key: 'stock_surplus', when: 'Phiếu nhận quà' },
      ] },
    ],
  },
  {
    code: 'purchase_return', name: 'Trả hàng NCC', docType: 'purchase_return',
    description: 'Xuất trả nhà cung cấp: hàng ra khỏi kho, giảm thuế đầu vào, giảm nợ NCC.',
    groups: [
      { name: 'Hàng ra kho', lines: [
        { side: 'debit', role: 'Giảm phải trả NCC', amount: 'total', source: 'rule', key: 'payable' },
        { side: 'credit', role: 'Hàng xuất trả', amount: 'goods', source: 'warehouse', key: 'inventory' },
        { side: 'credit', role: 'Giảm thuế đầu vào', amount: 'tax', source: 'tax', key: 'tax_input' },
      ] },
    ],
  },
  {
    code: 'customer_payment', name: 'Thu tiền khách', docType: 'customer_payment',
    description: 'Thu nợ sau, khách ứng trước / đặt cọc.',
    groups: [
      { name: 'Thu tiền', lines: [
        { side: 'debit', role: 'Tiền thu', amount: 'total', source: 'payment' },
        { side: 'credit', role: 'Giảm phải thu khách', amount: 'total', source: 'rule', key: 'receivable' },
      ] },
    ],
  },
  {
    code: 'supplier_payment', name: 'Trả tiền NCC', docType: 'supplier_payment',
    description: 'Thanh toán, ứng trước nhà cung cấp.',
    groups: [
      { name: 'Trả tiền', lines: [
        { side: 'debit', role: 'Giảm phải trả NCC', amount: 'total', source: 'rule', key: 'payable' },
        { side: 'credit', role: 'Tiền trả', amount: 'total', source: 'payment' },
      ] },
      { name: 'Chiết khấu thanh toán', lines: [
        { side: 'debit', role: 'Giảm phải trả NCC', amount: 'discount', source: 'rule', key: 'payable', when: 'Trả đúng hạn được CKTT' },
        { side: 'credit', role: 'Chiết khấu thanh toán được hưởng', amount: 'discount', source: 'rule', key: 'payment_discount_income' },
      ] },
    ],
  },
  {
    code: 'transfer', name: 'Chuyển kho', docType: 'transfer',
    description: 'Hàng đi giữa các phân kho. Cùng chi nhánh: chỉ đổi kho. Khác chi nhánh: qua hàng đang chuyển (cùng đơn vị) hoặc phải thu nội bộ (khác đơn vị).',
    groups: [
      { name: 'Chi nhánh xuất', lines: [
        { side: 'debit', role: 'Hàng đang chuyển', amount: 'cost', source: 'rule', key: 'goods_in_transit', when: 'Cùng đơn vị hạch toán' },
        { side: 'debit', role: 'Phải thu nội bộ hàng', amount: 'cost', source: 'rule', key: 'internal_receivable_goods', when: 'Khác đơn vị hạch toán' },
        { side: 'credit', role: 'Hàng rời kho xuất', amount: 'cost', source: 'warehouse', key: 'inventory' },
      ] },
      { name: 'Chi nhánh nhận (khi xác nhận nhận hàng)', lines: [
        { side: 'debit', role: 'Hàng vào kho nhận', amount: 'cost', source: 'warehouse', key: 'inventory' },
        { side: 'credit', role: 'Hàng đang chuyển', amount: 'cost', source: 'rule', key: 'goods_in_transit', when: 'Cùng đơn vị hạch toán' },
        { side: 'credit', role: 'Phải thu nội bộ hàng', amount: 'cost', source: 'rule', key: 'internal_receivable_goods', when: 'Khác đơn vị hạch toán' },
      ] },
    ],
  },
  {
    code: 'stock_out', name: 'Xuất kho không bán', docType: 'stock_adjustment',
    description: 'Hủy, mất, dùng cho bộ phận, tặng, đào tạo, kiểm kê thiếu. Mục đích xuất quyết tài khoản chi phí.',
    groups: [
      { name: 'Hàng ra kho', lines: [
        { side: 'debit', role: 'Chi phí / xử lý theo mục đích', amount: 'cost', source: 'purpose', key: 'stock_shortage' },
        { side: 'credit', role: 'Hàng rời kho', amount: 'cost', source: 'warehouse', key: 'inventory' },
      ] },
    ],
  },
  {
    code: 'stock_in', name: 'Nhập kho khác', docType: 'stock_adjustment',
    description: 'Kiểm kê thừa, nhập điều chỉnh tăng.',
    groups: [
      { name: 'Hàng vào kho', lines: [
        { side: 'debit', role: 'Hàng vào kho', amount: 'cost', source: 'warehouse', key: 'inventory' },
        { side: 'credit', role: 'Thừa chờ xử lý / theo mục đích', amount: 'cost', source: 'purpose', key: 'stock_surplus' },
      ] },
    ],
  },
  {
    code: 'cash_transfer', name: 'Chuyển tiền', docType: 'cash_transfer',
    description: 'Nộp tiền shop về ngân hàng, chuyển giữa quỹ, giữa chi nhánh.',
    groups: [
      { name: 'Nơi chuyển', lines: [
        { side: 'debit', role: 'Tiền đang chuyển', amount: 'total', source: 'rule', key: 'cash_in_transit', when: 'Cùng đơn vị hạch toán' },
        { side: 'debit', role: 'Phải thu nội bộ tiền', amount: 'total', source: 'rule', key: 'internal_receivable', when: 'Khác đơn vị hạch toán' },
        { side: 'credit', role: 'Tiền chuyển đi', amount: 'total', source: 'payment' },
      ] },
      { name: 'Nơi nhận', lines: [
        { side: 'debit', role: 'Tiền nhận', amount: 'total', source: 'payment' },
        { side: 'credit', role: 'Tiền đang chuyển', amount: 'total', source: 'rule', key: 'cash_in_transit', when: 'Cùng đơn vị hạch toán' },
        { side: 'credit', role: 'Phải trả nội bộ tiền', amount: 'total', source: 'rule', key: 'internal_payable', when: 'Khác đơn vị hạch toán' },
      ] },
    ],
  },
];

/** Phạm vi tài khoản đối ứng của mục đích xuất. */
export const PURPOSE_RANGE = ['138', '15', '211', '241', '242', '334', '338', '353', '632', '641', '642', '711', '811'];

/** Kiểm một tài khoản có nằm trong phạm vi đầu số. */
export function inRange(code: string, range: string[]): boolean {
  return range.some((p) => code.startsWith(p));
}
