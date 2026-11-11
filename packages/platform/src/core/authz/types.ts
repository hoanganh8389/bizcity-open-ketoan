// @bizcity-layer P permissions
// [2026-11-05 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 nền: bizcity_authorization@1 — khuôn quyền, bí danh, vai trò, luật Cho / Nới / Cấm, lần gán theo phạm vi × mục đích, quyết định có mã lý do (ADR-0027)
/**
 * PHÂN QUYỀN (bizcity_authorization@1, ADR-0027, docs/contracts/BIZCITY-AUTHORIZATION-v1.md). Kiểu dùng chung cho Platform (bộ tính),
 * API (Role Editor), web (hiển thị), module (khai quyền). Không chứa logic tính — bộ tính ở @bizcity/platform/core/authz.
 *
 *   quyền        `<module>:<việc>` (khuôn bizcity_module@1), sổ quyền nằm trong CODE; CSDL chỉ giữ bản chụp đã thấy
 *   vai trò      của đơn vị; loại system (6 vai trò cũ, khoá) / job / privilege / restriction / personal
 *   luật         mẫu quyền + hiệu lực allow (Cho) / deny (Cấm — luôn thắng) + điều kiện (D-AUTH-22: đã bỏ relax)
 *   lần gán      người (khoá API / trợ lý) × vai trò × phạm vi[] × mục đích[] × hiệu lực từ–đến
 *   quyết định   { allowed, reasonCode, decisionId, authzVersion, matched, failed } — cùng một kết quả cho API, nút Giải thích, nhật ký
 */

/** Khoá quyền — giữ đúng khuôn của bizcity_module@1 `permissions[].key`. */
export const PERMISSION_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
/** Mẫu quyền trong luật: khoá đích danh, hoặc có `*` (khớp `[a-z0-9-]*` trong một vế), vd `quy:*`, `*:*-read`, `ban-hang:sales-order-*`. */
export const PERMISSION_PATTERN_RE = /^[a-z*][a-z0-9*-]*:[a-z*][a-z0-9*-]*$/;
/** Bí danh mã cũ có không gian tên — không bao giờ là khoá quyền (AUTHZ-02). */
export const PERMISSION_ALIAS_RE = /^(tgs|htsoft|repo):[A-Za-z0-9_.-]+$/;

export const AUTHZ_RISKS = ['low', 'high'] as const;
export type AuthzRisk = (typeof AUTHZ_RISKS)[number];

/** Thao tác chuẩn. Không có `delete`: chứng từ đã ghi sổ chỉ huỷ bằng đảo bút toán (AUTHZ-12). */
export const AUTHZ_OPERATIONS = ['read', 'create', 'update', 'cancel', 'void', 'reverse', 'approve', 'print', 'export', 'import', 'run', 'configure', 'manage'] as const;
export type AuthzOperation = (typeof AUTHZ_OPERATIONS)[number];

export const AUTHZ_PURPOSES = ['operate', 'approve', 'report', 'export'] as const;
export type AuthzPurpose = (typeof AUTHZ_PURPOSES)[number];

// [2026-11-09 03:00 PM kiennt] PHASE-028 — S028-16 (D-AUTH-22, PHASE-030 / 22 §3 #1–#3 đã duyệt 06/11): bỏ hiệu lực Nới (relax) — muốn nới thì thêm một luật Cho có điều kiện rộng hơn (Cho hợp trong cùng phạm vi)
export const AUTHZ_EFFECTS = ['allow', 'deny'] as const;
export type AuthzEffect = (typeof AUTHZ_EFFECTS)[number];

export const AUTHZ_ROLE_KINDS = ['system', 'job', 'privilege', 'restriction', 'personal'] as const;
export type AuthzRoleKind = (typeof AUTHZ_ROLE_KINDS)[number];

export const AUTHZ_PRINCIPAL_KINDS = ['user', 'apikey', 'agent'] as const;
export type AuthzPrincipalKind = (typeof AUTHZ_PRINCIPAL_KINDS)[number];

export const AUTHZ_SCOPE_KINDS = ['all', 'org_unit', 'branch', 'warehouse'] as const;
export type AuthzScopeKind = (typeof AUTHZ_SCOPE_KINDS)[number];

/** Trạng thái quyền trong sổ (so bản chụp đã thấy). */
export const AUTHZ_PERMISSION_STATUSES = ['new', 'active', 'changed', 'removed'] as const;
export type AuthzPermissionStatus = (typeof AUTHZ_PERMISSION_STATUSES)[number];

/** Một quyền trong sổ (Core hoặc module). Mọi trường ngoài key / label / module là tuỳ chọn ở v1. */
export interface AuthzPermissionDef {
  key: string;
  label: string;
  /** `core` cho 18 quyền Core; khoá module cho quyền module. */
  module: string;
  risk?: AuthzRisk;
  resource?: string;
  operation?: AuthzOperation | (string & {});
  /** `field`: che trường (giá vốn, lợi nhuận, lương); `pii`: dữ liệu cá nhân. */
  sensitive?: 'field' | 'pii';
  scopeKinds?: Exclude<AuthzScopeKind, 'all'>[];
  /** Phút xác thực lại; mặc định 5 khi risk = high. */
  stepUp?: number;
  aliases?: string[];
  /** Gợi ý preset (bizcity_module@1 `roles`) — KHÔNG tự cấp (AUTHZ-03). */
  suggestedRoles?: string[];
  since?: string;
  replaces?: string;
  // [2026-11-09 05:00 PM kiennt] PHASE-028 — giai đoạn 3.1: quyền gốc kéo theo quyền này (documents:write → quyền chứng từ chi tiết) — luật Cấm khớp quyền gốc cũng phủ quyền này
  impliedBy?: string[];
}

export interface AuthzCatalogEntry extends AuthzPermissionDef {
  status: AuthzPermissionStatus;
  /** Băm nghĩa (risk, resource, operation, sensitive): đổi băm = đổi nghĩa (SC-AUTH-05). */
  hash: string;
}

// [2026-11-09 03:00 PM kiennt] PHASE-028 — S028-16 (D-AUTH-22, PHASE-030 / 22 §3 #1–#3 đã duyệt 06/11): điều kiện 8 → 5. Hạn theo NGÀY CHỨNG TỪ thuộc khoá ngày (dataLock, date-rules.ts) — bỏ doc_date_back_days,
// doc_date_forward_days, respect_lock_date; trạng thái nào sửa / chuyển được thuộc workflow — bỏ status_in.
/** Danh mục điều kiện ĐÓNG (thêm khoá mới = sửa bộ tính ở Platform). Đơn vị ngày tính theo giờ lập phiếu (Phụ lục F §15). */
export interface AuthzConditions {
  /** Sửa / huỷ trong N ngày kể từ lúc LẬP (không phải ngày chứng từ); 0 = trong ngày; null = không giới hạn. */
  edit_window_days?: number | null;
  /** Người lập: chỉ của mình < cùng chi nhánh < tất cả. */
  creator?: 'self' | 'branch' | 'all';
  /** Hạn mức duyệt cá nhân (VND). Số CẤP duyệt theo khoảng tiền là việc của chính sách duyệt, không phải điều kiện này. */
  amount_max?: number | null;
  /** Chỉ xem dữ liệu trong N ngày gần nhất (báo cáo). */
  view_window_days?: number | null;
  /** Phút xác thực lại. */
  step_up_minutes?: number;
}
export const AUTHZ_CONDITION_KEYS = ['edit_window_days', 'creator', 'amount_max', 'view_window_days', 'step_up_minutes'] as const;
export type AuthzConditionKey = (typeof AUTHZ_CONDITION_KEYS)[number];

export interface AuthzRule {
  id: string;
  pattern: string;
  effect: AuthzEffect;
  conditions?: AuthzConditions;
  note?: string;
}

export interface AuthzRole {
  id: string;
  code: string;
  label: string;
  kind: AuthzRoleKind;
  isActive: boolean;
  rules: AuthzRule[];
}

export type AuthzScope =
  | { kind: 'all' }
  | { kind: 'org_unit'; id: string; /** đường dẫn cây (org_units.path) để so cây con */ path: string; subtree: boolean }
  | { kind: 'branch'; id: string }
  | { kind: 'warehouse'; id: string };

export interface AuthzAssignment {
  id: string;
  principalKind: AuthzPrincipalKind;
  principalId: string;
  roleId: string;
  scopes: AuthzScope[];
  purposes: AuthzPurpose[];
  validFrom?: string | null;
  validTo?: string | null;
  revokedAt?: string | null;
}

/** Vị trí + thuộc tính của tài nguyên — Platform giải quyết ở SERVER từ bản ghi, không lấy từ payload (AUTHZ-11). */
export interface AuthzResourceContext {
  type?: string;
  id?: string;
  branchId?: string | null;
  warehouseId?: string | null;
  /** org_units.path của nút chứa chi nhánh. */
  orgPath?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  docDate?: string | null;
  status?: string | null;
  amount?: number | null;
}

/** Mã lý do — dựng câu báo từ mã (ADR-0020 #3, R-GATE-10). */
export const AUTHZ_REASONS = {
  ALLOW: 'AUTHZ-ALLOW',
  UNKNOWN: 'AUTHZ-PERM-UNKNOWN',
  NOT_GRANTED_YET: 'AUTHZ-PERM-NOT-GRANTED-YET',
  REMOVED: 'AUTHZ-PERM-REMOVED',
  NO_ASSIGNMENT: 'AUTHZ-NO-ASSIGNMENT',
  NO_ALLOW: 'AUTHZ-NO-ALLOW',
  DENIED_BY_RULE: 'AUTHZ-DENIED-BY-RULE',
  CONDITION: 'AUTHZ-CONDITION',
  HIGH_RISK_DELEGATION: 'AUTHZ-HIGH-RISK-DELEGATION',
} as const;
export type AuthzReasonCode = (typeof AUTHZ_REASONS)[keyof typeof AUTHZ_REASONS];

export interface AuthzMatch { assignmentId: string; roleId: string; ruleId: string }

export interface AuthzDecision {
  allowed: boolean;
  reasonCode: AuthzReasonCode;
  decisionId: string;
  authzVersion: number;
  matched: AuthzMatch[];
  /** Điều kiện trượt của luật gần đạt nhất (để dựng câu báo). */
  failed?: { condition: AuthzConditionKey; need: unknown; have: unknown };
  /** Cần xác thực lại trong N phút trước khi thực hiện (quyền high). */
  stepUpMinutes?: number;
}

/** Phạm vi được phép cho truy vấn báo cáo / xuất (scopeOf): `all` hoặc danh sách — giao với bộ lọc người dùng chọn. */
export type AuthzScopeResult = { all: true } | { all: false; branchIds: string[]; warehouseIds: string[]; orgPaths: string[] };
