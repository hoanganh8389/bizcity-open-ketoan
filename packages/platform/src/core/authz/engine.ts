// @bizcity-layer P permissions
// [2026-11-05 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1 nền: bộ tính quyền thuần (ADR-0027 D5, 20-KIEN-TRUC §4): Cấm thắng, Cho gộp HOẶC chỉ trong lần gán chứa tài nguyên, Nới chỉ nới điều kiện, mẫu * không phủ quyền cao / quyền chưa duyệt, khoá API / trợ lý không nhận quyền cao
/**
 * authorize(input) — HÀM THUẦN: không đọc CSDL, không đọc đồng hồ (nhận `now`), không sinh ngẫu nhiên khi truyền `decisionId`.
 * Nạp lần gán / vai trò / sổ quyền là việc của store.ts; route / action gọi qua lớp tích hợp (W3).
 *
 *   0  quyền không có trong sổ → AUTHZ-PERM-UNKNOWN; 'removed' → AUTHZ-PERM-REMOVED
 *   1  quyền high + người gọi là khoá API / trợ lý → AUTHZ-HIGH-RISK-DELEGATION
 *   2  lần gán còn hiệu lực, đúng mục đích, phạm vi chứa vị trí tài nguyên (tài nguyên không có vị trí → mọi phạm vi đều chứa)
 *   3  luật khớp: đích danh luôn; mẫu * không phủ quyền high và quyền 'new' / 'changed' (chưa duyệt)
 *   4  có luật deny khớp ở BẤT KỲ lần gán sống nào → từ chối
 *   5  mỗi luật allow: điều kiện = mặc định của quyền ⊕ điều kiện luật; luật Cho nào đủ điều kiện → ĐƯỢC (muốn nới thì thêm một
 *      Cho có điều kiện rộng hơn — các lần gán sống đều chứa tài nguyên nên vẫn "cùng phạm vi"; D-AUTH-22 đã bỏ relax)
 *   6  không luật allow đạt → AUTHZ-CONDITION (kèm điều kiện trượt) hoặc AUTHZ-NO-ALLOW / AUTHZ-NOT-GRANTED-YET
 */
import { randomUUID } from 'node:crypto';
import {
  AUTHZ_REASONS, type AuthzAssignment, type AuthzCatalogEntry, type AuthzConditionKey, type AuthzConditions, type AuthzDecision,
  type AuthzMatch, type AuthzPrincipalKind, type AuthzPurpose, type AuthzResourceContext, type AuthzRole, type AuthzRule, type AuthzScope,
  type AuthzScopeResult,
} from './types.js';

export interface AuthzPrincipal { kind: AuthzPrincipalKind; id: string }

export interface AuthorizeInput {
  principal: AuthzPrincipal;
  permission: string;
  purpose?: AuthzPurpose;
  resource?: AuthzResourceContext;
  now: Date;
  authzVersion: number;
  /** Sổ quyền (Core + module) với trạng thái so bản chụp. */
  catalog: ReadonlyMap<string, AuthzCatalogEntry & { defaults?: AuthzConditions }>;
  assignments: readonly AuthzAssignment[];
  roles: ReadonlyMap<string, AuthzRole>;
  decisionId?: string;
}

export interface AuthzTraceStep { ok: boolean | null; step: string; detail: string }
export type AuthzExplained = AuthzDecision & { trace: AuthzTraceStep[] };

// ── mẫu quyền ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const patternCache = new Map<string, RegExp>();
const isWildcard = (pattern: string): boolean => pattern.includes('*');
/** `*` khớp `[a-z0-9-]*` trong một vế; không vượt dấu `:`. */
export function matchPattern(pattern: string, permission: string): boolean {
  if (!isWildcard(pattern)) return pattern === permission;
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*')}$`);
    patternCache.set(pattern, re);
  }
  return re.test(permission);
}

/**
 * Luật có áp cho quyền này không. Mẫu * của luật Cho / Nới không phủ quyền high hoặc quyền chưa duyệt (AUTHZ-03, AUTHZ-09);
 * luật Cấm dạng mẫu phủ MỌI quyền khớp — hạn chế phải chặt hơn, không lỏng hơn (vd Cấm *:*-cancel chặn cả quyền huỷ rủi ro cao).
 */
function ruleCovers(rule: AuthzRule, entry: AuthzCatalogEntry): boolean {
  if (!matchPattern(rule.pattern, entry.key)) return false;
  if (!isWildcard(rule.pattern) || rule.effect === 'deny') return true;
  return entry.risk !== 'high' && (entry.status === 'active');
}

// ── phạm vi ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const ORG_PATH_SEP = '\\';
const located = (r?: AuthzResourceContext): boolean => !!(r && (r.branchId || r.warehouseId || r.orgPath));

export function scopeContains(scope: AuthzScope, r?: AuthzResourceContext): boolean {
  if (scope.kind === 'all' || !located(r)) return true;
  switch (scope.kind) {
    case 'branch': return !!r!.branchId && r!.branchId === scope.id;
    case 'warehouse': return !!r!.warehouseId && r!.warehouseId === scope.id;
    // org_units.path nối mã bằng \ từ gốc (0062, org-unit.service.ts SEP): cây con = bằng hoặc bắt đầu bằng `<path>\`.
    case 'org_unit': return !!r!.orgPath && (r!.orgPath === scope.path || (scope.subtree && r!.orgPath.startsWith(`${scope.path}${ORG_PATH_SEP}`)));
  }
}

function assignmentLive(a: AuthzAssignment, p: AuthzPrincipal, purpose: AuthzPurpose, now: Date): boolean {
  if (a.principalKind !== p.kind || a.principalId !== p.id || a.revokedAt) return false;
  if (a.validFrom && new Date(a.validFrom) > now) return false;
  if (a.validTo && new Date(a.validTo) <= now) return false;
  return a.purposes.includes(purpose);
}

// ── điều kiện ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Việt Nam không có giờ mùa hè: ngày địa phương = UTC+7. "Trong ngày" tính theo giờ lập phiếu (Phụ lục F §15). */
const VN_OFFSET_MS = 7 * 3600_000;
const localDay = (d: Date): number => Math.floor((d.getTime() + VN_OFFSET_MS) / 86_400_000);
// [2026-11-09 03:00 PM kiennt] PHASE-028 — S028-16 (D-AUTH-22, PHASE-030 / 22 §3 #1–#3 đã duyệt 06/11): bỏ widen (Nới).

type CondFail = { condition: AuthzConditionKey; need: unknown; have: unknown };

/**
 * Kiểm điều kiện trên tài nguyên. Không có tài nguyên (kiểm trước cho menu / nút) → bỏ qua điều kiện.
 * Có tài nguyên mà thiếu trường điều kiện cần → TRƯỢT (đóng an toàn): bộ nạp tài nguyên phải nạp đủ trường.
 */
export function checkConditions(c: AuthzConditions, r: AuthzResourceContext | undefined, p: AuthzPrincipal, now: Date): CondFail | null {
  if (!r) return null;
  const today = localDay(now);
  if (c.edit_window_days != null) {
    if (!r.createdAt) return { condition: 'edit_window_days', need: c.edit_window_days, have: null };
    const age = today - localDay(new Date(r.createdAt));
    if (age > c.edit_window_days) return { condition: 'edit_window_days', need: c.edit_window_days, have: age };
  }
  if (c.creator === 'self') {
    const me = `${p.kind}:${p.id}`;
    if (r.createdBy !== me) return { condition: 'creator', need: 'self', have: r.createdBy ?? null };
  }
  if (c.amount_max != null) {
    if (r.amount == null || r.amount > c.amount_max) return { condition: 'amount_max', need: c.amount_max, have: r.amount ?? null };
  }
  if (c.view_window_days != null) {
    if (!r.docDate) return { condition: 'view_window_days', need: 'docDate', have: null };
    const back = today - localDay(new Date(r.docDate)); // dương = quá khứ
    if (back > c.view_window_days) return { condition: 'view_window_days', need: c.view_window_days, have: back };
  }
  return null;
}

// ── tính ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_STEP_UP_MINUTES = 5;

export function explain(input: AuthorizeInput): AuthzExplained {
  const { principal, permission, resource, now, catalog } = input;
  const purpose = input.purpose ?? 'operate';
  const trace: AuthzTraceStep[] = [];
  const decisionId = input.decisionId ?? `dz_${randomUUID()}`;
  const done = (allowed: boolean, reasonCode: AuthzDecision['reasonCode'], extra: Partial<AuthzDecision> = {}): AuthzExplained =>
    ({ allowed, reasonCode, decisionId, authzVersion: input.authzVersion, matched: [], ...extra, trace });

  const entry = catalog.get(permission);
  if (!entry) { trace.push({ ok: false, step: 'catalog', detail: `quyền ${permission} không có trong sổ` }); return done(false, AUTHZ_REASONS.UNKNOWN); }
  if (entry.status === 'removed') { trace.push({ ok: false, step: 'catalog', detail: `quyền ${permission} đã ngừng` }); return done(false, AUTHZ_REASONS.REMOVED); }
  trace.push({ ok: true, step: 'catalog', detail: `${permission} · rủi ro ${entry.risk ?? 'low'} · ${entry.status}` });

  if (entry.risk === 'high' && principal.kind !== 'user') {
    trace.push({ ok: false, step: 'delegation', detail: `${principal.kind} không nhận quyền rủi ro cao` });
    return done(false, AUTHZ_REASONS.HIGH_RISK_DELEGATION);
  }

  const live = input.assignments.filter((a) => assignmentLive(a, principal, purpose, now) && a.scopes.some((s) => scopeContains(s, resource)));
  trace.push({ ok: live.length > 0, step: 'assignments', detail: live.length ? `lần gán chứa tài nguyên, mục đích ${purpose}: ${live.map((a) => a.id).join(', ')}` : `không lần gán nào chứa tài nguyên với mục đích ${purpose}` });
  if (!live.length) return done(false, AUTHZ_REASONS.NO_ASSIGNMENT);

  type Hit = { a: AuthzAssignment; role: AuthzRole; rule: AuthzRule };
  const hits: Hit[] = [];
  let onlyUnreviewed = false;
  for (const a of live) {
    const role = input.roles.get(a.roleId);
    if (!role?.isActive) continue;
    for (const rule of role.rules) {
      if (ruleCovers(rule, entry)) hits.push({ a, role, rule });
      else if (matchPattern(rule.pattern, entry.key) && rule.effect === 'allow') onlyUnreviewed = true;
    }
  }
  const match = (h: Hit): AuthzMatch => ({ assignmentId: h.a.id, roleId: h.role.id, ruleId: h.rule.id });

  const deny = hits.find((h) => h.rule.effect === 'deny');
  if (deny) {
    trace.push({ ok: false, step: 'deny', detail: `luật Cấm ${deny.rule.pattern} của vai trò ${deny.role.code}` });
    return done(false, AUTHZ_REASONS.DENIED_BY_RULE, { matched: [match(deny)] });
  }

  let firstFail: CondFail | null = null;
  for (const h of hits.filter((x) => x.rule.effect === 'allow')) {
    const cond: AuthzConditions = { ...(entry.defaults ?? {}), ...(h.rule.conditions ?? {}) };
    const fail = checkConditions(cond, resource, principal, now);
    if (!fail) {
      trace.push({ ok: true, step: 'allow', detail: `luật Cho ${h.rule.pattern} của vai trò ${h.role.code}` });
      const stepUp = cond.step_up_minutes ?? (entry.risk === 'high' ? entry.stepUp ?? DEFAULT_STEP_UP_MINUTES : undefined);
      return done(true, AUTHZ_REASONS.ALLOW, { matched: [match(h)], ...(stepUp ? { stepUpMinutes: stepUp } : {}) });
    }
    trace.push({ ok: false, step: 'condition', detail: `luật Cho ${h.rule.pattern} (${h.role.code}) trượt điều kiện ${fail.condition}: cần ${JSON.stringify(fail.need)}, có ${JSON.stringify(fail.have)}` });
    firstFail ??= fail;
  }
  if (firstFail) return done(false, AUTHZ_REASONS.CONDITION, { failed: firstFail });
  if (onlyUnreviewed) {
    trace.push({ ok: false, step: 'allow', detail: 'chỉ có luật mẫu * khớp, nhưng quyền rủi ro cao hoặc chưa duyệt cần cấp đích danh' });
    return done(false, AUTHZ_REASONS.NOT_GRANTED_YET);
  }
  trace.push({ ok: false, step: 'allow', detail: 'không luật Cho nào khớp' });
  return done(false, AUTHZ_REASONS.NO_ALLOW);
}

export function authorize(input: AuthorizeInput): AuthzDecision {
  const { trace: _trace, ...decision } = explain(input);
  return decision;
}

/** Nhiều quyền một lần (menu, nút): cùng hàm với gọi lẻ — kết quả bằng nhau theo định nghĩa (T028-18). */
export function batchAuthorize(input: Omit<AuthorizeInput, 'permission'>, permissions: readonly string[]): Map<string, AuthzDecision> {
  return new Map(permissions.map((permission) => [permission, authorize({ ...input, permission })]));
}

/**
 * Phạm vi được phép cho truy vấn báo cáo / xuất: hợp các phạm vi của lần gán sống có luật Cho khớp (không điều kiện tài nguyên),
 * trừ khi có luật Cấm khớp. Route dùng `requested ∩ allowed`; rỗng là rỗng — không bao giờ "rỗng = tất cả".
 */
export function scopeOf(input: Omit<AuthorizeInput, 'resource'>): AuthzScopeResult {
  const purpose = input.purpose ?? 'report';
  const entry = input.catalog.get(input.permission);
  const none: AuthzScopeResult = { all: false, branchIds: [], warehouseIds: [], orgPaths: [] };
  if (!entry || entry.status === 'removed') return none;
  if (entry.risk === 'high' && input.principal.kind !== 'user') return none;
  const live = input.assignments.filter((a) => assignmentLive(a, input.principal, purpose, input.now));
  const granting: AuthzAssignment[] = [];
  for (const a of live) {
    const role = input.roles.get(a.roleId);
    if (!role?.isActive) continue;
    const rules = role.rules.filter((r) => ruleCovers(r, entry));
    if (rules.some((r) => r.effect === 'deny')) return none;
    if (rules.some((r) => r.effect === 'allow')) granting.push(a);
  }
  const scopes = granting.flatMap((a) => a.scopes);
  if (scopes.some((s) => s.kind === 'all')) return { all: true };
  const pick = <K extends AuthzScope['kind']>(k: K) => scopes.filter((s): s is Extract<AuthzScope, { kind: K }> => s.kind === k);
  return {
    all: false,
    branchIds: [...new Set(pick('branch').map((s) => s.id))],
    warehouseIds: [...new Set(pick('warehouse').map((s) => s.id))],
    orgPaths: [...new Set(pick('org_unit').map((s) => s.path))],
  };
}
