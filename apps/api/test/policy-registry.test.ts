// [2026-11-07 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W1 (S031-4): sổ đăng ký chính sách — bất biến bản đã phát hành (T031-REG-1), mỗi ngày đúng một bản (T031-TR-2)
/**
 * Sổ đăng ký chính sách (ADR-0031, migration 0079, packages/platform/src/core/policies.ts):
 *   - bản 1 hiệu lực từ đầu; bản sau đóng bản trước ở ngày trước ngày áp, không khoảng trống, không chồng;
 *   - sửa nhiều lần cùng ngày được (bản trước thành khoảng rỗng); ngày áp sớm hơn bản trước bị từ chối;
 *   - bản đã phát hành không sửa nội dung, không xoá; chỉ ngừng (published → retired) và đóng hiệu lực một lần.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { listPolicyVersions, registerPolicyVersion, resolvePolicy, retirePolicy } from '@bizcity/platform/core/policies';
import { db } from '../src/db/client.js';
import { setupTenant } from './helpers.js';

let tenantId: string;
const POL = 'he-thong:inline:QC-TC-01';
const reg = (version: number, effectiveFrom: string | null, content: unknown) => db.transaction().execute((trx) => registerPolicyVersion(trx, {
  tenantId, ownerModule: 'he-thong', policyKey: 'QC-TC-01', policyId: POL, version, ruleContract: 'custom.quy_che@1',
  effectiveFrom, store: 'inline', content, actor: 'user:test', reason: `bản ${version}`,
}));

beforeAll(async () => {
  const t = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id);
});

describe('Sổ đăng ký chính sách: bản theo ngày chứng từ', () => {
  it('bản 1 từ đầu, bản 2 từ 16/11 đóng bản 1 ở 15/11; mọi ngày đúng một bản (T031-TR-2)', async () => {
    await reg(1, null, { nguong: 50_000_000 });
    await reg(2, '2026-11-16', { nguong: 80_000_000 });
    const vs = await listPolicyVersions(db, tenantId, POL);
    expect(vs.map((v) => [v.version, v.effectiveFrom, v.effectiveTo])).toEqual([[1, null, '2026-11-15'], [2, '2026-11-16', null]]);
    for (const [at, want] of [['2020-01-01', 1], ['2026-11-15', 1], ['2026-11-16', 2], ['2030-12-31', 2]] as const) {
      expect((await resolvePolicy(db, tenantId, POL, at))?.version, at).toBe(want);
      const n = await sql<{ n: string }>`SELECT count(*) AS n FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${POL}
        AND (effective_from IS NULL OR effective_from <= ${at}::date) AND (effective_to IS NULL OR effective_to >= ${at}::date)`.execute(db);
      expect(Number(n.rows[0]!.n), `số bản phủ ${at}`).toBe(1);
    }
  });

  it('sửa lần nữa cùng ngày áp: bản 2 thành khoảng rỗng, ngày 16/11 chọn bản 3', async () => {
    await reg(3, '2026-11-16', { nguong: 90_000_000 });
    expect((await resolvePolicy(db, tenantId, POL, '2026-11-16'))?.version).toBe(3);
    expect((await listPolicyVersions(db, tenantId, POL))[1]).toMatchObject({ version: 2, effectiveFrom: '2026-11-16', effectiveTo: '2026-11-15' });
  });

  it('ngày áp sớm hơn bản trước, bản không nối tiếp, bản sau thiếu ngày áp → từ chối, không ghi gì', async () => {
    await expect(reg(4, '2026-11-10', {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(reg(6, '2026-12-01', {})).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(reg(4, null, {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await listPolicyVersions(db, tenantId, POL)).length).toBe(3);
  });

  it('băm nội dung lưu ở phong bì; inline giữ nội dung', async () => {
    const r = await sql<{ content: unknown; content_hash: string }>`SELECT content, content_hash FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${POL} AND version = 3`.execute(db);
    expect(r.rows[0]!.content).toEqual({ nguong: 90_000_000 });
    expect(r.rows[0]!.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Bản đã phát hành bất biến (T031-REG-1)', () => {
  const tryRun = (q: ReturnType<typeof sql>) => q.execute(db).then(() => 'ok', (e: Error) => e.message);
  it('sửa nội dung / xoá / mở lại hiệu lực đã đóng → trigger chặn', async () => {
    expect(await tryRun(sql`UPDATE policy_registry SET content_hash = repeat('0', 64) WHERE tenant_id = ${tenantId} AND policy_id = ${POL} AND version = 3`)).toMatch(/không sửa/);
    expect(await tryRun(sql`UPDATE policy_registry SET scope = '{"x":1}' WHERE tenant_id = ${tenantId} AND policy_id = ${POL} AND version = 1`)).toMatch(/không sửa/);
    expect(await tryRun(sql`DELETE FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${POL}`)).toMatch(/không xoá/);
    expect(await tryRun(sql`UPDATE policy_registry SET effective_to = '2027-01-01' WHERE tenant_id = ${tenantId} AND policy_id = ${POL} AND version = 1`)).toMatch(/đã đóng/);
  });

  it('ngừng: published → retired; ngừng rồi không quay lại published; bản cũ vẫn tra được theo ngày', async () => {
    expect(await db.transaction().execute((trx) => retirePolicy(trx, tenantId, POL))).toBe(3);
    expect((await listPolicyVersions(db, tenantId, POL)).every((v) => v.status === 'retired')).toBe(true);
    expect(await tryRun(sql`UPDATE policy_registry SET status = 'published' WHERE tenant_id = ${tenantId} AND policy_id = ${POL} AND version = 3`)).toMatch(/published → retired/);
    expect((await resolvePolicy(db, tenantId, POL, '2026-11-01'))?.version).toBe(1);
  });
});
