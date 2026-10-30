// @bizcity-layer D modules/ke-toan
/**
 * Công cụ đọc `ketoan.*` cho trợ lý AI (bizcity_mcp@1 §5.1, PHASES 2.11): action chỉ phơi qua MCP (`expose.mcp`, không route HTTP
 * mới — màn hình vẫn dùng /api/v1/reports/*). Bọc reportService có sẵn; mô tả viết cho LLM: làm gì, khi nào dùng (STD-MCP-2).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { reportService } from './report.service.js';

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
    id: 'ketoan.report.trial-balance', title: 'Bảng cân đối số phát sinh', tags,
    description: 'Số dư đầu kỳ, phát sinh Nợ / Có, số dư cuối kỳ của từng tài khoản trong khoảng ngày. Dùng khi chủ hỏi tình hình chung của sổ, '
      + 'một tài khoản đang dư bao nhiêu, kỳ này phát sinh gì. Lọc một tài khoản bằng account (vd 131, 156).',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({ ...period, account: z.string().optional().describe('Đầu số tài khoản cần xem (vd 131); bỏ trống = mọi tài khoản'), postingOnly: z.boolean().optional().describe('true = chỉ tài khoản chi tiết') }),
    output: report,
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => (await reportService.trialBalance(ctx.legacyAuth, q)) as unknown as Report,
  }),
  defineAction({
    id: 'ketoan.cash.balances', title: 'Số dư tiền mặt, tiền gửi ngân hàng', tags,
    description: 'Tiền đầu kỳ, thu, chi, tiền cuối kỳ theo chi nhánh và tài khoản tiền (111 tiền mặt, 112 ngân hàng, 113 đang chuyển). '
      + 'Dùng khi chủ hỏi "còn bao nhiêu tiền", "quỹ cửa hàng còn bao nhiêu".',
    permission: 'reports:read', effect: 'read', idempotency: 'none',
    input: z.object({ ...period, accounts: z.array(z.string()).optional().describe('Đầu số tài khoản tiền; mặc định 111, 112, 113') }),
    output: report,
    expose: { mcp: true, ai: 'read' },
    handler: async (ctx, q) => (await reportService.cashBalances(ctx.legacyAuth, q)) as unknown as Report,
  }),
  defineAction({
    id: 'ketoan.debts.partner-balances', title: 'Công nợ theo đối tượng', tags,
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
];
