// @bizcity-layer D modules/ke-toan
/**
 * Báo cáo.
 *   GET /api/v1/reports/trial-balance     Bảng cân đối số phát sinh
 *   GET /api/v1/reports/account-ledger    Sổ chi tiết tài khoản
 *   GET /api/v1/reports/sales-invoices    Bảng kê hoá đơn bán ra
 *   GET /api/v1/reports/income-statement  Báo cáo kết quả hoạt động kinh doanh
 *   GET /api/v1/reports/balance-sheet     Báo cáo tình hình tài chính (B01-DN)
 *   GET /api/v1/reports/tax-summary       Bảng tổng hợp thuế GTGT
 *   GET /api/v1/reports/cash-balances     Bảng kê số dư tiền
 *   GET /api/v1/reports/cash-items        Dòng tiền theo mục thu / chi
 *   GET /api/v1/reports/posting-summary   Bảng tổng hợp chứng từ
 *   GET /api/v1/reports/expense-by-dimension  Chi phí theo khoản mục, bộ phận, hợp đồng
 *   GET /api/v1/reports/aging             Công nợ theo tuổi nợ
 *   GET /api/v1/reports/profit-by-contract  Lãi lỗ theo hợp đồng (tổng hợp / chi tiết theo tài khoản)
 *   GET /api/v1/reports/debt-by-employee  Công nợ theo nhân viên
 *   GET /api/v1/reports/debt-by-item      Công nợ theo mặt hàng
 *   GET /api/v1/reports/document-checks   Kiểm tra chứng từ, hoá đơn
 *   GET /api/v1/reports/journal           Sổ nhật ký chung
 *   GET /api/v1/reports/partner-balances  Tổng hợp công nợ theo đối tượng
 *   GET /api/v1/reports/dashboard         Số liệu tổng quan
 *   GET /api/v1/reports/cash-journal      Sổ nhật ký thu tiền / chi tiền (S03a1)
 *   GET /api/v1/reports/sales-journal     Sổ nhật ký bán hàng
 *   GET /api/v1/reports/purchase-journal  Sổ nhật ký mua hàng
 *   GET /api/v1/reports/voucher-listing   Bảng kê chi tiết chứng từ
 *   GET /api/v1/reports/cash-flow         Báo cáo lưu chuyển tiền tệ
 *
 * branchCodes: danh sách mã chi nhánh cách nhau dấu phẩy; bỏ trống = toàn bộ.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../../core/auth.js';
import { ok, pageMeta, pageQuerySchema, queryBool } from '../../../core/http.js';
import { reportService } from './report.service.js';
import { BCTC_REPORTS, bctcSaveSchema, lapBctcService } from './lap-bctc.js';
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — Lập BCTC gác theo thao tác màn ACC99 (lưu / xoá) (đóng góp)
import { quyenThaoTac } from '../../../modules/access/man-hinh.js';
import '../man-hinh-ke-toan.js'; // đăng ký màn Kế toán trước khi lệnh đọc quyền
import { registerActions } from '../../../core/actions.js';
import { reportActions } from './report.actions.js';
import { EXPENSE_GROUPS, type ExpenseGroup } from './control-reports.js';

const tags = ['Báo cáo'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const branchCodes = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const POSTING_GROUPS = ['branch', 'month', 'docType', 'costItem', 'reason'] as const;
const postingGroups = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter((x): x is (typeof POSTING_GROUPS)[number] => (POSTING_GROUPS as readonly string[]).includes(x)) : undefined))
  .describe('Gom thêm theo: branch, month, docType, costItem, reason (cách nhau dấu phẩy)');

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // Công cụ đọc accounting.* cho trợ lý AI (MCP) — chỉ vào registry action, không thêm route HTTP.
  registerActions(reportActions);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const pre = requirePermission('reports:read');

  // [2026-11-11 Nguyễn Văn Thủy] Lập báo cáo tài chính (ACC99): lập số theo kỳ, lưu bộ đã lập (đóng góp)
  const idParam = z.object({ id: z.coerce.number().int().positive() });
  r.get('/api/v1/financial-statements', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo tài chính đã lập (danh sách)' },
    handler: async (req) => ok(await lapBctcService.list(authOf(req))),
  });
  r.get('/api/v1/financial-statements/build', {
    preHandler: pre,
    schema: { tags, summary: 'Lập số báo cáo tài chính cho một kỳ (B01, B02, B03 từ sổ)', querystring: z.object({ from: date, to: date, reports: z.string().default(BCTC_REPORTS.join(',')).transform((s) => s.split(',').filter((x): x is (typeof BCTC_REPORTS)[number] => (BCTC_REPORTS as readonly string[]).includes(x))) }) },
    handler: async (req) => ok(await lapBctcService.build(authOf(req), req.query)),
  });
  r.get('/api/v1/financial-statements/:id', {
    preHandler: pre,
    schema: { tags, summary: 'Một bộ báo cáo tài chính đã lập', params: idParam },
    handler: async (req) => ok(await lapBctcService.get(authOf(req), req.params.id)),
  });
  r.put('/api/v1/financial-statements', {
    preHandler: requirePermission(quyenThaoTac('ke-toan.lap-bctc', 'luu')), // [2026-11-13 08:00 PM kiennt] NT-HT-003 — thao tác luu của màn ACC99 (đóng góp)
    schema: { tags, summary: 'Ghi bộ báo cáo tài chính đã lập (thêm mới hoặc sửa)', body: bctcSaveSchema },
    handler: async (req) => ok(await lapBctcService.save(authOf(req), req.body)),
  });
  r.delete('/api/v1/financial-statements/:id', {
    preHandler: requirePermission(quyenThaoTac('ke-toan.lap-bctc', 'xoa')), // [2026-11-13 08:00 PM kiennt] NT-HT-003 — thao tác xoa của màn ACC99 (đóng góp)
    schema: { tags, summary: 'Xoá bộ báo cáo tài chính đã lập', params: idParam },
    handler: async (req) => ok(await lapBctcService.remove(authOf(req), req.params.id)),
  });

  r.get('/api/v1/reports/trial-balance', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Bảng cân đối số phát sinh',
      querystring: z.object({ from: date, to: date, branchCodes, account: z.string().optional(), postingOnly: queryBool }),
    },
    handler: async (req) => ok(await reportService.trialBalance(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/account-ledger', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Sổ chi tiết tài khoản',
      querystring: z.object({
        account: z.string().min(1),
        from: date,
        to: date,
        branchCodes,
        partnerCode: z.string().optional(),
        showCorrections: queryBool.describe('Hiện cả bút toán gốc đã sửa và bút toán ghi số âm'),
        kind: z.enum(['detail', 'ledger', 'partner', 'cash']).default('detail').describe('detail sổ chi tiết | ledger sổ cái | partner sổ chi tiết công nợ | cash sổ quỹ, tiền gửi'),
        groupMode: z.coerce.number().int().min(1).max(3).default(1).transform((v) => v as 1 | 2 | 3).describe('1 từng dòng | 2 theo chứng từ + TK đối ứng | 3 theo chứng từ'),
        counterAccount: z.string().optional().describe('Lọc theo tài khoản đối ứng (đầu số)'),
        docType: z.string().optional().describe('Lọc theo loại chứng từ'),
        sku: z.string().trim().max(64).optional().describe('Mã hàng, mã cũ hay mã đã gộp đều được: lấy toàn bộ dòng sổ của mặt hàng, số dư đầu kỳ cũng vậy (vd 156 chi tiết theo mã hàng)'),
        codeOnly: queryBool.optional().describe('Chỉ lấy phần ghi dưới đúng mã này, không gồm mã cũ / mã đã gộp'),
      }),
    },
    handler: async (req) => ok(await reportService.accountLedger(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/sales-invoices', {
    preHandler: pre,
    schema: { tags, summary: 'Bảng kê hoá đơn bán ra (direction=output) hoặc mua vào (direction=input)', querystring: z.object({ from: date, to: date, branchCodes, direction: z.enum(['output', 'input']).default('output'), merge: z.enum(['0', '1']).optional().transform((v) => v === '1').describe('1 = cộng gộp theo từng hoá đơn') }) },
    handler: async (req) => ok(await reportService.salesInvoices(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/income-statement', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo kết quả hoạt động kinh doanh (B02-DN)', querystring: z.object({ from: date, to: date, branchCodes }) },
    handler: async (req) => ok(await reportService.incomeStatement(authOf(req), req.query)),
  });

  const ranged = z.object({ from: date, to: date, branchCodes });

  r.get('/api/v1/reports/balance-sheet', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo tình hình tài chính (B01-DN, Thông tư 99)', querystring: ranged },
    handler: async (req) => ok(await reportService.balanceSheet(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/tax-summary', {
    preHandler: pre,
    schema: { tags, summary: 'Bảng tổng hợp thuế GTGT theo chi nhánh', querystring: z.object({ from: date, to: date, branchCodes }) },
    handler: async (req) => ok(await reportService.taxSummary(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/cash-items', {
    preHandler: pre,
    schema: { tags, summary: 'Dòng tiền: thu / chi trên tài khoản tiền theo mục thu / chi', querystring: ranged },
    handler: async (req) => ok(await reportService.cashItems(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/cash-balances', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Bảng kê số dư tiền',
      querystring: ranged.extend({ accounts: z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined)).describe('Đầu số tài khoản tiền, cách nhau dấu phẩy; mặc định 111,112,113') }),
    },
    handler: async (req) => ok(await reportService.cashBalances(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/posting-summary', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Bảng tổng hợp chứng từ theo cặp tài khoản',
      querystring: ranged.extend({ docType: z.string().trim().optional(), groups: postingGroups, byDocType: queryBool.describe('Cũ: tương đương groups=docType') }),
    },
    handler: async (req) => {
      const groups = [...(req.query.groups ?? []), ...(req.query.byDocType ? (['docType'] as const) : [])];
      return ok(await reportService.postingSummary(authOf(req), { ...req.query, groups }));
    },
  });

  r.get('/api/v1/reports/cash-journal', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Sổ nhật ký thu tiền / chi tiền (mẫu S03a1)',
      querystring: ranged.extend({
        account: z.string().trim().min(1).default('111'),
        direction: z.enum(['in', 'out']).default('in').describe('in sổ thu tiền | out sổ chi tiền'),
        columns: z.string().optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5) : undefined)).describe('Tối đa 5 đầu số tài khoản đối ứng, cách nhau dấu phẩy'),
      }),
    },
    handler: async (req) => ok(await reportService.cashJournal(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/sales-journal', {
    preHandler: pre,
    schema: {
      tags, summary: 'Sổ nhật ký bán hàng',
      querystring: ranged.extend({
        partnerCode: z.string().optional(),
        account: z.string().trim().max(20).optional().describe('Đầu số tài khoản doanh thu (5111, 5113…)'),
        productSkus: z.string().optional().describe('Mã hàng, cách nhau dấu phẩy'),
      }),
    },
    handler: async (req) => ok(await reportService.salesJournal(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/purchase-journal', {
    preHandler: pre,
    schema: { tags, summary: 'Sổ nhật ký mua hàng', querystring: ranged.extend({ partnerCode: z.string().optional() }) },
    handler: async (req) => ok(await reportService.purchaseJournal(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/voucher-listing', {
    preHandler: pre,
    schema: { tags, summary: 'Bảng kê chi tiết chứng từ (tối đa 1 tháng)', querystring: ranged.merge(pageQuerySchema).extend({ account: z.string().optional(), docType: z.string().optional() }) },
    handler: async (req) => {
      const data = await reportService.voucherListing(authOf(req), req.query);
      return ok(data, pageMeta(req.query, data.total));
    },
  });

  r.get('/api/v1/reports/cash-flow', {
    preHandler: pre,
    schema: { tags, summary: 'Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp)', querystring: ranged },
    handler: async (req) => ok(await reportService.cashFlow(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/expense-by-dimension', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Chi phí theo khoản mục, bộ phận, hợp đồng',
      querystring: ranged.extend({
        account: z.string().trim().min(1).default('64').describe('Đầu số tài khoản chi phí'),
        groupBy: z.string().default('costItem').transform((s) => s.split(',').map((x) => x.trim()).filter((x): x is ExpenseGroup => (EXPENSE_GROUPS as readonly string[]).includes(x))).describe('Gom theo: costItem, department, contract, employee, case, project, capitalSource, account (cách nhau dấu phẩy)'),
      }),
    },
    handler: async (req) => ok(await reportService.expenseByDimension(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/profit-by-contract', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Lãi lỗ theo hợp đồng',
      querystring: ranged.extend({ detail: queryBool.describe('true = chi tiết theo tài khoản'), contract: z.string().trim().optional().describe('Chỉ một hợp đồng') }),
    },
    handler: async (req) => ok(await reportService.profitByContract(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/aging', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Công nợ theo tuổi nợ',
      querystring: z.object({ asOf: date, account: z.string().trim().min(1).default('131'), step: z.coerce.number().int().min(1).max(365).default(30), branchCodes }),
    },
    handler: async (req) => ok(await reportService.aging(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/aging-due', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Công nợ theo tuổi nợ (theo hạn thanh toán từng khoản)',
      querystring: z.object({
        asOf: date, account: z.string().trim().min(1).default('131'), step: z.coerce.number().int().min(1).max(365).default(30), branchCodes,
        partnerCode: z.string().trim().optional(), groupCode: z.string().trim().optional().describe('Nhóm đối tượng'),
      }),
    },
    handler: async (req) => ok(await reportService.agingByDue(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/debt-by-term', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Sổ công nợ theo hạn thanh toán (theo chứng từ, kèm phiếu thanh toán)',
      querystring: z.object({ from: date, to: date, account: z.string().trim().min(1).default('131'), branchCodes, partnerCode: z.string().trim().optional(), groupCode: z.string().trim().optional() }),
    },
    handler: async (req) => ok(await reportService.debtByTerm(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/debt-by-employee', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Công nợ theo nhân viên',
      querystring: ranged.extend({
        account: z.string().trim().min(1).default('131').describe('Đầu số tài khoản công nợ'),
        employee: z.string().trim().optional().describe('Mã nhân viên; chuỗi rỗng = các dòng chưa gắn nhân viên'),
      }),
    },
    handler: async (req) => ok(await reportService.debtByEmployee(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/debt-by-item', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Công nợ theo mặt hàng',
      querystring: ranged.extend({
        account: z.string().trim().min(1).default('131').describe('Đầu số tài khoản công nợ'),
        partnerCode: z.string().trim().optional(),
      }),
    },
    handler: async (req) => ok(await reportService.debtByItem(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/document-checks', {
    preHandler: pre,
    schema: { tags, summary: 'Kiểm tra chứng từ, hoá đơn', querystring: z.object({ from: date, to: date, branchCodes }) },
    handler: async (req) => ok(await reportService.documentChecks(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/journal', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Sổ nhật ký chung',
      querystring: pageQuerySchema.extend({
        from: date,
        to: date,
        branchCodes,
        docType: z.string().trim().optional().describe('Lọc một loại chứng từ: sale, sale_return, receipt, payment, manual'),
        search: z.string().trim().max(100).optional().describe('Số chứng từ, số bút toán, diễn giải, hoặc đầu số tài khoản'),
        account: z.string().trim().max(20).optional().describe('Số tài khoản (lọc theo đầu số, ví dụ 131)'),
        counterAccount: z.string().trim().max(20).optional().describe('Tài khoản đối ứng (đầu số)'),
        sku: z.string().trim().max(64).optional().describe('Mã hàng, mã cũ hay mã đã gộp đều được: lấy toàn bộ dòng định khoản của mặt hàng (vd hàng nhập mua, giá vốn)'),
        codeOnly: queryBool.optional().describe('Chỉ lấy phần ghi dưới đúng mã này, không gồm mã cũ / mã đã gộp'),
        groupMode: z.coerce.number().int().min(1).max(3).default(1).transform((v) => v as 1 | 2 | 3).describe('1 theo chi tiết chứng từ | 2 theo chứng từ + TK đối ứng | 3 theo chứng từ'),
        showCorrections: queryBool,
        corrections: z.enum(['hide', 'all', 'only']).optional().describe('hide = chỉ bút toán hiệu lực; all = cả bút toán đã đảo và ghi số âm; only = chỉ hai loại đó'),
      }),
    },
    handler: async (req) => {
      const data = await reportService.journal(authOf(req), req.query);
      return ok({ rows: data.rows, totals: data.totals }, pageMeta(req.query, data.total));
    },
  });

  r.get('/api/v1/reports/partner-balances', {
    preHandler: pre,
    schema: {
      tags,
      summary: 'Sổ tổng hợp công nợ phát sinh theo đối tượng',
      querystring: z.object({
        account: z.string().default('131').transform((s) => (s.trim() === '*' ? '' : s.trim())).describe('Đầu số tài khoản; * = mọi tài khoản theo dõi đối tượng'),
        from: date, to: date, branchCodes,
        hideZero: queryBool.describe('Ẩn đối tượng đã hết số dư cuối kỳ'),
        byBranch: queryBool.describe('Tách theo chi nhánh'),
      }),
    },
    handler: async (req) => ok(await reportService.partnerBalances(authOf(req), req.query)),
  });

  r.get('/api/v1/reports/dashboard', {
    preHandler: pre,
    schema: { tags, summary: 'Số liệu tổng quan', querystring: z.object({ from: date, to: date }) },
    handler: async (req) => ok(await reportService.dashboard(authOf(req), req.query)),
  });
}
