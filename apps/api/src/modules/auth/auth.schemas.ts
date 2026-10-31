// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
import { z } from 'zod';

export const loginBodySchema = z.object({
  tenantCode: z.string().trim().min(1).describe('Mã đơn vị'),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenant: { id: string; code: string; name: string };
  permissions: string[];
}
