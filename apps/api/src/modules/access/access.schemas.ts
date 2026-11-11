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

// [2026-11-06 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W2 đợt 2 (ADR-0027 Phụ lục A, chữ chốt bước 3): gán nhận đúng một trong role / tenantRoleId; vai trò của đơn vị có Cho quyền cao đòi confirmPassword
export const roleAssignSchema = z.object({
  role: role.optional().describe('Vai trò hệ thống bổ sung (đúng một trong role / tenantRoleId)'),
  tenantRoleId: z.string().regex(/^\d+$/).optional().describe('Vai trò của đơn vị (tenant_roles.id)'),
  confirmPassword: z.string().min(1).max(200).optional().describe('Mật khẩu của người thao tác — bắt buộc khi vai trò có Cho quyền rủi ro cao'),
  // [2026-11-07 09:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W5 đợt 1: phạm vi chi nhánh của lần gán (chỉ có tác dụng ở route gọi requireScope — cửa nạp chứng từ)
  // [2026-11-09 03:15 PM kiennt] PHASE-028 — S028-19 (giai đoạn 3.3): phạm vi KHO — gán theo một kho (tương đương tblUserKho của HTsoft); chỉ có tác dụng ở cửa nạp chứng từ có dòng hàng theo kho
  scopeType: z.enum(['tenant', 'branch', 'warehouse']).default('tenant').describe('tenant: cả đơn vị (mặc định); branch: một chi nhánh; warehouse: một kho — chỉ có tác dụng ở route kiểm theo chi nhánh / kho (cửa nạp chứng từ)'),
  scopeId: z.string().regex(/^\d+$/).optional().describe('id chi nhánh (branches.id) khi scopeType = branch; id kho (warehouses.id) khi scopeType = warehouse'),
  validFrom: isoDate.optional().describe('Mặc định hôm nay (giờ Việt Nam)'),
  validTo: isoDate.optional().describe('Ngày cuối hiệu lực (gồm cả ngày này); bỏ trống = không hạn'),
  reason,
});
export type RoleAssign = z.infer<typeof roleAssignSchema>;

export const roleRevokeSchema = z.object({ reason });
export type RoleRevoke = z.infer<typeof roleRevokeSchema>;

// Vai trò của đơn vị (tenant_roles) và luật của chúng — mã, loại, vai trò nền bất biến sau khi tạo (0075)
const confirmPassword = z.string().min(1).max(200).optional().describe('Mật khẩu của người thao tác — bắt buộc khi Cho quyền rủi ro cao');
export const tenantRoleCreateSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/, 'Mã dạng chữ thường, số, _ hoặc -; 2–40 ký tự, bắt đầu bằng chữ'),
  label: z.string().trim().min(1).max(120),
  kind: z.enum(['job', 'privilege', 'restriction']),
  baseRole: z.enum(['chief_accountant', 'accountant', 'viewer', 'developer', 'auditor']).optional().describe('Vai trò hệ thống làm nền (không owner); loại restriction không có nền'),
  reason,
});
export type TenantRoleCreate = z.infer<typeof tenantRoleCreateSchema>;

export const tenantRoleUpdateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  version: z.number().int().min(1).describe('version hiện tại của vai trò (khoá lạc quan)'),
  reason,
});
export type TenantRoleUpdate = z.infer<typeof tenantRoleUpdateSchema>;

export const tenantRuleAddSchema = z.object({
  permission: z.string().regex(/^[a-z*][a-z0-9*-]*:[a-z*][a-z0-9*-]*$/, 'Quyền dạng <module>:<việc>'),
  effect: z.enum(['allow', 'deny']),
  note: z.string().trim().max(300).optional(),
  reason,
  confirmPassword,
});
export type TenantRuleAdd = z.infer<typeof tenantRuleAddSchema>;

export const tenantRuleRemoveSchema = z.object({ reason });

/** Phạm vi của khoá API (ánh xạ sang quyền ở core/auth.ts → SCOPE_PERMISSIONS). */
export const API_KEY_SCOPES = ['documents:write', 'reports:read', 'catalog:write'] as const;

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['documents:write', 'reports:read']),
});
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
