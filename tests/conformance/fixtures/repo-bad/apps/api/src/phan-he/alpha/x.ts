// @bizcity-layer D modules/alpha
// Mỗi dòng dưới cài một vi phạm (xem ../../../../../../expect.json).
import { y } from '../beta/y.js';                                   // SC-MOD-1: import phân hệ khác
import { appendFile } from 'node:fs/promises';
import { LEDGER_DIAGNOSTICS } from '../../modules/ledger/ledger.diagnostics.js'; // SC-KERNEL-6: vào thẳng bên trong Kernel
import { postDocumentIn } from '../../kernel/public.js';                       // KHÔNG tính: cổng công khai của Kernel

export async function routes(r: any, db: any, ledgerService: any, reply: any, z: any) {
  r.get('/api/v1/alpha', { handler: async () => [y, LEDGER_DIAGNOSTICS, postDocumentIn] });                // SC-API-3: không requirePermission
  r.post('/api/v1/alpha', { preHandler: requirePermission('documents:write'), handler: async () => 1 });
  r.post('/api/v1/alpha/me', { preHandler: requireUser(), handler: async () => 2 }); // KHÔNG tính: route tự phục vụ khai requireUser()
  await db.insertInto('ledger_lines').values({}).execute();          // SC-KERNEL-1, SC-MOD-2 (bảng nhân)
  await db.updateTable('branches').set({}).execute();                // SC-MOD-2 (bảng lõi)
  await ledgerService.post(db, {});                                  // SC-KERNEL-3
  reply.status(400).send({});                                        // SC-API-1
  z.object({ all: z.coerce.boolean() });                             // SC-API-2
  setInterval(() => {}, 1000);                                       // SC-EVT-1
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000); // KHÔNG tính: hạn giờ lời gọi
  await new Promise((ok) => setTimeout(ok, 1500));                   // KHÔNG tính: chờ thử lại
  await appendFile('nhat-ky.jsonl', '{}');                           // SC-EVD-1
  await db.selectFrom('ledger_entries').selectAll().execute();      // SC-KERNEL-7: đọc thẳng bảng sổ
  await db.raw(`SELECT SUM(debit)
                  FROM ledger_balances_daily`);                     // SC-KERNEL-7: câu SQL xuống dòng
  await db.raw('SELECT 1 FROM bizcity_read.ledger_lines');           // KHÔNG tính: khung nhìn chỉ đọc của Kernel
}
declare function requirePermission(p: string): unknown;
declare function requireUser(): unknown;
