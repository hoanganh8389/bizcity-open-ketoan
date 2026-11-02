// @bizcity-layer P bizcity.config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/config/env.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
/**
 * Cấu hình đọc từ biến môi trường, kiểm tra một lần lúc khởi động.
 * Thiếu biến bắt buộc → dừng ngay với thông báo rõ, thay vì lỗi mơ hồ lúc chạy.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4100),
  /**
   * Tự áp migration khi API khởi động. Mặc định bật (chạy dev trên máy cho tiện); Docker đặt 0 — job db-migrate lo,
   * API chỉ kiểm: còn migration chưa áp thì không khởi động.
   */
  AUTO_MIGRATE: z.enum(['0', '1']).default('1'),
  /** Phân hệ chạy trong tiến trình này (src/phan-he.ts): '*' = tất cả; vd 'mua-hang,kho'. Lõi luôn bật. */
  ENABLED_MODULES: z.string().default('*'),
  // [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13: BIZCITY_DEV_MODULES — máy dev bỏ kiểm hash module (cấm ở bản thật)
  /**
   * Máy dev: nạp module dù hash thư mục lệch registry (sửa mã khi dev). Bản thật (NODE_ENV=production) cấm — dừng khởi động.
   * Ngoài bản thật, hash lệch vốn chỉ cảnh báo; biến này chủ yếu để chạy bản dựng production trên máy dev.
   */
  BIZCITY_DEV_MODULES: z.enum(['true', 'false', '']).default('').transform((v) => v === 'true'),
  // [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1: thư mục module SDK (mặc định <gốc repo>/modules)
  /** Thư mục chứa module viết bằng @bizcity/module-sdk (mỗi module một thư mục <key>/ có bizcity.module.json). Mặc định <gốc repo>/modules. */
  BIZCITY_MODULES_DIR: z.string().optional(),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().default('postgres://ketoan:ketoan@localhost:5434/ketoan'),
  /** Chuyển sang vai trò này sau khi kết nối (SET ROLE) — chạy test / CI dưới vai trò không superuser để RLS có hiệu lực (PHASE-007). Bản thật: kết nối thẳng bằng DB_APP_USER. */
  DB_SET_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/, 'Tên vai trò CSDL không hợp lệ').optional(),
  /** Khoá ký phiên đăng nhập. Bắt buộc đổi ở môi trường thật. */
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please-32chars'),
  JWT_TTL_HOURS: z.coerce.number().int().positive().default(12),
  /** Danh sách nguồn được gọi API từ trình duyệt, phân cách bằng dấu phẩy. */
  CORS_ORIGINS: z.string().default('http://localhost:4180'),
  /** Danh sách add-in bật, phân cách bằng dấu phẩy. "*" = tất cả add-in có sẵn. */
  ADDINS: z.string().default('*'),
  /**
   * Loại sổ của bản cài này: internal = sổ nội bộ (mặc định, nhận mọi chứng từ); tax = sổ thuế — chỉ kéo phiếu bán / hoàn
   * có số hoá đơn điện tử, cổng chờ nguồn giữ nhật ký gửi riêng (consumer=tax) để không lấy mất chứng từ của sổ nội bộ.
   */
  BOOK_MODE: z.enum(['internal', 'tax']).default('internal'),
  /** Nhãn môi trường hiện thành dải trên đầu giao diện (vd. "BẢN TEST") để không nhầm với bản thật. Trống = không hiện. */
  ENV_LABEL: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** GET /metrics (Prometheus, docs/ops/OBSERVABILITY.md §3): đặt thì phải gửi Authorization: Bearer <token>. Trống = mở trong mạng nội bộ (nginx không chuyển /metrics ra ngoài). */
  METRICS_TOKEN: z.string().default(''),
  // [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
  /**
   * Trace OpenTelemetry (ADR-0010, core/tracing.ts). Trống = vẫn sinh traceId cho log / phản hồi lỗi / bằng chứng, KHÔNG gửi đi đâu.
   * Đặt (vd http://otel-collector:4318) = gửi OTLP/HTTP tới Collector (đường /v1/traces tự thêm). Tên biến theo chuẩn OpenTelemetry.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''),
  /** 'true' = tắt hẳn SDK (API no-op): không traceId, không span. */
  OTEL_SDK_DISABLED: z.enum(['true', 'false', '']).default(''),
  OTEL_SERVICE_NAME: z.string().default('bizcity-core-api'),
  // [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: nguồn của Bàn điều tra (API trung gian chỉ đọc) + chế độ Vận hành + trang báo lỗi
  /**
   * Bàn điều tra cho nhà phát triển (PHASE-019, modules/system/devtools/). Địa chỉ NỘI BỘ mà API gọi tới — trình duyệt không bao giờ
   * gọi thẳng (N1). Trống = nguồn đó "chưa bật": màn cần nó báo chưa bật, phần đọc CSDL vẫn chạy. Bộ giám sát đặt sẵn tên dịch vụ.
   */
  DEVTOOLS_TEMPO_URL: z.string().default(''),
  DEVTOOLS_LOKI_URL: z.string().default(''),
  /** Chỉ chế độ Vận hành (W5). */
  DEVTOOLS_PROMETHEUS_URL: z.string().default(''),
  DEVTOOLS_ALERTMANAGER_URL: z.string().default(''),
  /** Địa chỉ Grafana người vận hành mở được (vd http://127.0.0.1:3000) — chỉ để dựng link sâu ở chế độ Vận hành; API không gọi Grafana. */
  DEVTOOLS_GRAFANA_URL: z.string().default(''),
  /**
   * Chế độ Vận hành của Bàn điều tra (Q019-2): 'true' + người dùng là chủ đơn vị + bản cài có ĐÚNG MỘT đơn vị. Bản cài nhiều đơn vị
   * thì bỏ qua (kể cả môi trường thử) — chờ vai trò vận hành liên đơn vị (Q018-6).
   */
  DEVTOOLS_OPS: z.enum(['true', 'false', '']).default(''),
  /** Trang báo lỗi của bản cài (vd https://github.com/<tổ chức>/<repo>/issues/new?template=bao-loi.yml). Có thì khay Mã tra cứu thêm nút mở (Q019-5). */
  BUG_REPORT_URL: z.string().default(''),
  /**
   * Đăng nhập bằng tài khoản hệ thống quản trị (WordPress multisite): khoá chung ký vé đăng nhập (giống hệt bên hệ thống
   * quản trị). Trống = tắt. WP_SSO_TENANT: mã đơn vị nhận người dùng (trống + chỉ có một đơn vị thì dùng đơn vị đó).
   */
  WP_SSO_SECRET: z.string().default(''),
  WP_SSO_TENANT: z.string().default(''),
  /**
   * Địa chỉ cấp vé của hệ thống quản trị (…/wp-admin/admin-post.php?action=tgs_acc_sso_go). Có thì mở thẳng phần mềm
   * kế toán mà chưa đăng nhập sẽ tự chuyển sang đó (đang đăng nhập bên quản trị là vào luôn). Trống = không tự chuyển.
   */
  WP_SSO_LOGIN_URL: z.string().default(''),
  /**
   * KHÔNG DÙNG NỮA (23/10/2026: phần mềm kế toán chạy độc lập, không nhúng vào trang quản trị). Giữ khai báo để .env cũ
   * còn dòng này không lỗi.
   */
  WP_EMBED_URL: z.string().default(''),
  /**
   * Địa chỉ trang quản trị bán hàng (…/wp-admin/). Dùng mở PHIẾU GỐC ở tab mới (vd phiếu nhập kho từ sổ / báo cáo).
   * Trống = suy từ WP_SSO_LOGIN_URL (bỏ đoạn admin-post.php…).
   */
  WP_ADMIN_URL: z.string().default(''),
  /**
   * Tra cứu doanh nghiệp theo mã số thuế (nút "Lấy thông tin" ở form nhà cung cấp / khách hàng): khoá API doanhnghiep.vn
   * (xin cấp qua email / Zalo nhà cung cấp dịch vụ; gói miễn phí 1.000 lượt / tháng). Trống = dùng nguồn công khai VietQR (dữ liệu
   * Cục Thuế: tên, địa chỉ, trạng thái). TAX_LOOKUP=off: tắt hẳn tra cứu (không gửi MST ra ngoài).
   */
  DOANHNGHIEP_API_KEY: z.string().default(''),
  TAX_LOOKUP: z.enum(['on', 'off']).default('on'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Cấu hình môi trường không hợp lệ:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('dev-secret')) {
    console.error('JWT_SECRET đang dùng giá trị mặc định. Hãy đặt khoá riêng ở môi trường thật.');
    process.exit(1);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.BIZCITY_DEV_MODULES) {
    console.error('BIZCITY_DEV_MODULES=true bị cấm ở bản thật: API phải chỉ nạp module đúng hash trong registry (ADR-0011 D2).');
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
