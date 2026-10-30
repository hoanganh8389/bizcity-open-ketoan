// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
import { z } from 'zod';

const role = z.enum(['owner', 'chief_accountant', 'accountant', 'viewer']);
const password = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(200);

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(1).max(255),
  role,
  password,
});
export type UserCreate = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  role: role.optional(),
  isActive: z.boolean().optional(),
  password: password.optional().describe('Đặt lại mật khẩu'),
});
export type UserUpdate = z.infer<typeof userUpdateSchema>;

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

/** Phạm vi của khoá API (ánh xạ sang quyền ở core/auth.ts → SCOPE_PERMISSIONS). */
export const API_KEY_SCOPES = ['documents:write', 'reports:read', 'catalog:write'] as const;

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['documents:write', 'reports:read']),
});
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
