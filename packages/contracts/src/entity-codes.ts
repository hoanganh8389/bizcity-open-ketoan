// [2026-11-08 01:49 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-4 (D026-3): kiểu của entity_codes và resolveEntity — mã có phiên bản cho đối tượng / chi nhánh / kho
/**
 * MÃ THỰC THỂ (entity_codes, 0083). Đối tượng, chi nhánh, kho giữ bảng riêng với `id` bất biến; mã là thứ đổi được và có hiệu lực theo
 * ngày. `resolveEntity(type, ref, asOf)` trả định danh và mã hiện hành tại ngày — chứng từ cũ ghi bằng mã cũ vẫn tra ra đúng thực thể.
 * Chỉ ĐỌC. Mã lỗi viết thẳng ở đây (không phải mã chẩn đoán của cửa nạp): người gọi quyết định xử lý.
 */

/** Loại thực thể có mã phiên bản (đợt này; đơn vị tính và lý do để đợt sau). */
export const ENTITY_TYPES = ['partner', 'branch', 'warehouse'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Loại mã: code (mã chính) · alias (bí danh) · external:<nguồn> (mã của hệ thống ngoài). */
export type EntityCodeKind = 'code' | 'alias' | `external:${string}`;

/** Tham chiếu một thực thể: theo định danh (`id`) hoặc theo mã (`code`, mặc định mã chính + bí danh). */
export interface EntityRef {
  id?: string;
  code?: string;
  /** Mã của hệ thống ngoài: tra theo `external:<source>`. */
  external?: { source: string; code: string };
}

export interface EntityCodeInfo { kind: EntityCodeKind; code: string; validFrom: string; validTo: string | null }

export type EntityResolveFailureCode =
  /** Không có mã nào như vậy trong danh mục, hoặc id không thuộc đơn vị. */
  | 'ENTITY_NOT_FOUND'
  /** Có mã nhưng không hiệu lực vào ngày hỏi (kèm các khoảng hiệu lực). */
  | 'ENTITY_CODE_NOT_VALID_AT_DATE'
  /** Tham chiếu rỗng: không có id, mã hay mã ngoài để tra. */
  | 'ENTITY_REF_EMPTY';

export interface EntityResolveFailure { ok: false; code: EntityResolveFailureCode; detail: string; ref: EntityRef }

export interface EntityResolved {
  ok: true;
  type: EntityType;
  /** Định danh bất biến (id của bảng thực thể). */
  entityId: string;
  /** Mã chính hiệu lực tại ngày hỏi (hoặc mã gần nhất nếu thực thể đã bị xoá / đóng mã trước ngày đó). */
  code: EntityCodeInfo | null;
  /** Mã được tra đi qua bí danh / mã ngoài thì ghi mã đã gửi ở đây. */
  matched?: EntityCodeInfo;
}

export type EntityResolveResult = EntityResolved | EntityResolveFailure;
