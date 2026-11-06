// @bizcity-layer P permissions
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: thêm vai trò developer (Q019-1).
import { z } from 'zod';

// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: vai trò auditor
const role = z.enum(['owner', 'chief_accountant', 'accountant', 'viewer', 'developer', 'auditor']);
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

// [2026-11-05 06:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W1: gán / thu hồi vai trò bổ sung (chỉ phạm vi cả đơn vị + mục đích operate — chữ chốt 00 §4a)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(500);

export const roleAssignSchema = z.object({
  role,
  validFrom: isoDate.optional().describe('Mặc định hôm nay (giờ Việt Nam)'),
  validTo: isoDate.optional().describe('Ngày cuối hiệu lực (gồm cả ngày này); bỏ trống = không hạn'),
  reason,
});
export type RoleAssign = z.infer<typeof roleAssignSchema>;

export const roleRevokeSchema = z.object({ reason });
export type RoleRevoke = z.infer<typeof roleRevokeSchema>;

/** Phạm vi của khoá API (ánh xạ sang quyền ở core/auth.ts → SCOPE_PERMISSIONS). */
export const API_KEY_SCOPES = ['documents:write', 'reports:read', 'catalog:write'] as const;

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['documents:write', 'reports:read']),
});
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
