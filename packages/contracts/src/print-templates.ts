// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Cấu hình mẫu in (màn Hệ thống → Mẫu in, HT05; bảng print_template_settings).
 * Bố cục mẫu nằm trong code giao diện; cấu hình chỉ ghi phần khác mặc định: bật / tắt, mẫu mặc định, chỉnh nội dung.
 * Thứ tự áp: người dùng → chi nhánh / shop → chi nhánh cha → cả đơn vị → mặc định trong code.
 */
import { z } from 'zod';

export const PRINT_SCOPES = ['tenant', 'branch', 'user'] as const;
export type PrintScope = (typeof PRINT_SCOPES)[number];
export const PRINT_PAPERS = ['A4', 'A4L', 'A5L', 'A5', 'roll80', 'label'] as const;

/** Mã mẫu cố định: mã màn + ":" + mã mẫu, vd BH10:a5. */
export const printTemplateCode = z.string().trim().regex(/^[A-Za-z0-9]+:[a-z0-9-]+$/, 'Mã mẫu dạng MÃMÀN:mã-mẫu');

export const printOverridesSchema = z.object({
  /** Tiêu đề chính của tờ in (vd "PHIẾU XUẤT KHO KIÊM BẢO HÀNH"). */
  title: z.string().trim().max(120).optional(),
  /** Số liên in lặp (1–5). */
  copies: z.number().int().min(1).max(5).optional(),
  paper: z.enum(PRINT_PAPERS).optional(),
  /** Hàng chữ ký thay cho mặc định của mẫu: chức danh, ghi chú dưới chức danh, tên in sẵn. */
  signs: z.array(z.object({ title: z.string().trim().min(1).max(60), note: z.string().trim().max(60).optional(), name: z.string().trim().max(80).optional() })).max(8).optional(),
  /** Dòng căn cứ dưới mẫu số; '' = không in. */
  formNote: z.string().trim().max(200).optional(),
  /** Ghi chú in ở cuối tờ (vd chính sách đổi trả). */
  footer: z.string().trim().max(500).optional(),
  showLogo: z.boolean().optional(),
}).strict();
export type PrintOverrides = z.infer<typeof printOverridesSchema>;

export const printSettingInputSchema = z.object({
  templateCode: printTemplateCode,
  scope: z.enum(PRINT_SCOPES),
  /** Mã chi nhánh (branch) hoặc id người dùng (user); rỗng với tenant. */
  scopeRef: z.string().trim().max(64).default(''),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  overrides: printOverridesSchema.default({}),
});
export type PrintSettingInput = z.infer<typeof printSettingInputSchema>;

export interface PrintSetting extends PrintSettingInput { id: string; updatedBy: string; updatedAt: string }

/** Màn của một mã mẫu ("BH10:a5" → "BH10"). */
export const printScreenOf = (templateCode: string) => templateCode.split(':')[0] ?? '';
