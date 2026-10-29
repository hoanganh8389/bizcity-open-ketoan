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
