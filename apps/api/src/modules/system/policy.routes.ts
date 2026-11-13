// @bizcity-layer P module-sdk
// [2026-11-09 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b (S031-29): nạp recompute.ts để đăng ký hàm tính lại cho cửa nạp (IN-POL-004)
// [2026-11-09 09:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4a (S031-28, chữ chốt PHASE-031 · 00 §12): thêm bốn action đọc cho màn Chính sách và Theo dõi thực hiện
// [2026-11-08 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9.3): API chính sách cho nguồn ngoài — đọc, tính, phát hành inline
/**
 * CHÍNH SÁCH NGHIỆP VỤ cho nguồn ngoài (bizcity_policy@1, ADR-0031):
 *   GET  /api/v1/policies               core.policy.list        bản đang hiệu lực tại ?at (mặc định hôm nay), lọc ?domain ?branch ?channel; có etag
 *   GET  /api/v1/rule-contracts         core.rule-contract.list khuôn luật có sẵn
 *   GET  /api/v1/rule-contracts/:id     core.rule-contract.get  tham số, spec (để plugin viết lại), vectors (để plugin tự kiểm)
 *   POST /api/v1/policies/evaluate      core.policy.evaluate    tính theo chính sách; trả policyRefs để gắn vào chứng từ nạp
 *   POST /api/v1/policies               core.policy.publish     phát hành một bản chính sách inline (settings:write)
 *   GET  /api/v1/policy-registry                       core.policy.registry      mọi chính sách + bản + số chứng từ đã áp + khoảng trống (W4a)
 *   GET  /api/v1/policy-registry/:policyId/applications core.policy.applications chứng từ đã áp một chính sách, phân trang (W4a)
 *   GET  /api/v1/policy-tracking                       core.policy.tracking      các ô theo dõi thực hiện (W4a)
 *   GET  /api/v1/policy-lineage                        core.policy.lineage       chuỗi ngược sự việc → chính sách@bản (W4a)
 * Quyền đọc / tính là catalog:read: khoá API phạm vi documents:write, reports:read, catalog:write đều có (core/auth.ts SCOPE_PERMISSIONS)
 * nên POS hiện tại dùng được ngay, không thêm scope. Không mở cho MCP / AI ở đợt này.
 */
import { z } from 'zod';
import { defineAction } from '@bizcity/platform/core/actions';
import { Errors } from '@bizcity/platform/core/errors';
import { RULE_CONTRACTS, getRuleContract } from './rule-contracts/index.js';
import './rule-contracts/recompute.js'; // đăng ký hàm tính lại cho Kernel (side-effect có chủ đích, như registerSubscribers)
import { evaluatePolicies, listPolicies, publishPolicy } from './rule-contracts/policy-service.js';
import { policyApplications, policyLineage, policyRegistry, policyTracking } from './policy-insight.js';

const tags = ['Chính sách'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const code = z.string().trim().min(1).max(64);
const anyOut = z.record(z.string(), z.unknown());

const list = defineAction({
  id: 'core.policy.list', title: 'Chính sách nghiệp vụ đang hiệu lực (cho POS, plugin)', tags,
  description: 'Các bản chính sách đã phát hành phủ ngày at (mặc định hôm nay): mã, bản, Rule Contract, phạm vi, hiệu lực, băm nội dung, tham số. '
    + 'Nguồn ngoài lưu bản đã tải, gửi mã + bản + băm kèm chứng từ (policyRefs). etag đổi khi và chỉ khi có chính sách mới hoặc đổi bản — hỏi lại bằng cách so etag.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ at: date.optional(), domain: z.string().trim().max(16).optional(), branch: z.string().trim().max(32).optional(), channel: z.string().trim().max(32).optional() }),
  output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/policies' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => listPolicies(ctx.data.tx, ctx.tenant.id, input),
});

const contractList = defineAction({
  id: 'core.rule-contract.list', title: 'Danh sách Rule Contract (khuôn luật của chính sách)', tags,
  description: 'Mã, miền, tên của từng khuôn luật. Chi tiết (tham số, spec, vectors) ở GET /api/v1/rule-contracts/:id.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none', input: z.object({}), output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/rule-contracts' }, mcp: false, ai: 'deny' },
  handler: async () => ({ items: RULE_CONTRACTS.map((c) => ({ id: c.id, domain: c.domain, title: c.title })) }),
});

const contractGet = defineAction({
  id: 'core.rule-contract.get', title: 'Một Rule Contract: tham số, spec, bộ ca chuẩn', tags,
  description: 'spec là thuật toán viết bằng dữ liệu để plugin (PHP, JS) viết lại; vectors là các ca đầu vào → đầu ra chuẩn để plugin tự kiểm. '
    + 'Plugin ngoại tuyến tính theo spec, trực tuyến có thể gọi POST /api/v1/policies/evaluate; cả hai phải ra đúng vectors.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none', input: z.object({ id: z.string().trim().min(1).max(100) }), output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/rule-contracts/:id' }, mcp: false, ai: 'deny' },
  handler: async (_ctx, input) => {
    const c = getRuleContract(input.id);
    if (!c) throw Errors.notFound(`Rule Contract ${input.id}`);
    return { id: c.id, domain: c.domain, title: c.title, ...c.describe() };
  },
});

const evalLine = z.object({
  lineKey: code, sku: code, qty: z.number().finite(),
  itemId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'itemId không đúng khuôn').optional(),
  // [2026-11-12 09:25 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 3: đơn giá trọn trên một đơn vị nhỏ nhất, cho chương trình giảm giá (đóng góp)
  price: z.number().finite().min(0).optional(),
});
const evaluate = defineAction({
  id: 'core.policy.evaluate', title: 'Tính theo chính sách đã phát hành', tags,
  description: 'Áp các chính sách bán hàng phủ ngày docDate lên các dòng hàng (độc lập, cộng dồn). Trả applied (kèm giải thích), skipped (kèm lý do, không im lặng), '
    + 'gifts (dòng quà gợi ý), discounts (tiền giảm theo dòng — chương trình giảm giá BH12, cần lines[].price) và policyRefs — đúng mảng gắn vào chứng từ nạp để cửa nạp kiểm lại. Không ghi gì.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({
    docDate: date, branchCode: z.string().trim().max(32).optional(), channel: z.string().trim().max(32).optional(),
    lines: z.array(evalLine).min(1).max(2000),
    policies: z.array(z.object({ key: code, version: z.number().int().min(1).optional() })).max(50).optional(),
    // [2026-11-13 10:20 AM Võ Hoàng] POS-KM2 — PHASE-031 · 00 §18 mục 3: ngữ cảnh cho điều kiện khuyến mại (đóng góp)
    at: z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM').optional(), weekday: z.number().int().min(1).max(7).optional() }).optional(),
    customer: z.object({ birthday: z.string().trim().max(10).optional(), memberLevel: z.string().trim().max(32).optional() }).optional(),
    coupons: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  }),
  output: anyOut,
  expose: { http: { method: 'POST', path: '/api/v1/policies/evaluate' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => evaluatePolicies(ctx.data.tx, ctx.tenant.id, input),
});

const publish = defineAction({
  id: 'core.policy.publish', title: 'Phát hành một bản chính sách (inline)', tags,
  description: 'Phát hành bản chính sách mới từ Rule Contract: kiểm nội dung, ghi bản kế tiếp, đóng bản trước ở ngày áp − 1. Bản đã phát hành không sửa; đổi = bản mới. '
    + 'effectiveFrom bắt buộc; lùi về trước hôm nay cần lý do. Chưa kiểm trần pháp lý của hàng khuyến mại (NĐ81).',
  permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'required',
  input: z.object({
    key: code, ruleContract: z.string().trim().min(1).max(100), params: z.unknown(),
    scope: z.object({ branchCodes: z.array(z.string().trim().min(1).max(32)).max(500).optional(), channels: z.array(z.string().trim().min(1).max(32)).max(50).optional() }).optional(),
    effectiveFrom: date, reason: z.string().trim().max(500).optional(), legalRef: z.string().trim().max(300).optional(),
  }),
  output: anyOut,
  expose: { http: { method: 'POST', path: '/api/v1/policies', status: 201 }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'policy', objectId: (input) => input.key },
  handler: async (ctx, input) => publishPolicy(ctx.data.tx, { tenantId: ctx.tenant.id, actor: ctx.legacyAuth.actor }, input),
});

const registry = defineAction({
  id: 'core.policy.registry', title: 'Sổ đăng ký chính sách: mọi bản, số chứng từ đã áp, khoảng trống', tags,
  description: 'Mọi chính sách của đơn vị (kể cả đã ngừng), mỗi bản kèm hiệu lực, phạm vi, băm, người phát hành và số chứng từ đã áp bản đó; bản đang hiệu lực hôm nay; khoảng trống giữa các bản; ngày hết hạn.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ owner: z.string().trim().max(64).optional(), status: z.enum(['published', 'retired']).optional(), q: z.string().trim().max(64).optional() }),
  output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/policy-registry' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => policyRegistry(ctx.data.tx, ctx.tenant.id, input),
});

const applications = defineAction({
  id: 'core.policy.applications', title: 'Chứng từ đã áp một chính sách', tags,
  description: 'Các chứng từ gửi tham chiếu tới chính sách (tuỳ chọn một bản), mới nhất trước, kèm mã IN-POL-* của lần kiểm lúc nhận. Phân trang: truyền next của trang trước vào cursor.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ policyId: z.string().trim().min(1).max(200), version: z.coerce.number().int().min(1).optional(), cursor: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
  output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/policy-registry/:policyId/applications' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => policyApplications(ctx.data.tx, ctx.tenant.id, input.policyId, { version: input.version, cursor: input.cursor, limit: input.limit }),
});

const tracking = defineAction({
  id: 'core.policy.tracking', title: 'Theo dõi thực hiện chính sách', tags,
  description: 'Các ô theo dõi trong kỳ (mặc định 30 ngày theo ngày chứng từ): tỉ lệ đạt, lệch theo mã IN-POL-*, độ phủ theo nguồn (miền bán), độ trễ phiên bản, dòng thời gian bản, sức khoẻ sổ đăng ký (sắp hết hạn, không còn bản phát hành, khoảng trống). '
    + 'Tỉ lệ là null khi mẫu số 0. Chưa có ô Thực hiện chương trình (cần IN-POL-004).',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ from: date.optional(), to: date.optional(), branch: z.string().trim().max(32).optional(), source: z.string().trim().max(64).optional(), owner: z.string().trim().max(64).optional() }),
  output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/policy-tracking' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => policyTracking(ctx.data.tx, ctx.tenant.id, input),
});

const lineage = defineAction({
  id: 'core.policy.lineage', title: 'Truy vết ngược: sự việc → chính sách áp @ bản', tags,
  description: 'Với một sự việc kế toán (eventId hoặc docKey): từng tham chiếu chính sách, bản trong sổ đăng ký, băm khớp hay lệch, ngày chứng từ có nằm trong hiệu lực của bản đó không, và kết quả kiểm lúc nhận.',
  permission: 'catalog:read', effect: 'read', idempotency: 'none',
  input: z.object({ eventId: z.coerce.number().int().min(1).optional(), docKey: z.string().trim().min(1).max(200).optional() }),
  output: anyOut,
  expose: { http: { method: 'GET', path: '/api/v1/policy-lineage' }, mcp: false, ai: 'deny' },
  handler: async (ctx, input) => policyLineage(ctx.data.tx, ctx.tenant.id, input),
});

export const policyActions = [list, contractList, contractGet, evaluate, publish, registry, applications, tracking, lineage];
