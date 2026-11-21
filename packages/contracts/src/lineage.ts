// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: bizcity_lineage@1 — hợp đồng đọc truy vết vòng đời mặt hàng (ADR-0021, R-CONT-0 / R-CONT-8)
// [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23: bizcity_lineage@1 0.4.0-draft — làn `policy` (LineagePolicyTag, LineagePolicyApplied, PolicyLineage), chỉ thêm trường
/**
 * TRUY VẾT VÒNG ĐỜI MẶT HÀNG (bizcity_lineage@1, chỉ đọc). Một mặt hàng → mọi sự kiện kho (mua, nhập, bán, trả, điều chuyển, điều
 * chỉnh), mọi dòng bút toán mang mã hàng, và giá vốn từng tháng — nối bằng khoá thật của dữ liệu hiện có:
 *   sự kiện kho  = inventory_movements (event_id, line_no)  →  chứng từ accounting_events (doc_key, version)
 *   bút toán     = ledger_lines (product_sku, source_line_key) →  ledger_entries (event_id)
 *   giá vốn      = inventory_costs (nhóm tính giá × tháng × mã hàng)
 * Khoá theo \`item_id\` (\`coverage.keyedBy = 'item_id'\`, [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b): mọi mã từng dùng của mặt hàng về một hành trình, \`item.codes\` là lịch sử
 * mã, \`event.code\` là mã tại ngày. Dòng chưa gắn item_id (dữ liệu trước 0066) vẫn được lấy theo mã hiện hành. Chỉ thêm trường (R-CONT-1).
 *
 * \`effect\` (R-CONT-8): sự kiện KẾ TOÁN đổi giá trị tồn / sinh bút toán; sự kiện VẬN HÀNH không đổi sổ (chuyển kho cùng nhóm tính giá).
 */

export type LineageKind = 'purchase' | 'purchase_return' | 'sale' | 'sale_return' | 'transfer_out' | 'transfer_in' | 'adjust_in' | 'adjust_out';
export type LineageEffect = 'accounting' | 'operational';

export const LINEAGE_KIND_LABEL: Record<LineageKind, string> = {
  purchase: 'Mua hàng · nhập kho',
  purchase_return: 'Trả nhà cung cấp',
  sale: 'Bán hàng · xuất kho',
  sale_return: 'Khách trả hàng',
  transfer_out: 'Chuyển kho (xuất)',
  transfer_in: 'Chuyển kho (nhập)',
  adjust_in: 'Điều chỉnh tăng',
  adjust_out: 'Điều chỉnh giảm',
};

/** Làn của màn Hành trình mặt hàng: sự kiện nào nằm ở làn nào. */
export const LINEAGE_LANE: Record<LineageKind, 'in' | 'out' | 'return' | 'move'> = {
  purchase: 'in', adjust_in: 'in', transfer_in: 'move', transfer_out: 'move', sale: 'out', adjust_out: 'out', sale_return: 'return', purchase_return: 'return',
};

export interface LineageEvent {
  /** Ngày chứng từ (YYYY-MM-DD). */
  at: string;
  kind: LineageKind;
  label: string;
  effect: LineageEffect;
  /** Vì sao xếp vào loại này — câu cho người đọc. */
  effectWhy: string;
  docKey: string;
  docNo: string;
  docType: string;
  version: number;
  /** Trạng thái chứng từ: posted / pending / error / cancelled. */
  status: string;
  branch: string;
  warehouse: string;
  lineNo: number;
  /** Có dấu: nhập +, xuất −. */
  qty: number;
  /** Thành tiền (có dấu); null = nguồn chưa có giá vốn (chờ tính giá vốn). */
  amount: number | null;
  unit: string;
  /** Chi nhánh bên kia (chuyển kho). */
  counterBranch: string | null;
  /** Hàng trả: chứng từ bán gốc (nếu chứng từ khai). */
  originalDocKey: string | null;
  isGift: boolean;
  /** Mã hàng TẠI NGÀY của sự kiện (ảnh chụp) — khác mã hiện hành khi mặt hàng đã đổi mã. */
  code: string;
  /**
   * [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23 (0.4.0-draft): làn `policy` — chính sách đã áp cho dòng này: `policyRef` của chính
   * dòng chứng từ (dòng quà, `scope = 'line'`) hoặc `policyRefs` của cả phiếu (`scope = 'doc'`). Rỗng = chứng từ không nêu chính sách.
   */
  policy?: LineagePolicyTag[];
}

/** [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23: kết quả L4b của một tham chiếu lúc nhận — `none` = chứng từ không được kiểm (không có policy_check). */
export type LineagePolicyVerdict = 'pass' | 'warn' | 'none';

/** Một chính sách gắn vào một sự kiện của Hành trình (làn `policy`). */
export interface LineagePolicyTag {
  key: string;
  version: number;
  /** Vai của dòng trong chính sách (vd `gift`) — từ `policyRef.line`; null khi tham chiếu ở cấp phiếu. */
  line: string | null;
  scope: 'line' | 'doc';
  verdict: LineagePolicyVerdict;
  /** Mã IN-POL-* của lần kiểm lúc nhận (rỗng = đạt). */
  codes: string[];
}

/** [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23: làn `policy` — một bản chính sách đã áp trên hành trình của mặt hàng, kèm phong bì sổ đăng ký. */
export interface LineagePolicyApplied {
  policyKey: string;
  version: number;
  /** null = không tìm thấy bản này trong sổ đăng ký (tham chiếu mồ côi). */
  policyId: string | null;
  ruleContract: string | null;
  ownerModule: string | null;
  status: string | null;
  contentHash: string | null;
  /** Băm nguồn gửi khớp `content_hash` của bản đã phát hành; null = chưa đăng ký. */
  hashMatches: boolean | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  legalRef: string | null;
  /** Số sự kiện kho của mặt hàng gắn bản này; số lượng hàng tặng (dòng quà); số sự kiện có cảnh báo L4b. */
  events: number;
  giftQty: number;
  warnEvents: number;
  first: string;
  last: string;
}

export interface LineageEntryLine {
  entryNo: string;
  docNo: string;
  docType: string;
  docKey: string | null;
  postingDate: string;
  account: string;
  accountName: string;
  /** Nợ / Có của dòng; dòng giá vốn chờ tính: cả hai 0 và `costFill` ≠ null. */
  debit: number;
  credit: number;
  costFill: string | null;
  part: string;
  description: string;
  /** posted | reversed (đã bị đảo bởi bút toán khác). */
  status: string;
  branch: string;
}

export interface LineageCostPeriod {
  /** YYYY-MM */
  period: string;
  costGroup: string;
  costGroupName: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  unitCost: number;
  outQty: number;
  closingQty: number;
  closingValue: number;
  /** computed | import (nhập từ Excel giá vốn tháng). */
  source: string;
}

export interface LineageItemInfo {
  /** [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: định danh bất biến (null khi chưa có — trước 0065). */
  itemId: string | null;
  /** Mọi mã đã / đang dùng của mặt hàng, theo thời gian (sku, mã vạch, bí danh, mã ngoài). */
  codes: { kind: string; code: string; validFrom: string; validTo: string | null }[];
  sku: string;
  name: string;
  unit: string;
  barcode: string;
  isActive: boolean;
  isDraft: boolean;
  /** [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: họ mặt hàng theo định danh (R-ITEM-3) — cha, con, anh em; mỗi biến thể có tồn / giá vốn riêng. */
  family: { parent: LineageFamilyMember | null; children: LineageFamilyMember[]; siblings: LineageFamilyMember[] };
}

export interface LineageFamilyMember {
  itemId: string;
  /** Mã hiện hành (mã đang mở; mặt hàng đã ngừng → mã gần nhất). */
  sku: string;
  name: string;
  status: string;
}

/**
 * [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10 (D026-5): LỊCH SỬ của một mặt hàng — mã cũ / mới, ngày hiệu lực,
 * người đổi, đổi phân loại, sửa / kích hoạt / cảnh báo có lý do. Dựng từ item_codes, item_classification, audit_logs; chỉ đọc.
 */
export type ItemHistoryKind = 'created' | 'code' | 'classification' | 'change' | 'warn-ack';
export interface ItemHistoryEntry {
  /** Lúc ghi nhận (ISO). */
  at: string;
  /** Ngày bắt đầu hiệu lực (mã, phân loại) — khác `at` khi đổi có hiệu lực từ ngày khác; null = không có khái niệm hiệu lực. */
  effectiveFrom: string | null;
  kind: ItemHistoryKind;
  /** Một câu cho người đọc. */
  text: string;
  /** Người / hệ thống làm (actor của nhật ký, created_by của bảng định danh). */
  by: string;
}
export interface ItemHistory {
  itemId: string;
  sku: string;
  entries: ItemHistoryEntry[];
  /** Danh sách bị cắt ở giới hạn. */
  truncated: boolean;
}

/**
 * [2026-11-04 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-11 (D026-5): TÁC ĐỘNG của một mặt hàng — mã này đang được dùng ở
 * chứng từ, kho, tài khoản, bảng giá, kỳ đã khoá nào; đọc TRƯỚC khi đổi mã / đổi nhóm / ngừng dùng. Chỉ đọc, theo item_id.
 */
export interface ItemImpact {
  itemId: string;
  sku: string;
  documents: { docType: string; count: number; first: string; last: string }[];
  /** Tồn hiện tại theo chi nhánh (chỉ chi nhánh còn tồn ≠ 0). */
  stock: { branchCode: string; branchName: string; qty: number }[];
  accounts: { account: string; name: string; lines: number; debit: number; credit: number }[];
  prices: { priceList: string; unit: string; price: number | null }[];
  units: { unit: string; ratio: number }[];
  /** Số tháng đã có giá vốn tính cho mặt hàng. */
  costMonths: number;
  /** Kỳ đã khoá có dòng sổ của mặt hàng (YYYY-MM, số dòng). */
  lockedPeriods: { period: string; lines: number }[];
  /** Câu cho người đọc: đổi danh mục sẽ / không ảnh hưởng gì. */
  sentences: string[];
}

export interface LineageCoverage {
  keyedBy: 'sku' | 'item_id';
  /** Câu cho người đọc: dữ liệu nào truy được, dữ liệu nào chưa (R-CONT, nói rõ phần chưa truy được). */
  notes: string[];
}

export interface LineageItem {
  item: LineageItemInfo;
  coverage: LineageCoverage;
  range: { from: string | null; to: string | null };
  events: LineageEvent[];
  entries: LineageEntryLine[];
  costPeriods: LineageCostPeriod[];
  /** [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23 (0.4.0-draft): làn `policy` — các bản chính sách đã áp trên hành trình (chỉ thêm). */
  policies?: LineagePolicyApplied[];
  summary: {
    events: number;
    accountingEvents: number;
    operationalEvents: number;
    unvaluedEvents: number;
    inQty: number;
    outQty: number;
    entries: number;
    /** Danh sách bị cắt ở mức giới hạn. */
    truncated: boolean;
  };
}

/** Vai của một sự kiện trong công thức đơn giá bình quân tháng (giải thích giá vốn). */
export type CostRole = 'in' | 'out' | 'gift' | 'internal' | 'return';

export interface CostContribution {
  at: string;
  docKey: string;
  docNo: string;
  kind: LineageKind;
  label: string;
  role: CostRole;
  roleWhy: string;
  branch: string;
  qty: number;
  amount: number | null;
}

export interface CostExplain {
  sku: string;
  period: string;
  costGroup: string;
  costGroupName: string;
  /** Hàng tháng đã tính giá vốn chưa. */
  computed: boolean;
  row: LineageCostPeriod | null;
  previous: { period: string; unitCost: number } | null;
  /** Thay đổi đơn giá so với tháng trước (%). */
  changePct: number | null;
  /** Công thức với số thật, từng dòng một câu. */
  sentences: string[];
  contributions: CostContribution[];
  /** Cộng lại từ các sự kiện liệt kê có khớp số đã lưu không; không khớp = có luật lý do (trả NCC theo tồn đầu, điều chỉnh loại trừ…). */
  reconcile: { inQty: number; inValue: number; matchesStored: boolean | null; note: string };
}

/**
 * [2026-11-21 08:55 AM Võ Hoàng] PHASE-031 — S031-23 (0.4.0-draft): TRUY NGƯỢC CHÍNH SÁCH của một sự việc / bút toán / dòng — dòng sổ → sự việc →
 * chính sách@bản (băm khớp?, hiệu lực?) → người phát hành, căn cứ pháp lý, kết quả L4b. Nối bằng khoá thật (PHASE-031 · 20 §2): không bảng mới,
 * không hàm CSDL. `GET /api/v1/lineage/policy`.
 */
export interface PolicyLineageRef {
  key: string;
  version: number;
  /** Băm nguồn gửi trong policyRefs (null khi chỉ dòng nêu policyRef, phiếu không nêu). */
  sentHash: string | null;
  policyId: string | null;
  registered: boolean;
  registryHash: string | null;
  hashMatches: boolean | null;
  /** Ngày chứng từ nằm trong hiệu lực của bản; null = chưa đăng ký hoặc chứng từ không có ngày. */
  covers: boolean | null;
  status: string | null;
  ownerModule: string | null;
  ruleContract: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  legalRef: string | null;
  reason: string | null;
  verdict: LineagePolicyVerdict;
  codes: string[];
  /** Dòng chứng từ (lineKey, không có thì số dòng) nêu chính sách này. */
  lines: string[];
}

export interface PolicyLineageDocLine {
  lineNo: number;
  lineKey: string | null;
  sku: string;
  qty: number;
  isGift: boolean;
  policy: { key: string; version: number; line: string | null } | null;
}

export interface PolicyLineageEntryLine {
  entryNo: string;
  postingDate: string;
  account: string;
  debit: number;
  credit: number;
  part: string;
  sku: string | null;
  /** posted · reversed · reversal. */
  status: string;
  /** Bản chính sách ĐỊNH KHOẢN đã dùng (ledger_entries.policy_version) — khác chính sách nghiệp vụ. */
  postingPolicyVersion: number | null;
  /** Chính sách nghiệp vụ của dòng sổ, nối qua dòng chứng từ cùng mã hàng + cờ quà (ledger_lines chưa mang lineKey); null = không nối được duy nhất. */
  policy: { key: string; version: number } | null;
}

export interface PolicyLineage {
  /** Đi từ đâu: sự việc, khoá chứng từ, hay số bút toán. */
  from: 'event' | 'docKey' | 'entry';
  event: { eventId: number; docKey: string; docNo: string; docType: string; docDate: string | null; version: number; status: string; sourceSystem: string; branch: string };
  /** Kết quả L4b lúc nhận bản hiện hành (accounting_events.policy_check). */
  check: { checkedAt: string | null; mode: string | null; verdict: LineagePolicyVerdict; codes: string[] };
  refs: PolicyLineageRef[];
  lines: PolicyLineageDocLine[];
  entries: PolicyLineageEntryLine[];
  /** Phần chưa truy được, nói rõ (R-CONT-0). */
  notes: string[];
}
