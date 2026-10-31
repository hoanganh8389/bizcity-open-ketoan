// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Kết nối hệ thống khác (cấu hình ở trạm Định khoản tự động — ACC14).
 *
 * Phần mềm kế toán không lập phiếu mua, bán, kho: các phiếu đó lập ở hệ thống bán hàng (multisite WordPress, cửa hàng
 * WooCommerce…). Trạm ACC14 kéo các phiếu đang chờ đẩy sang qua API của hệ thống đó, lưu thành chứng từ ở trạng thái
 * "Chờ định khoản" (không lưu bảng riêng cho từng loại phiếu: toàn bộ nội dung nằm trong JSON của chứng từ), kế toán
 * xem trước rồi định khoản. Hệ thống nguồn cũng có thể tự đẩy vào cổng chờ (POST /api/v1/documents).
 *
 * Hai kiểu kết nối:
 *   standard    — ĐẦU CHUẨN. Hệ thống nguồn dựng sẵn một đường dẫn trả chứng từ đúng khuôn IngestDocument:
 *                   GET <url>?from=YYYY-MM-DD&to=YYYY-MM-DD[&cursor=…]
 *                   Authorization: Bearer <apiKey>
 *                 trả { "documents": IngestDocument[], "cancelled"?: [{ docKey, reason }], "nextCursor": string | null }.
 *                 Còn nextCursor thì gọi tiếp. "cancelled": phiếu đã gửi nay bị xoá ở nguồn → huỷ chứng từ (đảo bút toán).
 *                 Sau mỗi trang phần mềm báo nhận: POST <url> { received: [{docKey, version, status}], rejected: [{docKey, message}],
 *                 cancelled: [{docKey}] }.
 *                 Chi tiết: docs/cong-ket-noi.md.
 *   woocommerce — đơn hàng WooCommerce (REST API v3, khoá consumer key / secret) được đổi sang hoá đơn bán.
 *
 * Cấu hình lưu trong cài đặt của đơn vị (không có bảng riêng); khoá bí mật chỉ trả về dạng che.
 */
import { z } from 'zod';

export const CONNECTION_KINDS = ['standard', 'woocommerce'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];
export const CONNECTION_KIND_TEXT: Record<ConnectionKind, string> = { standard: 'Đầu chuẩn (hệ thống bán hàng)', woocommerce: 'WooCommerce' };

/** Chuỗi thay cho khoá bí mật khi trả cấu hình ra màn hình; gửi lại nguyên chuỗi này = giữ khoá cũ. */
export const SECRET_MASK = '••••••••';

export const connectionSchema = z
  .object({
    /** Mã kết nối, cũng là "Nguồn" (sourceSystem) của chứng từ kéo về. */
    code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/, 'Mã 2–32 ký tự: chữ thường, số, gạch ngang, gạch dưới'),
    name: z.string().trim().min(1, 'Chưa nhập tên').max(120),
    kind: z.enum(CONNECTION_KINDS),
    /** standard: đường dẫn cổng trả chứng từ; woocommerce: địa chỉ cửa hàng (https://shop.vn). */
    url: z.string().trim().url('Đường dẫn không hợp lệ').max(500),
    /** standard: khoá gửi kèm "Authorization: Bearer"; woocommerce: consumer key. */
    apiKey: z.string().trim().max(500).default(''),
    /** woocommerce: consumer secret. */
    apiSecret: z.string().trim().max(500).default(''),
    /** woocommerce: chi nhánh nhận đơn, loại thuế mặc định của dòng hàng, mã hình thức thanh toán theo cổng thanh toán. */
    branchCode: z.string().trim().max(32).default(''),
    taxCode: z.string().trim().max(16).default('KCT'),
    methodMap: z.record(z.string().trim().max(32)).default({}),
    enabled: z.boolean().default(true),
    /** Kết nối chính tới hệ thống bán hàng (đầu chuẩn): cầu nối website ↔ chi nhánh ở danh mục Chi nhánh. Chỉ một kết nối. */
    primary: z.boolean().default(false),
    note: z.string().trim().max(500).default(''),
  })
  .superRefine((c, ctx) => {
    if (c.kind === 'woocommerce' && !c.branchCode) ctx.addIssue({ code: 'custom', path: ['branchCode'], message: 'Kết nối WooCommerce cần chi nhánh nhận đơn' });
  });
export type Connection = z.infer<typeof connectionSchema>;

/** Cấu hình đã lưu: thêm lần kéo gần nhất. */
export interface ConnectionView extends Connection {
  lastPull: { at: string; from: string; to: string; fetched: number; received: number; unchanged: number; errors: number; cancelled?: number } | null;
}

export const connectionsInputSchema = z.object({ connections: z.array(connectionSchema).max(50) }).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.connections.forEach((c, i) => {
    if (seen.has(c.code)) ctx.addIssue({ code: 'custom', path: ['connections', i, 'code'], message: `Trùng mã kết nối ${c.code}` });
    seen.add(c.code);
    if (c.primary && c.kind !== 'standard') ctx.addIssue({ code: 'custom', path: ['connections', i, 'primary'], message: 'Kết nối chính phải là kiểu đầu chuẩn' });
  });
  if (v.connections.filter((c) => c.primary).length > 1) ctx.addIssue({ code: 'custom', path: ['connections'], message: 'Chỉ chọn một kết nối chính' });
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
export const pullInputSchema = z.object({
  from: day,
  to: day,
  /** Chỉ kéo chứng từ của các chi nhánh này (mã chi nhánh bên kế toán). Hệ thống nguồn chỉ quét đúng các cửa hàng đó. */
  branchCodes: z.array(z.string().trim().min(1).max(32)).max(1000).optional(),
}).refine((v) => v.from <= v.to, { message: 'Từ ngày phải trước Đến ngày', path: ['to'] });

/** Kết quả một lần kéo chứng từ từ một kết nối. */
export interface PullResult {
  connection: string;
  fetched: number;
  /** Chứng từ mới hoặc phiên bản mới: đã lưu, chờ định khoản. */
  received: number;
  /** Đã có đúng phiên bản này: bỏ qua. */
  unchanged: number;
  errors: { docKey: string; docNo: string; message: string }[];
  /** Chứng từ đã huỷ theo danh sách "cancelled" của nguồn (phiếu bị xoá ở nguồn). */
  cancelled: number;
  /** Báo nhận cho hệ thống nguồn không thành công (chứng từ vẫn đã lưu). */
  ackError?: string;
}
