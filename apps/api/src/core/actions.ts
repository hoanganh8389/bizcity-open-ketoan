// @bizcity-layer P actions
/**
 * RUNTIME ACTION (bizcity_action@1, PHASES 2.5) — một khai báo `defineAction` sinh route HTTP + mô tả OpenAPI; registry dùng chung
 * cho MCP (2.12), CLI. Runtime làm thay handler các bước ACTION §4:
 *   quyền → kiểm input (zod) → idempotency (action_requests) → mở giao dịch → handler → bằng chứng (audit_logs) → lưu phản hồi
 *   → commit, hoặc rollback khi dry-run → { ok, data, meta: { requestId, dryRun?, idempotency?, receipt? } }.
 * Bằng chứng (bizcity_evidence@1): action ghi chạy thật → đúng một bản ghi audit_logs (kể cả khi lỗi nghiệp vụ, ở giao dịch riêng),
 * biên nhận meta.receipt = { evidenceId, hash, at }; gửi lặp trả lại biên nhận lần đầu.
 * Handler không gọi requirePermission, writeAudit, reply.status, không tự mở giao dịch (ACTION §4).
 *
 * Idempotency (§8): header `Idempotency-Key` (8–128 ký tự). Dòng action_requests ghi trong CÙNG giao dịch với handler: lỗi thì
 * không có dòng (gửi lại được); hai yêu cầu cùng khoá song song → yêu cầu sau chờ khoá duy nhất của yêu cầu trước rồi trả lại
 * phản hồi đó. Dry-run (`?dryRun=1`): chạy thật trong giao dịch rồi huỷ — mẫu tro-ly /simulate; không ghi idempotency, bằng chứng.
 *
 * Trước Phase 3 (tách @bizcity/module-sdk) ctx còn `legacyAuth` để handler đang chuyển gọi service cũ cần AuthContext
 * (voucherService…). Không đưa vào SDK — packages/module-sdk/API.md §5.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from '@ketoan/contracts';
import { db } from '../db/client.js';
import type { Database } from '../db/types.js';
import { env } from '../config/env.js';
import { writeEvidence, type EvidenceEntry, type EvidenceReceipt } from './audit.js';
import { AppError, Errors } from './errors.js';
import { ok, queryBool } from './http.js';
import { metrics } from './metrics.js';
import type { AuthContext, Permission } from './auth.js';

export type ActionEffect = 'read' | 'write';
export type ActionIdempotency = 'required' | 'natural' | 'none';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Capability Contract (CONG-BO-KIEN-TRUC §3): action ghi chạm vào đâu — ledger = có thể sinh bút toán (qua một cửa sổ cái). */
export type ActionSideEffect = 'documents' | 'ledger' | 'masterdata' | 'settings' | 'external';

export interface ActionContext {
  readonly actor: { id: string; name: string; kind: AuthContext['kind'] };
  readonly tenant: { id: string };
  readonly requestId: string;
  readonly dryRun: boolean;
  /** Người gọi có quyền này không (quyền phụ trong handler, vd duyệt cấp 2). */
  can(permission: Permission): boolean;
  data: { tx: Transaction<Database> };
  evidence: { note(key: string, value: unknown): void };
  /** @deprecated Cầu nối Phase 2→3 cho service cũ cần AuthContext. Không có trong @bizcity/module-sdk. */
  readonly legacyAuth: AuthContext;
}

export interface ActionDef<I extends z.AnyZodObject = z.AnyZodObject, O extends z.ZodTypeAny = z.ZodTypeAny> {
  /** `<module>.<thực thể>.<động từ>` (STD-ACT-6), không đổi sau khi phát hành. */
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  input: I;
  output: O;
  /** STD-ACT-2. 'public' chỉ cho action đọc, kèm lý do trong manifest `waivers`. */
  permission: Permission | 'public';
  effect: ActionEffect;
  /** STD-ACT-4: write ⇒ không 'none'. 'natural' = đặt trạng thái tuyệt đối / có kiểm trạng thái, gửi lại không tạo thêm gì. */
  idempotency: ActionIdempotency;
  /** Tác dụng phụ (bắt buộc với effect write, cấm với read). Bằng chứng: write → biên nhận (receipt), read → không. */
  sideEffects?: ActionSideEffect[];
  /** Cho phép ?dryRun=1 (STD-ACT-7: không hiệu ứng ngoài giao dịch). */
  dryRun?: boolean;
  expose: {
    http?: { method: HttpMethod; path: string; status?: 200 | 201 };
    mcp?: boolean;
    ai?: 'deny' | 'read' | 'propose' | 'execute';
  };
  errors?: ErrorCode[];
  /** Đối tượng ghi vào bằng chứng (mặc định: thực thể trong id, mã = output.id). */
  evidence?: { objectType?: string; objectId?: (input: z.infer<I>, output: z.infer<O>) => string | undefined };
  handler(ctx: ActionContext, input: z.infer<I>): Promise<z.infer<O>>;
}

/** Action bất kỳ (đã xoá kiểu input / output) — cho registry và danh sách action của một module. */
export type AnyActionDef = ActionDef<any, any>;

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2,}$/;
const registry = new Map<string, AnyActionDef>();

/** Khai báo action; kiểm các luật đọc được từ khai báo (STD-ACT-2, -4, -6) ngay lúc nạp. */
export function defineAction<I extends z.AnyZodObject, O extends z.ZodTypeAny>(def: ActionDef<I, O>): ActionDef<I, O> {
  if (!ID_RE.test(def.id)) throw new Error(`Mã action không đúng dạng <module>.<thực thể>.<động từ>: ${def.id}`);
  if (!def.permission) throw new Error(`Action ${def.id} thiếu permission (STD-ACT-2)`);
  if (def.effect === 'write' && def.idempotency === 'none') throw new Error(`Action ghi ${def.id} phải có idempotency 'required' hoặc 'natural' (STD-ACT-4)`);
  if (def.effect === 'write' && def.permission === 'public') throw new Error(`Action ghi ${def.id} không được công khai (STD-ACT-2)`);
  if (def.effect === 'write' && def.expose.ai === 'execute') throw new Error(`Action ghi ${def.id} không được expose.ai = 'execute' trong v1 (ACTION §6)`);
  if (def.effect === 'write' && !def.sideEffects?.length) throw new Error(`Action ghi ${def.id} phải khai sideEffects (Capability Contract)`);
  if (def.effect === 'read' && def.sideEffects?.length) throw new Error(`Action đọc ${def.id} không được có sideEffects`);
  return def;
}

/** Mọi action đã gắn route (cho /system/capabilities, MCP 2.12). */
export function listActions(): AnyActionDef[] {
  return [...registry.values()];
}

/** Băm input đã chuẩn hoá (khoá sắp xếp) để so hai lần gửi cùng Idempotency-Key. */
export function requestHash(input: unknown): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' && !(v instanceof Date)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
      : v;
  return createHash('sha256').update(JSON.stringify(norm(input))).digest('hex');
}

class DryRunRollback extends Error {
  constructor(readonly output: unknown) {
    super('dry-run');
  }
}

export interface ActionCall {
  auth: AuthContext | undefined;
  requestId: string;
  idempotencyKey?: string;
  dryRun?: boolean;
  /** Gọi qua AI (MCP / Cell): kênh, vd mcp:claude — bằng chứng ghi actor_kind = ai, on_behalf_of = người dùng (STD-MCP-9, STD-EVD-6). */
  via?: string;
}

export interface ActionResult<T = unknown> {
  data: T;
  status: number;
  /** receipt: biên nhận bằng chứng (bizcity_evidence@1 §3) — có với action ghi chạy thật, kể cả khi gửi lặp. */
  meta: { requestId: string; dryRun?: true; idempotency?: 'replayed'; receipt?: EvidenceReceipt };
}

/** Chạy một action theo ACTION §4. Dùng chung cho HTTP và (sau này) MCP, CLI. */
export async function runAction<I extends z.AnyZodObject, O extends z.ZodTypeAny>(def: ActionDef<I, O>, rawInput: unknown, call: ActionCall): Promise<ActionResult<z.infer<O>>> {
  const auth = call.auth;
  if (def.permission !== 'public') {
    if (!auth) throw Errors.unauthorized();
    if (!auth.permissions.has(def.permission)) throw Errors.forbidden();
  }
  const input = def.input.parse(rawInput) as z.infer<I>; // ZodError → VALIDATION_ERROR (core/http.ts)
  const dryRun = call.dryRun === true;
  if (dryRun && !def.dryRun) throw Errors.validation(`Action ${def.id} không hỗ trợ chạy thử (dryRun)`);
  const key = def.effect === 'write' && !dryRun ? call.idempotencyKey : undefined;
  if (key !== undefined && (key.length < 8 || key.length > 128)) throw Errors.validation('Idempotency-Key dài 8–128 ký tự');
  if (def.effect === 'write' && def.idempotency === 'required' && !dryRun && !key) {
    throw Errors.validation(`Action ${def.id} cần header Idempotency-Key (một khoá cho một ý định thao tác; gửi lại dùng đúng khoá cũ)`);
  }
  const status = def.expose.http?.status ?? 200;
  const meta: ActionResult['meta'] = { requestId: call.requestId };
  const tenantId = auth?.tenantId ?? '';
  const inputHash = def.effect === 'write' ? requestHash(input) : '';
  const notes: Record<string, unknown> = {};
  // Bằng chứng (STD-EVD-1): action ghi chạy thật → đúng một bản ghi, thành công hay thất bại vì lỗi nghiệp vụ trong handler.
  const evidenceOn = def.effect === 'write' && !dryRun && !!auth;
  const objectType = def.evidence?.objectType ?? def.id.split('.')[1]!;
  const evidence = (objectId: unknown, result: EvidenceEntry['result'], after: unknown): EvidenceEntry => {
    const oid = objectId == null ? undefined : String(objectId);
    return {
      tenantId, actor: auth!.actor, actorKind: call.via ? 'ai' : auth!.kind, actorVia: call.via, onBehalfOf: call.via ? auth!.actor : undefined, action: def.id, moduleId: def.id.split('.')[0], objectType, objectId: oid,
      subject: oid ? `${objectType}:${oid}` : undefined, requestId: call.requestId, idempotencyKey: key, inputHash: `sha256:${inputHash}`, result, after,
    };
  };
  let inHandler = false;

  try {
    const res = await db.transaction().execute(async (trx) => {
      if (key) {
        // Khoá quá hạn giữ (7 ngày) thì coi như khoá mới.
        await trx.deleteFrom('action_requests').where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key)
          .where('created_at', '<', sql<Date>`now() - interval '7 days'`).execute();
        const inserted = await trx.insertInto('action_requests')
          .values({ tenant_id: tenantId, action_id: def.id, idem_key: key, request_hash: inputHash, actor: auth?.actor ?? 'public' })
          .onConflict((oc) => oc.columns(['tenant_id', 'action_id', 'idem_key']).doNothing())
          .returning('id').executeTakeFirst();
        if (!inserted) {
          const prev = await trx.selectFrom('action_requests').select(['request_hash', 'status_code', 'response'])
            .where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key).executeTakeFirstOrThrow();
          if (prev.request_hash !== inputHash) throw Errors.idempotencyConflict();
          // Gửi lặp không ghi bằng chứng mới: trả lại biên nhận của lần đầu.
          const ev = await trx.selectFrom('audit_logs').select(['id', 'hash', 'created_at'])
            .where('tenant_id', '=', tenantId).where('action', '=', def.id).where('idempotency_key', '=', key).where('result_ok', '=', true)
            .orderBy('id', 'desc').executeTakeFirst();
          const receipt = ev ? { evidenceId: ev.id, hash: ev.hash ?? '', at: new Date(ev.created_at).toISOString() } : undefined;
          return { data: prev.response as z.infer<O>, status: prev.status_code, meta: { ...meta, idempotency: 'replayed' as const, ...(receipt ? { receipt } : {}) } };
        }
      }
      const ctx: ActionContext = {
        actor: { id: auth?.actor ?? 'public', name: auth?.actorName ?? '', kind: auth?.kind ?? 'user' },
        tenant: { id: tenantId },
        requestId: call.requestId,
        dryRun,
        can: (p) => !!auth?.permissions.has(p),
        data: { tx: trx },
        evidence: { note: (k, v) => { notes[k] = v; } },
        get legacyAuth() {
          if (!auth) throw Errors.unauthorized();
          return auth;
        },
      };
      inHandler = true;
      const output = await def.handler(ctx, input);
      // STD-ACT-3: phản hồi đúng khuôn output — kiểm khi chạy test (CONF-RUN-3), không tốn ở bản chạy thật.
      if (env.NODE_ENV === 'test') {
        const checked = def.output.safeParse(output);
        if (!checked.success) throw new Error(`Action ${def.id} trả sai khuôn output: ${checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      if (dryRun) throw new DryRunRollback(output);
      const result = { data: output, status, meta };
      if (evidenceOn) {
        const objectId = def.evidence?.objectId?.(input, output) ?? (output as { id?: unknown } | null)?.id;
        result.meta = { ...meta, receipt: await writeEvidence(trx, evidence(objectId, { ok: true }, Object.keys(notes).length ? { input, notes } : { input })) };
      }
      if (key) {
        await trx.updateTable('action_requests').set({ response: JSON.stringify(output ?? null), status_code: status })
          .where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key).execute();
      }
      return result;
    });
    metrics.actions.inc({ action: def.id, result: 'ok', code: '' });
    return res;
  } catch (err) {
    if (err instanceof DryRunRollback) return { data: err.output as z.infer<O>, status: 200, meta: { ...meta, dryRun: true } };
    metrics.actions.inc({ action: def.id, result: 'error', code: err instanceof AppError ? err.code : err instanceof z.ZodError ? ERROR_CODES.VALIDATION : ERROR_CODES.INTERNAL });
    // Thất bại trong handler: giao dịch đã huỷ → ghi bằng chứng "result_ok = false" ở giao dịch riêng. Ghi lỗi thì vẫn ném lỗi gốc.
    if (inHandler && evidenceOn) {
      const code = err instanceof AppError ? err.code : err instanceof z.ZodError ? ERROR_CODES.VALIDATION : ERROR_CODES.INTERNAL;
      await db.transaction().execute((trx) => writeEvidence(trx, evidence((input as { id?: unknown }).id, { ok: false, code }, { input, message: (err as Error).message })))
        .catch(() => undefined);
    }
    throw err;
  }
}

const pathParams = (path: string) => [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);

/**
 * Gắn route HTTP cho các action có `expose.http`. Tham số đường dẫn + (GET/DELETE: query; còn lại: body) gộp thành input.
 * OpenAPI: params / querystring / body tách từ cùng schema input.
 */
/** Đưa action vào registry (MCP, CLI) — kể cả action không có route HTTP. */
export function registerActions(defs: AnyActionDef[]): void {
  for (const def of defs) {
    if (registry.has(def.id) && registry.get(def.id) !== def) throw new Error(`Trùng mã action: ${def.id}`);
    registry.set(def.id, def);
  }
}

export function mountActions(app: FastifyInstance, defs: AnyActionDef[]): void {
  registerActions(defs);
  for (const def of defs) {
    const http = def.expose.http;
    if (!http) continue;
    const names = pathParams(http.path);
    const mask = Object.fromEntries(names.map((n) => [n, true])) as Record<string, true>;
    const rest = def.input.omit(mask);
    const inQuery = http.method === 'GET' || http.method === 'DELETE';
    const dry = def.dryRun ? z.object({ dryRun: queryBool.describe('1 = chạy thử trong giao dịch rồi huỷ, không ghi gì') }) : null;
    const notes = [
      def.description,
      `Action \`${def.id}\` · quyền \`${def.permission}\` · ${def.effect === 'write' ? `ghi · idempotency ${def.idempotency}` : 'đọc'}`,
      def.effect === 'write' && def.idempotency === 'required' ? 'Header `Idempotency-Key` (8–128 ký tự) bắt buộc: gửi lại cùng khoá + cùng nội dung → trả đúng phản hồi lần đầu.' : '',
    ].filter(Boolean).join('\n\n');
    app.route({
      method: http.method,
      url: http.path,
      schema: {
        tags: def.tags,
        summary: def.title,
        description: notes,
        ...(names.length ? { params: def.input.pick(mask) } : {}),
        ...(inQuery ? { querystring: dry ? rest.merge(dry) : rest } : { ...(Object.keys(rest.shape).length ? { body: rest } : {}), ...(dry ? { querystring: dry } : {}) }),
      },
      config: def.permission === 'public' ? { public: true } : {},
      handler: async (req: FastifyRequest, reply) => {
        const params = (req.params ?? {}) as Record<string, unknown>;
        const query = { ...((req.query ?? {}) as Record<string, unknown>) };
        // Action không khai dryRun thì query không qua schema (chuỗi "1"): vẫn phải nhận ra để từ chối, không chạy thật.
        const flag = query.dryRun;
        const dryRun = flag === true || (typeof flag === 'string' && ['1', 'true', 'on', 'yes'].includes(flag.toLowerCase()));
        delete query.dryRun;
        const raw = inQuery ? { ...query, ...params } : { ...((req.body ?? {}) as Record<string, unknown>), ...params };
        const header = req.headers['idempotency-key'];
        const res = await runAction(def, raw, { auth: req.auth, requestId: String(req.id), idempotencyKey: Array.isArray(header) ? header[0] : header, dryRun });
        return reply.status(res.status).send(ok(res.data, res.meta));
      },
    });
  }
}
