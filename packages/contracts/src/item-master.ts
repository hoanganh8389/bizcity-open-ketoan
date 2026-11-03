// [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a (S024-4 / 6): bizcity_item_master@1 — định danh bất biến, mã có phiên bản, phân loại theo ngày, kết quả tra mã (Item Resolver)
/**
 * ITEM MASTER (bizcity_item_master@1, ADR-0017, R-ITEM). Một mặt hàng = một `item_id` (ULID) bất biến; mã hàng là CÁCH TRA, có phiên bản
 * và ngày hiệu lực; phân loại hạch toán đổi theo ngày. Dòng chứng từ / sổ giữ `item_id`; mã chỉ là ảnh chụp tại ngày.
 *
 *   items                 item_id, tên, đơn vị gốc, trạng thái (draft | active | retired), thuộc tính
 *   item_codes            (kind, code, valid_from, valid_to) → item_id — chỉ thêm, UPDATE duy nhất là đóng valid_to
 *   item_classification   (valid_from, valid_to) → loại, nhóm hạch toán, thuế, theo dõi; kind null = chưa phân loại (R-ITEM-8)
 *
 * B2a: chạy SONG SONG với products (trigger đồng bộ, chưa ai đọc ngoài Item Resolver). Hợp đồng nhập / xuất cho plugin (itemId,
 * barcode trên dòng hàng của bizcity_ledger_intake) và action core.item.* thêm ở các bước sau (S024-4 phần còn lại, S024-11).
 */

/** Loại mã. `external:<nguồn>` = mã của hệ thống ngoài (vd external:pos-mini). */
export type ItemCodeKind = 'sku' | 'barcode' | 'alias' | `external:${string}`;
export const ITEM_CODE_KIND_RE = /^(sku|barcode|alias|external:[a-z0-9_.-]{1,32})$/;

export const ITEM_KINDS = ['goods', 'material', 'finished', 'service', 'tool', 'asset', 'gift', 'packaging', 'other'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  goods: 'Hàng hoá', material: 'Nguyên vật liệu', finished: 'Thành phẩm', service: 'Dịch vụ', tool: 'Công cụ dụng cụ', asset: 'Tài sản',
  gift: 'Hàng tặng / khuyến mại', packaging: 'Bao bì', other: 'Khác',
};

export type ItemStatus = 'draft' | 'active' | 'retired';

/** ULID Crockford base32, 26 ký tự (D024-1). */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const isItemId = (v: unknown): v is string => typeof v === 'string' && ULID_RE.test(v);

/** Cách tra một mặt hàng. Thứ tự thử: itemId → sku → barcode → external. */
export interface ItemRef {
  itemId?: string;
  sku?: string;
  barcode?: string;
  external?: { source: string; code: string };
}

export interface ItemCodeInfo { kind: ItemCodeKind; code: string; validFrom: string; validTo: string | null }

export interface ItemClassificationInfo {
  validFrom: string;
  validTo: string | null;
  kind: ItemKind | null;
  postingGroupCode: string | null;
  taxOutCode: string | null;
  taxInCode: string | null;
  exciseRate: number | null;
  track: string[];
}

export interface ResolvedItem {
  itemId: string;
  name: string;
  unitBase: string;
  status: ItemStatus;
  /** Mã đã dùng để tra (hoặc mã sku hiệu lực tại ngày khi tra bằng itemId). */
  code: ItemCodeInfo;
  /** Phân loại hiệu lực tại ngày; null = chưa có bản nào. */
  classification: ItemClassificationInfo | null;
  /** Chưa phân loại (không có bản, hoặc kind null) — R-ITEM-8: không được định khoản lặng lẽ bằng nhóm mặc định. */
  unclassified: boolean;
  /** Đơn vị tính → hệ số quy đổi về đơn vị gốc (đơn vị gốc = 1). */
  units: Record<string, number>;
  /** Có khi mã tra là bí danh (mặt hàng đã gộp mã, D024-8). */
  alias?: { fromCode: string };
}

/**
 * Tra không ra:
 *   IN-ITEM-001  mã chưa có trong danh mục
 *   IN-ITEM-002  mã có nhưng KHÔNG có hiệu lực tại ngày (đã đóng hoặc chưa bắt đầu) — `detail` nêu các khoảng hiệu lực
 *   IN-ITEM-008  itemId không thuộc đơn vị / không có
 * (Mã IN-ITEM-002 / 008 khai vào thư viện mã khi tích hợp tiền kiểm — S024-7.)
 */
export type ResolveFailureCode = 'IN-ITEM-001' | 'IN-ITEM-002' | 'IN-ITEM-008';
export interface ResolveFailure { ok: false; code: ResolveFailureCode; detail: string; ref: ItemRef }
export type ResolveResult = ({ ok: true } & ResolvedItem) | ResolveFailure;
