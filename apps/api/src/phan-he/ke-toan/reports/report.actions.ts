// @bizcity-layer D modules/ke-toan
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — thêm accounting.report.income-statement (MCP + module thue gọi qua callAction) và accounting.report.term-rules (bảng ngắn / dài hạn B01 cho thue)
/**
 * Công cụ đọc `accounting.*` cho trợ lý AI (bizcity_mcp@1 §5.1, PHASES 2.11): action chỉ phơi qua MCP (`expose.mcp`, không route HTTP
 * mới — màn hình vẫn dùng /api/v1/reports/*). Bọc reportService có sẵn; mô tả viết cho LLM: làm gì, khi nào dùng (STD-MCP-2).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../../core/actions.js';
import { reportService } from './report.service.js';
import { TERM_MAP } from './balance-sheet.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const period = {
  from: date.describe('Từ ngày hạch toán, YYYY-MM-DD (vd đầu tháng 2026-10-01)'),
  to: date.describe('Đến ngày hạch toán, YYYY-MM-DD (vd cuối tháng 2026-10-31)'),
  branchCodes: z.array(z.string()).optional().describe('Mã chi nhánh cần xem; bỏ trống = mọi chi nhánh'),
};
const report = z.object({
  rows: z.array(z.record(z.unknown())).describe('Từng dòng báo cáo; số tiền là number (đồng)'),
  totals: z.record(z.unknown()).describe('Dòng tổng'),
}).passthrough();
type Report = z.infer<typeof report>;
const tags = ['Báo cáo (AI)'];

export const reportActions: AnyActionDef[] = [
  defineAction({
    id: 'accounting.balance.get', title: 'Số dư tài khoản tại một ngày', tags,
    description: 'Số dư cuối ngày asOf của một tài khoản (gồm tài khoản con), vd 1111 tiền mặt, 131 phải thu, 331 phải trả, 156 hàng hoá. '
      + 'balance > 0 là dư Nợ, < 0 là dư Có. Đọc ngay từ sổ (không qua bộ nhớ đệm): bút toán vừa ghi đã có trong số dư (R-CACHE-2).',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({
      account: z.string().regex(/^\d{3,10}$/, 'Số tài khoản 3–10 chữ số').describe('Số tài khoản (đầu số), vd 1111, 131'),
      asOf: date.describe('Ngày tính số dư (cuối ngày), YYYY-MM-DD'),
      branchCodes: period.branchCodes,
    }),
    output: z.object({
      account: z.string(), asOf: z.string(),
      balance: z.number().describe('Dư Nợ − dư Có (đồng)'),
      accounts: z.array(z.object({ code: z.string(), name: z.string(), balance: z.number() })).describe('Từng tài khoản chi tiết'),
    }),
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => {
      const tb = await reportService.trialBalance(ctx.legacyAuth, { from: q.asOf, to: q.asOf, account: q.account, branchCodes: q.branchCodes, postingOnly: true });
      const accounts = tb.rows.map((r) => ({ code: r.code, name: r.name, balance: Math.round((r.closingDebit - r.closingCredit) * 100) / 100 }));
      return { account: q.account, asOf: q.asOf, balance: Math.round(accounts.reduce((s, r) => s + r.balance * 100, 0)) / 100, accounts };
    },
  }),
  defineAction({
    id: 'accounting.report.trial-balance', title: 'Bảng cân đối số phát sinh', tags,
    description: 'Số dư đầu kỳ, phát sinh Nợ / Có, số dư cuối kỳ của từng tài khoản trong khoảng ngày. Dùng khi chủ hỏi tình hình chung của sổ, '
      + 'một tài khoản đang dư bao nhiêu, kỳ này phát sinh gì. Lọc một tài khoản bằng account (vd 131, 156).',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({ ...period, account: z.string().optional().describe('Đầu số tài khoản cần xem (vd 131); bỏ trống = mọi tài khoản'), postingOnly: z.boolean().optional().describe('true = chỉ tài khoản chi tiết') }),
    output: report,
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => (await reportService.trialBalance(ctx.legacyAuth, q)) as unknown as Report,
  }),
  defineAction({
    id: 'accounting.cash.balances', title: 'Số dư tiền mặt, tiền gửi ngân hàng', tags,
    description: 'Tiền đầu kỳ, thu, chi, tiền cuối kỳ theo chi nhánh và tài khoản tiền (111 tiền mặt, 112 ngân hàng, 113 đang chuyển). '
      + 'Dùng khi chủ hỏi "còn bao nhiêu tiền", "quỹ cửa hàng còn bao nhiêu".',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({ ...period, accounts: z.array(z.string()).optional().describe('Đầu số tài khoản tiền; mặc định 111, 112, 113') }),
    output: report,
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => (await reportService.cashBalances(ctx.legacyAuth, q)) as unknown as Report,
  }),
  defineAction({
    id: 'accounting.debts.partner-balances', title: 'Công nợ theo đối tượng', tags,
    description: 'Số dư đầu kỳ, phát sinh, số dư cuối kỳ của từng khách hàng / nhà cung cấp trên một tài khoản công nợ '
      + '(131 phải thu khách hàng, 331 phải trả nhà cung cấp). Dùng khi chủ hỏi "khách nào còn nợ", "còn nợ nhà cung cấp bao nhiêu".',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({
      ...period,
      account: z.string().optional().describe('Tài khoản công nợ: 131 (phải thu) hoặc 331 (phải trả); bỏ trống = mọi tài khoản theo dõi đối tượng'),
      hideZero: z.boolean().default(true).describe('Ẩn đối tượng không còn số dư, không phát sinh'),
    }),
    output: report,
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => (await reportService.partnerBalances(ctx.legacyAuth, q)) as unknown as Report,
  }),
  defineAction({
    id: 'accounting.report.income-statement', title: 'Báo cáo kết quả hoạt động kinh doanh (B02)', tags,
    description: 'Từng chỉ tiêu B02 (mã 01…60) kỳ này và cùng kỳ năm trước: doanh thu, giảm trừ, giá vốn, lãi gộp, doanh thu / chi phí tài chính, '
      + 'chi phí bán hàng, quản lý, lợi nhuận trước thuế (50), thuế TNDN (51), lợi nhuận sau thuế (60). Dùng khi chủ hỏi lãi lỗ, kết quả kinh doanh.',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object(period),
    output: z.object({
      period: z.object({ from: z.string(), to: z.string() }),
      previous: z.object({ from: z.string(), to: z.string() }),
      rows: z.array(z.object({ code: z.string(), name: z.string(), note: z.string(), bold: z.boolean(), accounts: z.string(), current: z.number(), previous: z.number() }))
        .describe('Chỉ tiêu B02; current = kỳ này, previous = cùng kỳ năm trước (đồng)'),
    }),
    expose: { mcp: true, ai: 'read' },
    handler: (ctx, q) => reportService.incomeStatement(ctx.legacyAuth, q),
  }),
  defineAction({
    id: 'accounting.report.term-rules', title: 'Nhóm tài khoản có phần ngắn hạn / dài hạn trên B01', tags,
    description: 'Đầu tài khoản nào tách ngắn hạn / dài hạn trên bảng cân đối kế toán, lên chỉ tiêu nào (tài sản, nợ phải trả). '
      + 'Dữ liệu mẫu biểu, không theo đơn vị; module thuế dùng khi kiểm màn Phân loại dài hạn.',
    permission: 'catalog:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: z.array(z.object({ prefix: z.string(), label: z.string(), asset: z.tuple([z.string(), z.string()]).nullable(), liability: z.tuple([z.string(), z.string()]).nullable() })),
    expose: {},
    handler: async () => TERM_MAP.map((r) => ({ prefix: r.prefix, label: r.label, asset: r.asset ?? null, liability: r.liability ?? null })),
  }),
];
