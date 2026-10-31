// @bizcity-layer P documents
// [2026-10-31 03:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — máy trạng thái khai báo documents.workflow: tệp *.workflow.yaml, 5 nhóm chuẩn, duyệt nhiều cấp, tách nhiệm, chỉ người lập, bắt buộc lý do (PHASES 3.5).
/**
 * Máy trạng thái khai báo (năng lực `documents.workflow`, bizcity_document@1 §5, R-WF-1…7).
 * Mỗi loại chứng từ một tệp `<loại>.workflow.yaml` cạnh mã của phân hệ:
 *   states       trạng thái → nhóm chuẩn (draft / pending / approved / done / cancelled) + nhãn tiếng Việt
 *   transitions  chuyển: từ đâu (`from`), sang đâu (`to`), quyền (một quyền, hoặc theo trạng thái nguồn), `sod` (người duyệt khác
 *                người lập), `owner` (chỉ người lập, trừ khi có quyền ghi ở đây), `requires: [reason]`, `ledger` (chuyển chạm sổ);
 *                hoặc `levels` — duyệt nhiều cấp: số cấp chứng từ cần (`levelsRequired`) do phân hệ tính từ ngưỡng cấu hình (R-WF-6),
 *                đủ cấp thì nhảy thẳng sang đích của cấp cuối.
 * Runtime chỉ QUYẾT ĐỊNH (`plan`): trạng thái hiện tại có được chuyển không, ai được chuyển, sang đâu. Ghi trạng thái, cột riêng
 * (người duyệt, lúc duyệt…) và nộp sổ là việc của action phân hệ; bằng chứng do action runtime ghi (STD-DOC-3).
 * Tệp YAML được chép sang dist khi dựng (apps/api/scripts/chep-tep-khai-bao.mjs).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { PERMISSIONS, type AuthContext, type Permission } from './auth.js';
import { Errors } from './errors.js';

export const STATUS_GROUPS = ['draft', 'pending', 'approved', 'done', 'cancelled'] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

const stateName = z.string().regex(/^[a-z][a-z0-9_]*$/, 'tên trạng thái: chữ thường, số, gạch dưới');
const permission = z.enum(PERMISSIONS);
const levelSchema = z.object({
  from: stateName, to: stateName, permission,
  denied: z.string().min(1).optional().describe('Thông báo khi thiếu quyền cấp này'),
}).strict();
const transitionSchema = z.object({
  title: z.string().min(1).optional().describe('Tên chuyển cho thông báo, nút; mặc định = tên chuyển'),
  from: z.array(stateName).min(1).optional(),
  to: stateName.optional(),
  permission: z.union([permission, z.record(stateName, permission)]).optional(),
  levels: z.array(levelSchema).min(2).optional(),
  sod: z.boolean().default(false),
  owner: permission.optional().describe('Chỉ người lập được chuyển, trừ khi có quyền này'),
  requires: z.array(z.enum(['reason'])).default([]),
  ledger: z.boolean().default(false).describe('Chuyển này nộp / huỷ sự việc kế toán (R-WF-3)'),
  blocked: z.record(z.union([stateName, z.literal('*')]), z.string().min(1)).default({}).describe('Thông báo riêng khi đang ở trạng thái không chuyển được; "*" = mọi trạng thái còn lại'),
  denied: z.string().min(1).optional(),
}).strict();
const workflowSchema = z.object({
  type: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'type dạng <module>.<loại>'),
  label: z.string().min(1).optional().describe('Tên loại chứng từ cho thông báo; mặc định = type'),
  states: z.record(stateName, z.object({ group: z.enum(STATUS_GROUPS), label: z.string().min(1).optional() }).strict()),
  transitions: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/, 'tên chuyển: chữ thường, số, gạch nối'), transitionSchema),
}).strict();

type RawSpec = z.infer<typeof workflowSchema>;
type TransitionSpec = RawSpec['transitions'][string] & { title: string };
/** Workflow đã đọc, nhãn / tên chuyển thiếu đã điền mặc định. */
export interface WorkflowSpec {
  type: string; label: string;
  states: Record<string, { group: StatusGroup; label: string }>;
  transitions: Record<string, TransitionSpec>;
}
const normalize = (r: RawSpec): WorkflowSpec => ({
  type: r.type,
  label: r.label ?? r.type,
  states: Object.fromEntries(Object.entries(r.states).map(([k, v]) => [k, { group: v.group, label: v.label ?? k }])),
  transitions: Object.fromEntries(Object.entries(r.transitions).map(([k, t]) => [k, { ...t, title: t.title ?? k }])),
});

/** Chứng từ đang xét: trạng thái, người lập, số cấp duyệt cần (khi có `levels`). */
export interface WorkflowDoc { status: string; createdBy?: string | null; levelsRequired?: number | null }
export interface WorkflowActor { id: string; can(p: Permission): boolean }
/** Người chuyển lấy từ AuthContext (phân hệ chưa chuyển sang defineAction; trong action dùng ctx.actor.id + ctx.can). */
export const workflowActor = (auth: AuthContext): WorkflowActor => ({ id: auth.actor, can: (p) => auth.permissions.has(p) });
export interface WorkflowStep {
  verb: string; from: string; to: string; group: StatusGroup;
  /** Cấp vừa duyệt (1, 2…) khi chuyển có `levels`. */
  level?: number;
  ledger: boolean;
}

/** Kiểm nghĩa (ngoài khuôn): trạng thái tham chiếu có thật, cấp duyệt nối nhau, chuyển chạm sổ đúng chỗ. */
function semanticErrors(s: WorkflowSpec): string[] {
  const out: string[] = [];
  const has = (st: string) => Object.hasOwn(s.states, st);
  const groupOf = (st: string) => s.states[st]?.group;
  if (!Object.values(s.states).some((x) => x.group === 'draft')) out.push('cần ít nhất một trạng thái nhóm draft');
  for (const [verb, t] of Object.entries(s.transitions)) {
    const at = `transitions.${verb}`;
    if (t.levels) {
      if (t.from || t.to || t.permission) out.push(`${at}: đã khai levels thì không khai from / to / permission`);
      t.levels.forEach((l, i) => {
        for (const st of [l.from, l.to]) if (!has(st)) out.push(`${at}.levels[${i}]: trạng thái "${st}" chưa khai`);
        const next = t.levels![i + 1];
        if (next && next.from !== l.to) out.push(`${at}.levels[${i + 1}].from phải là "${l.to}" (đích của cấp ${i + 1})`);
        if (groupOf(l.from) !== 'pending') out.push(`${at}.levels[${i}].from "${l.from}" phải thuộc nhóm pending`);
        if (next && groupOf(l.to) !== 'pending') out.push(`${at}.levels[${i}].to "${l.to}" (cấp giữa) phải thuộc nhóm pending`);
      });
      const last = t.levels.at(-1)!;
      if (groupOf(last.to) !== 'approved') out.push(`${at}: cấp cuối phải sang trạng thái nhóm approved`);
      continue;
    }
    if (!t.from || !t.to || !t.permission) { out.push(`${at}: cần from, to, permission (hoặc levels)`); continue; }
    for (const st of [...t.from, t.to]) if (!has(st)) out.push(`${at}: trạng thái "${st}" chưa khai`);
    if (typeof t.permission === 'object') {
      for (const st of t.from) if (!t.permission[st]) out.push(`${at}.permission: thiếu quyền cho trạng thái nguồn "${st}"`);
      for (const st of Object.keys(t.permission)) if (!t.from.includes(st)) out.push(`${at}.permission: "${st}" không thuộc from`);
    }
    // R-WF-3: chỉ chuyển sang đã duyệt / hoàn tất / huỷ, hoặc rút khỏi đã duyệt / hoàn tất, mới chạm sổ.
    const touches = ['approved', 'done', 'cancelled'].includes(groupOf(t.to) ?? '') || t.from.every((st) => ['approved', 'done'].includes(groupOf(st) ?? ''));
    if (t.ledger && !touches) out.push(`${at}: ledger chỉ dùng cho chuyển sang nhóm approved / done / cancelled hoặc rút khỏi approved / done (R-WF-3)`);
    if (t.sod && t.owner) out.push(`${at}: sod (người chuyển khác người lập) và owner (chỉ người lập) loại trừ nhau`);
  }
  for (const [verb, t] of Object.entries(s.transitions)) {
    for (const st of Object.keys(t.blocked)) if (st !== '*' && !has(st)) out.push(`transitions.${verb}.blocked: trạng thái "${st}" chưa khai`);
  }
  return out;
}

export class Workflow {
  constructor(readonly spec: WorkflowSpec, readonly source: string) {}

  get type(): string { return this.spec.type; }
  group(state: string): StatusGroup | undefined { return this.spec.states[state]?.group; }
  label(state: string): string { return this.spec.states[state]?.label ?? state; }
  labels(): Record<string, string> { return Object.fromEntries(Object.entries(this.spec.states).map(([k, v]) => [k, v.label])); }
  /** Các trạng thái thuộc một nhóm chuẩn (vd lọc "đang chờ duyệt" = nhóm pending). */
  statesIn(group: StatusGroup): string[] { return Object.entries(this.spec.states).filter(([, v]) => v.group === group).map(([k]) => k); }
  /** Sửa nội dung được khi trạng thái thuộc nhóm draft (bizcity_document@1 §5). */
  editable(state: string): boolean { return this.group(state) === 'draft'; }
  transition(verb: string): TransitionSpec {
    const t = this.spec.transitions[verb];
    if (!t) throw new Error(`${this.source}: chưa khai chuyển "${verb}"`);
    return t;
  }
  /** Quyền vào action của chuyển: quyền duy nhất nếu có; chuyển theo cấp / theo trạng thái thì kiểm trong `plan`. */
  gate(verb: string): Permission {
    const t = this.transition(verb);
    return typeof t.permission === 'string' ? t.permission : 'documents:read';
  }
  requiresReason(verb: string): boolean { return this.transition(verb).requires.includes('reason'); }

  /**
   * Quyết định một chuyển: ném CONFLICT (trạng thái không cho), FORBIDDEN (thiếu quyền, tách nhiệm, không phải người lập),
   * VALIDATION_ERROR (thiếu lý do). Trả trạng thái đích; chưa ghi gì.
   */
  plan(verb: string, doc: WorkflowDoc, actor: WorkflowActor, input: { reason?: string } = {}): WorkflowStep {
    const t = this.transition(verb);
    const from = doc.status;
    const blocked = () => Errors.conflict(t.blocked[from] ?? t.blocked['*'] ?? `${this.spec.label} đang "${this.label(from)}": không ${t.title.toLowerCase()} được`);
    let to: string, need: Permission, denied = t.denied, level: number | undefined;
    if (t.levels) {
      const i = t.levels.findIndex((l) => l.from === from);
      if (i < 0) throw blocked();
      const l = t.levels[i]!;
      level = i + 1;
      const required = Math.min(Math.max(doc.levelsRequired ?? 1, 1), t.levels.length);
      to = level >= required ? t.levels.at(-1)!.to : l.to;
      need = l.permission;
      denied = l.denied ?? denied;
    } else {
      if (!t.from!.includes(from)) throw blocked();
      to = t.to!;
      need = typeof t.permission === 'string' ? t.permission : t.permission![from]!;
    }
    if (!actor.can(need)) throw Errors.forbidden(denied ?? `Bạn không có quyền ${t.title.toLowerCase()} ${this.spec.label.toLowerCase()}`);
    if (t.sod && doc.createdBy && doc.createdBy === actor.id) throw Errors.forbidden(`Người ${t.title.toLowerCase()} phải khác người lập ${this.spec.label.toLowerCase()} (tách nhiệm)`);
    if (t.owner && doc.createdBy && doc.createdBy !== actor.id && !actor.can(t.owner)) {
      throw Errors.forbidden(`Bạn chỉ ${t.title.toLowerCase()} được ${this.spec.label.toLowerCase()} do chính mình lập`);
    }
    if (t.requires.includes('reason') && !input.reason?.trim()) throw Errors.validation(`Cần ghi lý do khi ${t.title.toLowerCase()}`);
    return { verb, from, to, group: this.group(to)!, level, ledger: t.ledger };
  }

  /** Các chuyển người này làm được với chứng từ này (giao diện hiện nút, AI biết bước kế). */
  allowed(doc: WorkflowDoc, actor: WorkflowActor): string[] {
    return Object.keys(this.spec.transitions).filter((verb) => {
      try { this.plan(verb, doc, actor, { reason: 'x' }); return true; } catch { return false; }
    });
  }
}

/** Đọc và kiểm một workflow từ nội dung YAML. Sai khuôn / sai nghĩa → Error nêu đủ chỗ sai (lỗi lập trình, không phải lỗi người dùng). */
export function parseWorkflow(text: string, source: string): Workflow {
  let raw: unknown;
  try { raw = parse(text); } catch (e) { throw new Error(`${source}: YAML sai — ${(e as Error).message}`); }
  const r = workflowSchema.safeParse(raw);
  if (!r.success) throw new Error(`${source}: ${r.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`).join('; ')}`);
  const spec = normalize(r.data);
  const errs = semanticErrors(spec);
  if (errs.length) throw new Error(`${source}: ${errs.join('; ')}`);
  return new Workflow(spec, source);
}

const cache = new Map<string, Workflow>();
/** Nạp tệp workflow cạnh mã phân hệ: `loadWorkflow(new URL('./x.workflow.yaml', import.meta.url))`. Đọc một lần mỗi tiến trình. */
export function loadWorkflow(url: URL): Workflow {
  const hit = cache.get(url.href);
  if (hit) return hit;
  const file = fileURLToPath(url);
  const wf = parseWorkflow(readFileSync(file, 'utf8'), file);
  cache.set(url.href, wf);
  return wf;
}
