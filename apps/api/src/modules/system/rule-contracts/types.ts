// @bizcity-layer P module-sdk
// [2026-11-08 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9.4): khuôn Rule Contract — luật của một loại chính sách, thuần và tất định
/**
 * RULE CONTRACT (ADR-0031 D-POL-3): khuôn luật của một loại chính sách nghiệp vụ. Thuần: không I/O, không đồng hồ, không
 * ngẫu nhiên — POS và Core chạy cùng luật ra cùng kết quả. Plugin ngoài (PHP, JS) không chạy được mã này; nó viết lại theo
 * `describe().spec` và tự kiểm bằng `describe().vectors` (đầu vào → đầu ra chuẩn).
 *
 * Nơi đặt (modules/system) là có chủ đích: tiền tố này đã có dòng ở bảng lớp, không phải sửa tests/conformance/lib/layers.mjs hay
 * packages/contracts/src/index.ts. Khi W2b cần Kernel tính lại để kiểm thì dời xuống Platform (nợ N031-1, 00 §9.2).
 */
import type { ZodType, ZodTypeDef } from 'zod';

/** Cách ghi nhận kế toán của một kết quả — chỉ chỉ `reasonCode`, không số tài khoản (D030-3). */
export interface Treatment {
  /** Loại kết quả, vd 'gift'. */
  on: string;
  reasonCode: string;
  /** false cho tới khi kế toán trưởng xác nhận bảng lý do (Q031-5). */
  confirmed: boolean;
}

/** Một tham số của khuôn, viết tay cho `describe()` (không có zod-to-json-schema trong repo). */
export interface FieldDoc { name: string; type: string; required: boolean; doc: string }

/** Một sai sót cấu trúc lúc phát hành (mã POL-PUB-* sẽ gắn khi có thư viện mã cho chính sách). */
export interface PublishIssue { path: string; message: string }

export interface Vector<P, I, O> { name: string; params: P; input: I; output: O }

export interface RuleContract<P = unknown, I = unknown, O = unknown> {
  /** `<miền>.<loại>@<major>`, vd sale.promo.buy_x_get_y@1. */
  id: string;
  /** W3a chỉ có sale; purchase.* bọc engine mua hàng ở S031-11. */
  domain: 'sale';
  title: string;
  params: ZodType<P, ZodTypeDef, unknown>;
  /** Các sai sót chéo trường mà zod không nói được (vd maxGiftQty < get.qty). Rỗng = phát hành được. */
  publishChecks(p: P): PublishIssue[];
  /** Cửa sổ chiến dịch trong NỘI DUNG (khác hiệu lực của bản ở sổ đăng ký). */
  window(p: P): { from?: string; to?: string };
  evaluate(p: P, input: I): O;
  explain(p: P, o: O): string;
  treatment(o: O): Treatment[];
  describe(): { params: FieldDoc[]; spec: unknown; vectors: Vector<P, I, O>[] };
}

/** Kiểu đã xoá tham số, để giữ trong một danh sách. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRuleContract = RuleContract<any, any, any>;
