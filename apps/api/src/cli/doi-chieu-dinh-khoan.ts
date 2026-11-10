// [2026-11-10 10:30 PM Nguyễn Văn Thủy] PHASE-026 — đối chiếu định khoản trước / sau khi đổi bộ định khoản (bỏ lý do hạch toán) (đóng góp)
/**
 * ĐỐI CHIẾU ĐỊNH KHOẢN — định khoản lại MỌI chứng từ đã ghi sổ bằng bộ định khoản hiện tại, trong giao dịch thử (luôn huỷ, không ghi
 * gì), so với bút toán đang có hiệu lực. Bút toán dựng lại trùng dấu vân tay thì lõi giữ nguyên (kept); khác thì phải đảo / ghi lại
 * (reversed). Chứng từ nào phải đảo là chứng từ đổi sổ.
 *
 *   npx tsx --conditions=development src/cli/doi-chieu-dinh-khoan.ts [mã đơn vị] [giới hạn]
 *
 * Không đối chiếu phiếu giá vốn tháng (chạy lại Tính giá vốn để xem).
 */
import { sql } from 'kysely';
import { db } from '../db/client.js';
import { postDocumentIn } from '../kernel/public.js';
import type { AuthContext } from '../core/auth.js';
import { ingestDocumentSchema, type IngestDocument } from '@ketoan/contracts';

class Rollback extends Error {}

async function main() {
  const tenantCode = process.argv[2] ?? 'tgs';
  const limit = Number(process.argv[3] ?? 100000);
  const t = (await sql<{ id: string }>`SELECT id::text FROM tenants WHERE code = ${tenantCode}`.execute(db)).rows[0];
  if (!t) throw new Error(`Không có đơn vị ${tenantCode}`);
  const auth = { tenantId: t.id, actor: 'doi-chieu', actorName: 'Đối chiếu định khoản', kind: 'user', role: 'admin', roles: ['admin'], permissions: new Set() } as unknown as AuthContext;
  const events = (await sql<{ doc_key: string; doc_type: string; doc_no: string; version: number; payload: IngestDocument }>`
    SELECT doc_key, doc_type, doc_no, version, payload FROM accounting_events
     WHERE tenant_id = ${t.id} AND status = 'posted' AND doc_type IN ('sale', 'sale_return', 'purchase', 'purchase_return', 'transfer', 'stock_adjustment', 'cash_transfer', 'customer_payment', 'supplier_payment', 'manual_journal') ORDER BY id LIMIT ${limit}`.execute(db)).rows;
  let same = 0;
  const changed: string[] = [];
  const failed: string[] = [];
  for (const e of events) {
    try {
      await db.transaction().execute(async (trx) => {
        const doc = ingestDocumentSchema.parse({ ...e.payload, version: e.version + 1 }) as IngestDocument;
        const r = await postDocumentIn(trx, auth, doc, { post: true, force: true });
        const res = r as unknown as { reversed?: number; entryIds?: string[]; status: string };
        if ((res.reversed ?? 0) > 0) changed.push(`${e.doc_type} ${e.doc_no} (${e.doc_key}): đảo ${res.reversed} bút toán, ghi ${res.entryIds?.length ?? 0}`);
        else same++;
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) failed.push(`${e.doc_type} ${e.doc_no} (${e.doc_key}): ${(err as Error).message.split(/\r?\n/)[0]!.slice(0, 200)}`);
    }
  }
  console.log(`Đơn vị ${tenantCode}: ${events.length} chứng từ — giữ nguyên ${same}, đổi sổ ${changed.length}, lỗi ${failed.length}`);
  for (const c of changed.slice(0, 50)) console.log('  ĐỔI  ', c);
  for (const f of failed.slice(0, 50)) console.log('  LỖI  ', f);
  await db.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
