// @bizcity-layer K kernel/accounts
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
import { z } from 'zod';
import { queryBool } from '../../core/http.js';

const accountCode = z.string().trim().regex(/^[0-9A-Za-z]{3,20}$/, 'Số tài khoản 3–20 ký tự chữ số');

export const accountCreateSchema = z.object({
  code: accountCode,
  name: z.string().trim().min(1).max(255),
  nameEn: z.string().trim().max(255).optional(),
  parentCode: accountCode.optional(),
  normalSide: z.enum(['debit', 'credit', 'both']).default('debit'),
  trackPartner: z.boolean().default(false),
  trackCostItem: z.boolean().default(false),
  trackDepartment: z.boolean().default(false),
  trackContract: z.boolean().default(false),
  trackEmployee: z.boolean().default(false),
  trackCase: z.boolean().default(false),
  trackProject: z.boolean().default(false),
  trackCapitalSource: z.boolean().default(false),
  trackCashflow: z.boolean().default(false),
  isForeignCurrency: z.boolean().default(false),
  trackProduct: z.boolean().default(false),
  trackInternalDebt: z.boolean().default(false),
  isVat: z.boolean().default(false),
  isDebt: z.boolean().default(false),
  isLoan: z.boolean().default(false),
  alwaysIncrease: z.boolean().default(false),
  isLedger: z.boolean().default(false),
  isCost: z.boolean().default(false),
});
export type AccountCreate = z.infer<typeof accountCreateSchema>;

export const accountUpdateSchema = accountCreateSchema.omit({ code: true, parentCode: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

export const accountListQuerySchema = z.object({
  search: z.string().trim().optional(),
  postingOnly: queryBool,
  includeInactive: queryBool,
});
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;

/** Dạng trả về cho giao diện (camelCase). */
export interface AccountDto {
  code: string;
  name: string;
  nameEn: string | null;
  parentCode: string | null;
  level: number;
  normalSide: string;
  isPosting: boolean;
  trackPartner: boolean;
  trackCostItem: boolean;
  trackDepartment: boolean;
  trackContract: boolean;
  trackEmployee: boolean;
  trackCase: boolean;
  trackProject: boolean;
  trackCapitalSource: boolean;
  trackCashflow: boolean;
  isForeignCurrency: boolean;
  trackProduct: boolean;
  trackInternalDebt: boolean;
  isVat: boolean;
  isDebt: boolean;
  isLoan: boolean;
  alwaysIncrease: boolean;
  isLedger: boolean;
  isCost: boolean;
  isActive: boolean;
}
