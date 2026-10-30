// @bizcity-layer M data/masterdata
import { z } from 'zod';

export const branchCreateSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  accountingUnitCode: z.string().trim().max(32).optional(),
  address: z.string().trim().max(500).optional(),
  externalRef: z.string().trim().max(64).optional(),
  /** Mã bộ phận của chi nhánh (trống = chưa gắn). */
  departmentCode: z.string().trim().max(64).nullable().optional(),
  /** Ghi chú, tên in báo cáo, số ĐKKD / mã số thuế, điện thoại, fax của chi nhánh. */
  note: z.string().trim().max(500).optional(),
  companyName: z.string().trim().max(500).optional(),
  taxCode: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(500).optional(),
  fax: z.string().trim().max(500).optional(),
});
export type BranchCreate = z.infer<typeof branchCreateSchema>;

/** newCode: đổi mã chi nhánh (shop lên Plus / Premium, đóng thành _OFF) — chứng từ, bút toán, kho giữ nguyên vì gắn theo id. */
export const branchUpdateSchema = branchCreateSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional(), newCode: z.string().trim().min(1).max(32).optional() });
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  accountingUnitCode: string | null;
  address: string | null;
  externalRef: string | null;
  departmentCode: string | null;
  note: string;
  companyName: string;
  taxCode: string;
  phone: string;
  fax: string;
  isActive: boolean;
}
