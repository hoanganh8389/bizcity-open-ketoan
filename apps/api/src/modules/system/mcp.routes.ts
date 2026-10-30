// @bizcity-layer P mcp
/**
 * MCP của Core kế toán (bizcity_mcp@1 — hồ sơ của bizcity-mcp-tool@1.0.0; PHASES 2.11, 2.12).
 *   POST /mcp   JSON-RPC 2.0, một đối tượng, không giữ phiên: initialize, ping, tools/list, tools/call
 *
 * Công cụ SINH TỪ REGISTRY ACTION (core/actions.ts), không viết tay: action có `expose.mcp` và `expose.ai` ∈ read | propose.
 *   - tên = id action, `-` → `_` (STD-MCP-1); annotations / confirm suy từ expose.ai (STD-MCP-3);
 *   - chỉ liệt kê công cụ người gọi có quyền (STD-MCP-7: quyền thật = quyền người dùng / khoá ∩ expose.ai);
 *   - đọc: chạy ngay, phong bì { success, complete, message, data + as_of, meta } (tool §3); danh sách có trần (STD-MCP-8);
 *   - ghi (propose): XÁC NHẬN TRƯỚC (STD-MCP-4). Không kèm confirm_token → chạy thử (dry-run) để xem trước, cấp token (bảng
 *     mcp_confirm_tokens, một lần, 900 giây, gắn công cụ + người gọi + băm tham số). Có token → ghi thật qua runtime action với
 *     Idempotency-Key = mcp:<token> (STD-MCP-5), bằng chứng actor_kind = ai, via = mcp:<client> (STD-MCP-9), trả meta.receipt.
 * Core không gọi LLM ở đây: hiểu câu nói, chọn công cụ là việc của Cell / client.
 * Chưa có: đường Cell → Hub → /api/v1/cell/mcp (X-BizCity-Principal, cần kết nối bốn bước — CELL-CONNECT), resources, prompts,
 * khoá mcp_… riêng (dùng phiên đăng nhập / khoá API hiện có, quyền theo phạm vi khoá).
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { zodToJson, type Json } from '../../core/json-schema.js';
import { db } from '../../db/client.js';
import { requireAuthenticated, type AuthContext } from '../../core/auth.js';
import { AppError } from '../../core/errors.js';
import { listActions, requestHash, runAction, type AnyActionDef } from '../../core/actions.js';
import { BUILD_VERSION } from '../../core/version.js';
import { metrics } from '../../core/metrics.js';
import { ERROR_CATALOG, MCP_ERROR_CATALOG } from '@ketoan/contracts';

const CONFIRM_TTL_MS = 900_000;
const LIST_LIMIT = 50;
const LIST_MAX = 500;
const PROTOCOL = '2025-06-18';

// ── Công cụ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const toolName = (a: AnyActionDef) => a.id.replace(/-/g, '_');
const llmAlias = (a: AnyActionDef) => `kt_${a.id.split('.').slice(1).join('_').replace(/[^a-z0-9_]/g, '_')}`.slice(0, 64);
const isTool = (a: AnyActionDef) => !!a.expose.mcp && (a.expose.ai === 'read' || a.expose.ai === 'propose');
const canCall = (a: AnyActionDef, auth: AuthContext) => a.permission === 'public' || auth.permissions.has(a.permission);
const visibleTools = (auth: AuthContext) => listActions().filter((a) => isTool(a) && canCall(a, auth));

function descriptor(a: AnyActionDef) {
  const read = a.effect === 'read';
  const out = zodToJson(a.output);
  const dataSchema = out.type === 'object'
    ? { ...out, properties: { ...(out.properties as Json), as_of: { type: 'string', format: 'date-time', description: 'Thời điểm số liệu (UTC)' } } }
    : { type: 'object', properties: { items: out, as_of: { type: 'string', format: 'date-time' } } };
  return {
    name: toolName(a),
    title: a.title,
    description: [a.title, a.description, read ? '' : 'Ghi: lần gọi đầu chỉ trả bản xem trước + confirm_token; người dùng đồng ý thì gọi lại cùng tham số kèm confirm_token.', `Quyền: ${a.permission}.`]
      .filter(Boolean).join(' '),
    inputSchema: zodToJson(a.input),
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, complete: { type: 'boolean' }, message: { type: 'string' }, data: dataSchema, meta: { type: 'object' } } },
    annotations: read
      ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : { readOnlyHint: false, destructiveHint: !!a.expose.destructive, idempotentHint: true, openWorldHint: false },
    _meta: {
      bizcity: {
        contract: 'bizcity-mcp-tool@1.0.0', profile: 'bizcity_mcp@1', action: a.id,
        mode: read ? 'accounting' : 'accounting_entry', confirm: read ? 'never' : 'always', llm_alias: llmAlias(a), since: '1.0',
      },
    },
  };
}

// ── Phong bì kết quả (tool §3) ────────────────────────────────────────────────────────────────────────────────────────────
function toolOk(title: string, data: unknown, meta: Json, opts: { complete?: boolean; message?: string; limit?: number } = {}) {
  const asOf = new Date().toISOString();
  const limit = Math.min(Math.max(opts.limit ?? LIST_LIMIT, 1), LIST_MAX);
  let body: Json;
  if (Array.isArray(data)) {
    body = { items: data.slice(0, limit), as_of: asOf };
    meta = { ...meta, total: data.length, truncated: data.length > limit };
  } else body = { ...((data ?? {}) as Json), as_of: asOf };
  const message = opts.message ?? `${title}: xong`;
  const env = { success: true, complete: opts.complete ?? true, message, data: body, meta };
  return { content: [{ type: 'text', text: `${message}\n${JSON.stringify(body).slice(0, 20_000)}` }], structuredContent: env };
}

// Gợi ý / thử lại lấy từ danh mục mã lỗi (bizcity_errors@1) — một nguồn với API và tài liệu.
const SPEC: Record<string, { hint: string; retryable: boolean }> = { ...ERROR_CATALOG, ...MCP_ERROR_CATALOG };

function toolError(code: string, message: string, details?: unknown) {
  const hint = SPEC[code]?.hint ?? '';
  return {
    isError: true,
    content: [{ type: 'text', text: hint ? `${message} ${hint}` : message }],
    structuredContent: { success: false, code, message, hint, help_code: code, error: { code, retryable: SPEC[code]?.retryable ?? false, details: details ?? null } },
  };
}

function errorOf(err: unknown) {
  if (err instanceof AppError) return toolError(err.code, err.message, err.details);
  if (err instanceof ZodError) return toolError('VALIDATION_ERROR', 'Tham số không hợp lệ', err.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  return toolError('INTERNAL_ERROR', 'Lỗi hệ thống');
}

// ── tools/call ────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface CallParams { name?: unknown; arguments?: unknown; _meta?: Record<string, unknown> }

async function callTool(req: FastifyRequest, auth: AuthContext, params: CallParams) {
  const name = String(params.name ?? '');
  const def = visibleTools(auth).find((a) => toolName(a) === name);
  if (!def) return toolError('NOT_FOUND', `Không có công cụ ${name}, hoặc tài khoản đang dùng không có quyền gọi`);
  const meta = params._meta ?? {};
  const args = { ...((params.arguments ?? {}) as Record<string, unknown>) };
  const confirmToken = (meta.confirm_token ?? args.confirm_token) as string | undefined;
  delete args.confirm_token;
  const via = `mcp:${String(meta.client ?? 'client').replace(/[^\w.-]/g, '').slice(0, 40) || 'client'}`;
  const base = { auth, requestId: String(req.id), via };
  try {
    if (def.effect === 'read') {
      const r = await runAction(def, args, base);
      return toolOk(def.title, r.data, { requestId: r.meta.requestId }, { limit: Number(meta.limit) || undefined });
    }
    const argsHash = requestHash(args);
    if (!confirmToken) {
      // Xem trước = chạy thật trong giao dịch rồi huỷ (bút toán, số chứng từ… đúng như khi ghi); action không hỗ trợ thì xem trước tham số.
      const preview = def.dryRun ? (await runAction(def, args, { ...base, dryRun: true })).data : def.input.parse(args);
      const jti = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);
      await db.insertInto('mcp_confirm_tokens').values({ jti, tenant_id: auth.tenantId, tool: name, actor: auth.actor, args_hash: argsHash, expires_at: expiresAt }).execute();
      return toolOk(def.title, { status: 'needs_confirmation', preview, confirm_token: jti, expires_at: expiresAt.toISOString() }, { requestId: String(req.id) },
        { complete: false, message: `Cần người dùng xác nhận trước khi ${def.title.toLowerCase()}` });
    }
    const tok = await db.selectFrom('mcp_confirm_tokens').selectAll().where('jti', '=', confirmToken).where('tenant_id', '=', auth.tenantId).executeTakeFirst();
    if (!tok || tok.tool !== name || tok.actor !== auth.actor || new Date(tok.expires_at).getTime() < Date.now()) {
      return toolError('MCP_CONFIRM_INVALID', 'Token xác nhận sai, hết hạn hoặc không thuộc công cụ / người gọi này');
    }
    if (tok.args_hash !== argsHash) return toolError('MCP_CONFIRM_ARGS_CHANGED', 'Tham số khác bản đã xem trước');
    const clientKey = meta.idempotency_key == null ? null : String(meta.idempotency_key);
    // Token một lần: gọi lại chỉ được khi kèm đúng idempotency_key của lần dùng đầu (STD-MCP-5) → trả kết quả cũ.
    if (tok.used_at && (clientKey === null || tok.idempotency_key !== clientKey)) return toolError('MCP_CONFIRM_INVALID', 'Token xác nhận đã dùng');
    const r = await runAction(def, args, { ...base, idempotencyKey: `mcp:${confirmToken}` });
    await db.updateTable('mcp_confirm_tokens').set({ used_at: new Date(), idempotency_key: clientKey })
      .where('jti', '=', confirmToken).where('used_at', 'is', null).execute();
    // data.status nói về luồng xác nhận (needs_confirmation → done); kết quả của action nằm riêng ở data.result.
    return toolOk(def.title, { status: 'done', result: r.data }, { requestId: r.meta.requestId, receipt: r.meta.receipt, replayed: r.meta.idempotency === 'replayed' });
  } catch (err) {
    if (!(err instanceof AppError) && !(err instanceof ZodError)) req.log.error({ err, tool: name }, 'mcp tools/call lỗi');
    return errorOf(err);
  }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  app.post('/mcp', {
    preHandler: requireAuthenticated(),
    schema: {
      tags: ['MCP'],
      summary: 'MCP (JSON-RPC 2.0): initialize, tools/list, tools/call — công cụ sinh từ action (bizcity_mcp@1)',
      description: 'Một đối tượng JSON-RPC mỗi yêu cầu, không giữ phiên. Xác thực như API (Bearer phiên hoặc X-Api-Key). Ghi luôn qua xác nhận: confirm_token trong params._meta hoặc arguments.',
    },
    handler: async (req, reply) => {
      const auth = req.auth!;
      const msg = req.body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown } | undefined;
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return rpcError(null, -32600, 'Yêu cầu JSON-RPC không hợp lệ (một đối tượng, jsonrpc = "2.0", có method; không nhận batch)');
      }
      const params = (msg.params ?? {}) as Record<string, unknown>;
      if (msg.id === undefined) return reply.code(202).send(); // thông báo (notifications/initialized…): không trả lời
      const done = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
      switch (msg.method) {
        case 'initialize':
          return done({
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'bizcity-core-ketoan', title: 'Bizcity Core kế toán', version: BUILD_VERSION.version },
            instructions: 'Công cụ kế toán của một đơn vị: đọc sổ, báo cáo, công nợ; lập chứng từ nháp. Mọi thao tác ghi phải xem trước rồi người dùng xác nhận (confirm_token). Số tiền là đồng (number). data.as_of là thời điểm số liệu.',
          });
        case 'ping':
          return done({});
        case 'tools/list':
          return done({ tools: visibleTools(auth).map(descriptor) });
        case 'tools/call': {
          const r = await callTool(req, auth, params as CallParams);
          // Nhãn tool chỉ nhận tên công cụ có thật (R-OBS-4: client gửi tên lạ không làm nổ số chuỗi số đo).
          const known = listActions().some((a) => isTool(a) && toolName(a) === params.name);
          const result = 'isError' in r ? 'error' : r.structuredContent.complete === false ? 'needs_confirmation' : 'ok';
          metrics.mcpCalls.inc({ tool: known ? String(params.name) : 'unknown', result });
          return done(r);
        }
        default:
          return rpcError(msg.id, -32601, `Không hỗ trợ phương thức ${msg.method}`);
      }
    },
  });
}
