/**
 * Tiện ích kiểm thử: dựng app, tạo đơn vị riêng cho mỗi lần chạy, gọi API; kiểm bất biến sổ sau mỗi tệp test (test/setup.ts).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { env } from '../src/config/env.js';
import type { Database } from '../src/db/types.js';
import { registerDiagnostics, runDiagnostics } from '../src/modules/system/diagnostics.js';
import { LEDGER_DIAGNOSTICS } from '../src/modules/ledger/ledger.diagnostics.js';

export interface TestCtx {
  app: FastifyInstance;
  token: string;
  apiKey: string;
  tenantCode: string;
}

/** Đơn vị do tệp test đang chạy tạo bằng setupTenant — afterAll chung (test/setup.ts) kiểm sổ của từng đơn vị. */
export const createdTenants: string[] = [];

/**
 * Bất biến sổ (PHASES 2.2, R-QG-5): mọi kiểm mức error của tự chẩn đoán L3 (Nợ = Có, số dư ngày khớp dòng, đảo đúng một lần,
 * không bút toán mồ côi, posted_version) phải đạt trên các đơn vị test. Cùng bộ kiểm với GET /api/v1/system/diagnostics.
 * Dùng kết nối riêng (tự đóng): tệp test thường đã closeDb() trong afterAll của mình trước khi afterAll chung chạy.
 */
export async function assertLedgerInvariants(tenantCodes: readonly string[] = createdTenants): Promise<void> {
  if (!tenantCodes.length) return;
  registerDiagnostics(LEDGER_DIAGNOSTICS);
  const conn = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 }) }) });
  try {
    const bad: string[] = [];
    for (const t of await conn.selectFrom('tenants').select(['id', 'code']).where('code', 'in', [...tenantCodes]).execute()) {
      const r = await runDiagnostics({ tenantId: t.id }, { layer: 'L3', db: conn });
      for (const c of r.checks.filter((x) => x.level === 'error')) bad.push(`${t.code} ${c.code} ×${c.count} (${c.sample.slice(0, 5).join(', ')})`);
    }
    if (bad.length) throw new Error(`Sổ của đơn vị test sai bất biến: ${bad.join('; ')}`);
  } finally {
    await conn.destroy();
  }
}

export async function setupTenant(): Promise<TestCtx> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const tenantCode = `t${suffix}`;
  createdTenants.push(tenantCode);
  const apiKey = `kt_test_${suffix}_key`;
  process.env.SEED_TENANT_CODE = tenantCode;
  process.env.SEED_TENANT_NAME = `Đơn vị kiểm thử ${suffix}`;
  process.env.SEED_ADMIN_EMAIL = 'tester@ketoan.local';
  process.env.SEED_ADMIN_PASSWORD = 'Test@123';
  process.env.SEED_API_KEY = apiKey;
  const log = console.log;
  console.log = () => {}; // seed in nhiều dòng; tắt cho gọn
  try {
    await runMigrations(() => {});
    await seed();
  } finally {
    console.log = log;
  }
  const app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode, email: 'tester@ketoan.local', password: 'Test@123' } });
  const token = res.json().data.token as string;
  // Mặc định chứng từ chờ định khoản ở trạm ACC14; phép thử cần ghi sổ ngay để kiểm định khoản → bật "định khoản ngay"
  // cho mọi loại (phép thử chế độ chờ đặt lại riêng).
  const auto = Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, 'auto']));
  await app.inject({ method: 'PUT', url: '/api/v1/settings/posting-modes', payload: auto, headers: { authorization: `Bearer ${token}` } });
  return { app, token, apiKey, tenantCode };
}

/** Gọi API bằng token người dùng; trả về JSON. */
export async function call<T = any>(ctx: TestCtx, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  // Lệnh ghi tự gắn Idempotency-Key mới mỗi lần, như giao diện (action 'required' — bizcity_action@1 §8); phép thử gửi lặp tự truyền khoá.
  const idem = method === 'GET' ? {} : { 'idempotency-key': `test-${randomUUID()}` };
  const res = await ctx.app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${ctx.token}`, ...idem, ...headers } });
  return { status: res.statusCode, body: res.json() as T };
}

/** Chứng từ bán hàng mẫu: 2 dòng (1 dòng 8%, 1 dòng hàng tặng 0đ), thu tiền mặt. */
export function saleDoc(over: Record<string, unknown> = {}) {
  return {
    docType: 'sale',
    docKey: 'pos:CN01:HD0001',
    version: 1,
    branchCode: 'CN01',
    docNo: 'HD0001',
    docDate: '2026-10-05',
    partner: { code: '0912345678', name: 'Nguyễn Văn A' },
    invoice: { no: '0000123', serial: 'C26TAA', form: '1', date: '2026-10-05' },
    lines: [
      { lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 185185, taxCode: 'R08', taxAmount: 14815 },
      { lineKey: 'l2', sku: 'QUA01', name: 'Quà tặng', unit: 'Cái', qty: 1, amountBeforeTax: 0, taxCode: 'R08', taxAmount: 0, isGift: true },
    ],
    payments: [{ methodCode: 'TM', amount: 200000 }],
    totals: { beforeTax: 185185, tax: 14815, total: 200000 },
    ...over,
  };
}
