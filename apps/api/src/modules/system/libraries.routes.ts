// @bizcity-layer P module-sdk
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, BIZCITY-LIBRARY-v1 §10): API thư viện dùng chung — danh sách, phong bì, dòng ô chọn theo ngày, kiểm ô nhập có gợi ý; mở cho MCP (ai: 'read')
/**
 *   GET  /api/v1/libraries                       core.library.list      — mọi thư viện: id, loại, phiên bản, số mục, tỉ lệ đã duyệt
 *   GET  /api/v1/libraries/:id                   core.library.get       — phong bì (không items) + README
 *   GET  /api/v1/libraries/:id/items             core.library.items     — dòng ô chọn: ?q=&at=&group=&status=&limit=
 *   POST /api/v1/libraries/:id/validate          core.library.validate  — { input | inputs[], at? } → phát hiện LIB-* + gợi ý (không ghi gì)
 * Nội dung không phụ thuộc đơn vị (tệp của bản dựng). Quyền catalog:read như thư viện mã phát hiện.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getLibrary, libraryReadme, listLibraries, selectorRows, validateInLibrary } from '@bizcity/platform/core/libraries/index';
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
  input: z.object({ id, input: input.optional(), inputs: z.array(input).max(200).optional(), at: date.optional() }),
  output: z.object({ results: z.array(result) }),
  expose: { http: { method: 'POST', path: '/api/v1/libraries/:id/validate' }, mcp: true, ai: 'read' },
  handler: async (_ctx, i) => {
    need(i.id);
    if ((i.input === undefined) === (i.inputs === undefined)) throw Errors.validation('gửi đúng một trong input hoặc inputs');
    const list: (string | Record<string, unknown>)[] = i.inputs ?? (i.input === undefined ? [] : [i.input]);
    return { results: list.map((x) => validateInLibrary(i.id, x, { at: i.at })!) };
  },
});

export const LIBRARY_ACTIONS = [list, get, items, validate];

export async function librariesRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, LIBRARY_ACTIONS);
}
