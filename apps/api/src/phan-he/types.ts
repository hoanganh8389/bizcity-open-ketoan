// @bizcity-layer P module-sdk
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
import type { FastifyPluginAsync } from 'fastify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Routes = FastifyPluginAsync<any>;

/** Một phân hệ phía máy chủ: mã (trùng manifest giao diện apps/web/src/phan-he/<key>) + các route nó cần. */
export interface ApiModule {
  key: string;
  label: string;
  routes: Routes[];
  /** Bật phân hệ này thì bật kèm các phân hệ khác (vd Kế toán xem được mọi số liệu: kèm Kho, Bán hàng, Thuế…). */
  includes?: string[];
}
