// @bizcity-layer P module-sdk
// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a (B3a, PHASE-030 · 26 §6): core.library.attest (xác nhận căn cứ theo đơn vị — bằng chứng, settings:write, lý do bắt buộc) và core.library.attestations
// [2026-11-08 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-48 (B2, PHASE-030 · 26 §8–§9): validate nhận `source` và đếm lượt dùng (gom theo lượt, không hẹn giờ); core.library.usage cho bảng đánh giá; ghi hết khi máy chủ tắt
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, BIZCITY-LIBRARY-v1 §10): API thư viện dùng chung — danh sách, phong bì, dòng ô chọn theo ngày, kiểm ô nhập có gợi ý; mở cho MCP (ai: 'read')
/**
 *   GET  /api/v1/libraries                       core.library.list      — mọi thư viện: id, loại, phiên bản, số mục, tỉ lệ đã duyệt
 *   GET  /api/v1/libraries/:id                   core.library.get       — phong bì (không items) + README
 *   GET  /api/v1/libraries/:id/items             core.library.items     — dòng ô chọn: ?q=&at=&group=&status=&limit=
 *   POST /api/v1/libraries/:id/validate          core.library.validate  — { input | inputs[], at?, source? } → phát hiện LIB-* + gợi ý (không ghi gì vào sổ;
 *                                                đếm một lượt / giá trị vào library_usage_daily — chỉ mã, không giá trị nhập)
 *   GET  /api/v1/libraries/usage                 core.library.usage     — ?from=&to=&library=&source= → lượt qua / cảnh báo / chặn theo thư viện,
 *                                                theo nguồn, mã phát hiện nhiều nhất, mã lạ (bảng đánh giá HT14)
 *   POST /api/v1/libraries/:id/attest            core.library.attest    — { code, reason, revoke? } → đơn vị xác nhận / gỡ xác nhận một mục (bằng chứng)
 *   GET  /api/v1/libraries/:id/attestations      core.library.attestations — lần xác nhận mới nhất của từng mục; hết hiệu lực khi mục đổi
 * Nội dung không phụ thuộc đơn vị (tệp của bản dựng). Quyền catalog:read như thư viện mã phát hiện.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ATTEST_OBJECT, flushLibraryUsage, getLibrary, itemHash, libraryAttestations, libraryReadme, libraryUsage, listLibraries, recordLibraryUsage, selectorRows,
  shouldFlush, validateInLibrary,
} from '@bizcity/platform/core/libraries/index';
import { db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { defineAction, mountActions } from '../../core/actions.js';

const tags = ['Thư viện dùng chung'];
const id = z.string().trim().regex(/^[a-z0-9-]+\.[a-z0-9][a-z0-9-]{1,48}$/, 'id thư viện dạng <miền>.<tên>');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ngày YYYY-MM-DD');
const need = (libId: string) => {
  const lib = getLibrary(libId);
  if (!lib) throw Errors.notFound(`thư viện ${libId} (xem GET /api/v1/libraries)`);
  return lib;
};

const suggestion = z.object({ value: z.unknown(), label: z.string(), why: z.string(), confidence: z.enum(['cao', 'vua', 'thap']) });
const finding = z.object({
  code: z.string(), level: z.enum(['block', 'warn', 'info']), path: z.string(), message: z.string(),
  got: z.unknown().optional(), expected: z.unknown().optional(), suggestions: z.array(suggestion),
});
const result = z.object({
  ok: z.boolean(), library: z.object({ id: z.string(), version: z.string(), hash: z.string() }), at: z.string(),
  resolved: z.string().optional(), value: z.unknown().optional(), findings: z.array(finding),
});
const input = z.union([z.string().trim().min(1).max(120), z.record(z.unknown())]);

const list = defineAction({
  id: 'core.library.list', title: 'Danh sách thư viện dùng chung', tags,
  description: 'Mọi thư viện tham chiếu (bizcity_library@1): tham số pháp lý, ngày nghỉ, phân quyền mẫu… — id, loại, phiên bản, ngày phát hành, số mục, số mục đã duyệt.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({ items: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string(), version: z.string(), released: z.string(), contentHash: z.string(), owner: z.string(), count: z.number(), verified: z.number() })) }),
  expose: { http: { method: 'GET', path: '/api/v1/libraries' }, mcp: true, ai: 'read' },
  handler: async () => ({
    items: listLibraries().map((l) => {
      const lib = need(l.id);
      return { id: l.id, kind: l.kind, title: l.title, version: l.version, released: l.released, contentHash: l.contentHash, owner: l.owner, count: lib.items.length, verified: lib.items.filter((i) => i.verified).length };
    }),
  }),
});

const get = defineAction({
  id: 'core.library.get', title: 'Phong bì một thư viện', tags,
  description: 'Phong bì của thư viện (nguồn, phiên bản, changelog, khuôn dữ liệu, ô chọn, luật) và README hướng dẫn; không kèm danh sách mục (dùng core.library.items).',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ id }),
  output: z.object({ library: z.record(z.unknown()), readme: z.string().nullable() }),
  expose: { http: { method: 'GET', path: '/api/v1/libraries/:id' }, mcp: true, ai: 'read' },
  handler: async (_ctx, i) => {
    const { items: _items, ...envelope } = need(i.id);
    return { library: envelope, readme: libraryReadme(i.id) };
  },
});

const items = defineAction({
  id: 'core.library.items', title: 'Dòng ô chọn của thư viện', tags,
  description: 'Mục thư viện theo khuôn ô chọn (value, label, group, hint, deprecated, valueAt): tìm không dấu theo mã / tên / bí danh, lọc theo nhóm, '
    + 'tham số chỉ hiện mục có hiệu lực tại ngày `at` (mặc định hôm nay). Mặc định chỉ mục còn dùng.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({
    id, q: z.string().trim().max(120).optional(), at: date.optional(), group: z.string().trim().max(60).optional(),
    status: z.enum(['active', 'deprecated', 'removed', 'all']).optional(), limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
  output: z.object({
    library: z.object({ id: z.string(), version: z.string(), hash: z.string() }), at: z.string(), total: z.number(),
    rows: z.array(z.object({ value: z.unknown(), label: z.string(), group: z.string().optional(), hint: z.string().optional(), deprecated: z.boolean(), verified: z.boolean(), valueAt: z.unknown().optional(), item: z.record(z.unknown()) })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/libraries/:id/items' }, mcp: true, ai: 'read' },
  handler: async (_ctx, i) => {
    const lib = need(i.id);
    const at = i.at ?? new Date().toISOString().slice(0, 10);
    const { rows, total } = selectorRows(lib, { q: i.q, at, group: i.group, status: i.status, limit: i.limit });
    return { library: { id: lib.id, version: lib.version, hash: lib.contentHash }, at, total, rows: rows as never };
  },
});

const validate = defineAction({
  id: 'core.library.validate', title: 'Kiểm ô nhập theo thư viện', tags,
  description: 'Chỉ đọc: kiểm một (input) hoặc nhiều (inputs) giá trị theo thư viện tại ngày `at` — mã có không, còn dùng không, có hiệu lực không, '
    + 'đúng khuôn không, giá trị có khớp thư viện không, luật riêng của thư viện. Mỗi phát hiện có mã LIB-* (hoặc mã luật) và gợi ý; Core không tự sửa.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({
    id, input: input.optional(), inputs: z.array(input).max(200).optional(), at: date.optional(),
    source: z.string().trim().max(80).optional().describe('module / action / kênh gọi (vd modules/luong) — để bảng đánh giá biết ai dùng; không gửi = api'),
  }),
  output: z.object({ results: z.array(result) }),
  expose: { http: { method: 'POST', path: '/api/v1/libraries/:id/validate' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => {
    need(i.id);
    if ((i.input === undefined) === (i.inputs === undefined)) throw Errors.validation('gửi đúng một trong input hoặc inputs');
    const list: (string | Record<string, unknown>)[] = i.inputs ?? (i.input === undefined ? [] : [i.input]);
    const results = list.map((x) => {
      const r = validateInLibrary(i.id, x, { at: i.at })!;
      recordLibraryUsage(ctx.tenant.id, r, x, i.source);
      return r;
    });
    // Gom theo lượt (26 §8): ghi khi đủ 30 giây / 200 dòng; số đếm là quan sát — lỗi ghi không làm hỏng lượt kiểm.
    if (shouldFlush()) await flushUsage();
    return { results };
  },
});

let flushLog: (msg: string) => void = () => undefined;
async function flushUsage(): Promise<void> {
  const r = await flushLibraryUsage(db);
  if (r.error) flushLog(`library_usage_daily: bỏ một lô số đếm — ${r.error}`);
}

const usage = defineAction({
  id: 'core.library.usage', title: 'Lượt dùng thư viện', tags,
  description: 'Bảng đánh giá thư viện (HT14): trong khoảng ngày, số lượt qua / cảnh báo / chặn theo thư viện và theo nguồn (module, kênh), '
    + 'mã phát hiện nhiều nhất, số lượt mã lạ (ứng viên bổ sung thư viện). Chỉ đếm, không có giá trị người nhập.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ from: date.optional(), to: date.optional(), library: id.optional(), source: z.string().trim().max(80).optional() }),
  output: z.object({
    from: z.string(), to: z.string(),
    total: z.object({ pass: z.number(), warn: z.number(), block: z.number() }),
    byLibrary: z.array(z.object({ libraryId: z.string(), pass: z.number(), warn: z.number(), block: z.number() })),
    bySource: z.array(z.object({ source: z.string(), libraryId: z.string(), pass: z.number(), warn: z.number(), block: z.number(), deprecated: z.number() })),
    topFindings: z.array(z.object({ code: z.string(), libraryId: z.string(), outcome: z.enum(['pass', 'warn', 'block']), count: z.number() })),
    unknown: z.array(z.object({ libraryId: z.string(), source: z.string(), count: z.number() })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/libraries/usage' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => {
    await flushUsage(); // số liệu gồm cả lượt còn trong bộ nhớ
    const to = i.to ?? new Date().toISOString().slice(0, 10);
    const from = i.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    if (from > to) throw Errors.validation('from phải trước hoặc bằng to');
    return libraryUsage(ctx.data.tx, ctx.tenant.id, { from, to, library: i.library, source: i.source });
  },
});

const attest = defineAction({
  id: 'core.library.attest', title: 'Xác nhận mục thư viện cho đơn vị', tags,
  description: 'Kế toán trưởng / chủ đơn vị xác nhận đã đối chiếu một mục thư viện (vd một văn bản căn cứ, một tham số pháp lý) cho đơn vị mình, '
    + 'hoặc gỡ xác nhận (revoke). Không đổi thư viện gốc, không đổi trạng thái duyệt của Nhóm Lõi. Lưu thành bằng chứng; '
    + 'xác nhận hết hiệu lực khi bản thư viện mới đổi nội dung mục đó.',
  permission: 'settings:write', effect: 'write', idempotency: 'required', sideEffects: ['settings'],
  input: z.object({
    id, code: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(5, 'ghi lý do / nơi đã đối chiếu (ít nhất 5 ký tự)').max(500),
    revoke: z.boolean().optional(),
  }),
  output: z.object({ libraryId: z.string(), code: z.string(), version: z.string(), itemHash: z.string(), attested: z.boolean() }),
  expose: { http: { method: 'POST', path: '/api/v1/libraries/:id/attest' }, ai: 'deny' },
  evidence: { objectType: ATTEST_OBJECT, objectId: (i) => `${i.id}:${i.code}` },
  handler: async (ctx, i) => {
    const lib = need(i.id);
    const h = itemHash(lib, i.code);
    if (!h) throw Errors.notFound(`mục ${i.code} trong thư viện ${i.id} (dùng mã chuẩn, không dùng bí danh)`);
    const note = { libraryId: lib.id, code: i.code, version: lib.version, itemHash: h, attested: !i.revoke };
    ctx.evidence.note('attest', note); // libraryAttestations đọc từ after_data.notes.attest
    return note;
  },
});

const attestations = defineAction({
  id: 'core.library.attestations', title: 'Xác nhận mục thư viện của đơn vị', tags,
  description: 'Lần xác nhận (hoặc gỡ) mới nhất của từng mục trong thư viện cho đơn vị đang đăng nhập: ai, lúc nào, lý do, còn hiệu lực không '
    + '(hết hiệu lực khi bản thư viện mới đổi nội dung mục).',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ id }),
  output: z.object({
    library: z.object({ id: z.string(), version: z.string() }),
    items: z.array(z.object({ code: z.string(), attested: z.boolean(), valid: z.boolean(), version: z.string(), itemHash: z.string(), by: z.string(), at: z.string(), reason: z.string(), evidenceId: z.string() })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/libraries/:id/attestations' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => {
    const lib = need(i.id);
    return { library: { id: lib.id, version: lib.version }, items: await libraryAttestations(ctx.data.tx, ctx.tenant.id, lib) };
  },
});

export const LIBRARY_ACTIONS = [list, get, items, validate, usage, attest, attestations];

export async function librariesRoutes(app: FastifyInstance): Promise<void> {
  flushLog = (msg) => app.log.warn(msg);
  mountActions(app, LIBRARY_ACTIONS);
  // Máy chủ tắt: ghi nốt số đếm còn trong bộ nhớ.
  app.addHook('onClose', async () => { await flushUsage(); });
}
