/**
 * Voucher (phiếu NT-BH-026) — đọc / ghi bảng của module (mod_voucher.campaigns / codes / code_log) và danh mục chuẩn (bizcity_read.*).
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị, không tự thêm WHERE tenant_id). Mọi truy cập CSDL của module gom ở tệp này.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: truy cập CSDL module voucher (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import {
  campaignProblems, displayStatus, expiryOf, normalizeCode, normalizePhone, randomCode,
  type Campaign, type CampaignInput, type CartLine, type CodeRow, type CodeStatus,
} from './domain/voucher.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Khoá theo mã voucher trong giao dịch — cùng khoá module pos / phieu-ban lấy khi dùng mã (hashtext('voucher:'||mã)). */
export const lockCode = async (tx: Tx, code: string) => { await sql`SELECT pg_advisory_xact_lock(hashtext(${`voucher:${code}`}))`.execute(tx); };

type CampaignDb = {
  campaign_id: string; code: string; name: string; kind: Campaign['kind']; issuer: Campaign['issuer']; issuer_partner_code: string | null; payment_method_code: string | null;
  face_value: string; min_order: string; valid_from: string; valid_to: string | null; valid_days: number | null; item_ids: string[]; brand_codes: string[];
  issue_mode: Campaign['issueMode']; auto_rule: { itemIds?: string[]; brandCodes?: string[]; minQty?: number; branches?: string[] } | null; status: Campaign['status'];
  note: string | null; created_by_name: string | null; created_at: Date; updated_at: Date;
};
const CAMPAIGN_COLS = sql`campaign_id::text AS campaign_id, code, name, kind, issuer, issuer_partner_code, payment_method_code, face_value, min_order,
  valid_from::text AS valid_from, valid_to::text AS valid_to, valid_days, item_ids, brand_codes, issue_mode, auto_rule, status, note, created_by_name, created_at, updated_at`;

const toCampaign = (r: CampaignDb): Campaign & { note: string | null; createdByName: string | null; createdAt: string; updatedAt: string } => ({
  id: r.campaign_id, code: r.code, name: r.name, kind: r.kind, issuer: r.issuer, issuerPartnerCode: r.issuer_partner_code, paymentMethodCode: r.payment_method_code,
  faceValue: Number(r.face_value), minOrder: Number(r.min_order), validFrom: r.valid_from, validTo: r.valid_to, validDays: r.valid_days,
  itemIds: r.item_ids ?? [], brandCodes: r.brand_codes ?? [], issueMode: r.issue_mode,
  autoRule: r.auto_rule ? { itemIds: r.auto_rule.itemIds ?? [], brandCodes: r.auto_rule.brandCodes ?? [], minQty: Number(r.auto_rule.minQty ?? 1), branches: r.auto_rule.branches ?? [] } : null,
  status: r.status, note: r.note, createdByName: r.created_by_name, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

/** item_id ↔ mã hàng hiện tại (danh mục). */
async function skusToItems(tx: Tx, skus: readonly string[]): Promise<{ ids: string[]; missing: string[] }> {
  const list = [...new Set(skus)];
  if (!list.length) return { ids: [], missing: [] };
  const rows = (await sql<{ sku: string; item_id: string | null }>`SELECT sku, item_id::text AS item_id FROM bizcity_read.products WHERE sku IN (${sql.join(list)})`.execute(tx)).rows;
  const by = new Map(rows.map((r) => [r.sku, r.item_id]));
  return { ids: list.map((s) => by.get(s)).filter((x): x is string => Boolean(x)), missing: list.filter((s) => !by.get(s)) };
}
export async function itemsToSkus(tx: Tx, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  return (await sql<{ sku: string }>`SELECT sku FROM bizcity_read.products WHERE item_id::text IN (${sql.join([...ids])}) ORDER BY sku`.execute(tx)).rows.map((r) => r.sku);
}

/** Đợt phát cho màn: kèm mã hàng hiện tại của item_id đã lưu, số mã theo trạng thái. */
export async function campaignView(tx: Tx, c: ReturnType<typeof toCampaign>, today: string) {
  const stats = (await sql<{ status: CodeStatus; expired: boolean; n: string }>`
    SELECT status, (status = 'active' AND expires_on IS NOT NULL AND expires_on < ${today}) AS expired, count(*) AS n
      FROM mod_voucher.codes WHERE campaign_id = ${c.id} GROUP BY 1, 2`.execute(tx)).rows;
  const n = (f: (r: { status: CodeStatus; expired: boolean }) => boolean) => stats.filter(f).reduce((t, r) => t + Number(r.n), 0);
  return {
    ...c, skus: await itemsToSkus(tx, c.itemIds),
    autoRule: c.autoRule ? { ...c.autoRule, skus: await itemsToSkus(tx, c.autoRule.itemIds) } : null,
    counts: { issued: n(() => true), active: n((r) => r.status === 'active' && !r.expired), used: n((r) => r.status === 'used'), expired: n((r) => r.expired), revoked: n((r) => r.status === 'revoked') },
  };
}

export async function listCampaigns(tx: Tx, f: { q?: string; status?: string; issuer?: string }) {
  const rows = (await sql<CampaignDb>`SELECT ${CAMPAIGN_COLS} FROM mod_voucher.campaigns
     WHERE true ${f.status ? sql`AND status = ${f.status}` : sql``} ${f.issuer ? sql`AND issuer = ${f.issuer}` : sql``}
       ${f.q ? sql`AND (code ILIKE ${`%${f.q}%`} OR name ILIKE ${`%${f.q}%`})` : sql``}
     ORDER BY created_at DESC LIMIT 500`.execute(tx)).rows;
  return rows.map(toCampaign);
}

export async function getCampaign(tx: Tx, id: string, lock = false) {
  const r = (await sql<CampaignDb>`SELECT ${CAMPAIGN_COLS} FROM mod_voucher.campaigns WHERE campaign_id::text = ${id} ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`đợt phát voucher ${id}`);
  return toCampaign(r);
}

export async function campaignsByIds(tx: Tx, ids: readonly string[]) {
  if (!ids.length) return new Map<string, Campaign>();
  const rows = (await sql<CampaignDb>`SELECT ${CAMPAIGN_COLS} FROM mod_voucher.campaigns WHERE campaign_id::text IN (${sql.join([...new Set(ids)])})`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.campaign_id, toCampaign(r)]));
}

export async function autoCampaigns(tx: Tx) {
  return (await sql<CampaignDb>`SELECT ${CAMPAIGN_COLS} FROM mod_voucher.campaigns WHERE issue_mode = 'auto' AND status = 'active'`.execute(tx)).rows.map(toCampaign);
}

/** Kiểm + lưu đợt phát (thêm / sửa). Đã có mã: không đổi loại, người phát, mệnh giá, phạm vi (ECP-13) — chỉ tên, hạn, ghi chú, điều kiện tự phát, trạng thái. */
export async function saveCampaign(tx: Tx, ctx: ActionContext, input: CampaignInput, id?: string, status?: 'active' | 'stopped') {
  const problems = campaignProblems(input);
  if (input.issuer === 'brand' && input.paymentMethodCode) {
    const m = (await sql<{ code: string }>`SELECT code FROM bizcity_read.payment_methods WHERE code = ${input.paymentMethodCode} AND is_active IS NOT FALSE`.execute(tx)).rows[0];
    if (!m) problems.push(`Hình thức thanh toán ${input.paymentMethodCode} không có / ngừng dùng — kế toán khai ở Danh mục hình thức thanh toán`);
  }
  if (input.issuer === 'brand' && input.issuerPartnerCode) {
    const p = (await sql<{ code: string }>`SELECT code FROM bizcity_read.partners WHERE code = ${input.issuerPartnerCode}`.execute(tx)).rows[0];
    if (!p) problems.push(`Hãng / NCC ${input.issuerPartnerCode} không có trong danh mục đối tượng`);
  }
  const items = await skusToItems(tx, input.skus);
  const autoItems = await skusToItems(tx, input.autoRule?.skus ?? []);
  const missing = [...items.missing, ...autoItems.missing];
  if (missing.length) problems.push(`Mã hàng không có trong danh mục: ${[...new Set(missing)].join(', ')}`);
  if (problems.length) throw Errors.validation(problems.join(' · '), { items: problems });
  const autoRule = input.issueMode === 'auto' && input.autoRule
    ? { itemIds: autoItems.ids, brandCodes: input.autoRule.brandCodes, minQty: input.autoRule.minQty, branches: input.autoRule.branches } : null;
  const v = {
    code: input.code.toUpperCase(), name: input.name, kind: input.kind, issuer: input.issuer,
    partner: input.issuer === 'brand' ? input.issuerPartnerCode ?? null : null, method: input.issuer === 'brand' ? input.paymentMethodCode ?? null : null,
    itemIds: JSON.stringify(items.ids), brands: JSON.stringify(input.brandCodes), auto: autoRule ? JSON.stringify(autoRule) : null,
  };
  if (!id) {
    const dup = (await sql<{ n: number }>`SELECT 1 AS n FROM mod_voucher.campaigns WHERE code = ${v.code}`.execute(tx)).rows.length;
    if (dup) throw Errors.conflict(`Mã đợt ${v.code} đã có`, { reason: 'VOUCHER_CAMPAIGN_STATE', status: 'exists' });
    const newId = randomUUID();
    await sql`INSERT INTO mod_voucher.campaigns (campaign_id, tenant_id, code, name, kind, issuer, issuer_partner_code, payment_method_code, face_value, min_order,
        valid_from, valid_to, valid_days, item_ids, brand_codes, issue_mode, auto_rule, note, created_by, created_by_name, updated_by)
      VALUES (${newId}, ${ctx.tenant.id}, ${v.code}, ${v.name}, ${v.kind}, ${v.issuer}, ${v.partner}, ${v.method}, ${input.faceValue}, ${input.minOrder},
        ${input.validFrom}, ${input.validTo ?? null}, ${input.validDays ?? null}, ${v.itemIds}::jsonb, ${v.brands}::jsonb, ${input.issueMode}, ${v.auto}::jsonb,
        ${input.note ?? null}, ${ctx.actor.id}, ${ctx.actor.name || null}, ${ctx.actor.id})`.execute(tx);
    return getCampaign(tx, newId);
  }
  const cur = await getCampaign(tx, id, true);
  const used = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM mod_voucher.codes WHERE campaign_id = ${id}::uuid`.execute(tx)).rows[0]!.n);
  if (used > 0) {
    const locked = cur.kind !== v.kind || cur.issuer !== v.issuer || cur.faceValue !== input.faceValue || cur.code !== v.code || cur.issuerPartnerCode !== v.partner
      || cur.paymentMethodCode !== v.method || cur.minOrder !== input.minOrder || JSON.stringify(cur.itemIds) !== v.itemIds || JSON.stringify(cur.brandCodes) !== v.brands;
    if (locked) {
      throw Errors.conflict(`Đợt ${cur.code} đã phát ${used} mã — không đổi mã đợt, loại, người phát, mệnh giá, đơn tối thiểu, phạm vi (lập đợt mới); chỉ sửa tên, hạn, ghi chú, điều kiện tự phát, ngừng / mở lại`,
        { reason: 'VOUCHER_CAMPAIGN_STATE', status: 'issued' });
    }
  }
  await sql`UPDATE mod_voucher.campaigns SET code = ${v.code}, name = ${v.name}, kind = ${v.kind}, issuer = ${v.issuer}, issuer_partner_code = ${v.partner},
      payment_method_code = ${v.method}, face_value = ${input.faceValue}, min_order = ${input.minOrder}, valid_from = ${input.validFrom}, valid_to = ${input.validTo ?? null},
      valid_days = ${input.validDays ?? null}, item_ids = ${v.itemIds}::jsonb, brand_codes = ${v.brands}::jsonb, issue_mode = ${input.issueMode}, auto_rule = ${v.auto}::jsonb,
      note = ${input.note ?? null}, status = ${status ?? cur.status}, updated_by = ${ctx.actor.id}, updated_at = now()
    WHERE campaign_id = ${id}::uuid`.execute(tx);
  return getCampaign(tx, id);
}

// ── Mã ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type CodeDb = {
  code: string; campaign_id: string; phone: string; partner_code: string | null; status: CodeStatus; source: string; expires_on: string | null; issued_at: Date;
  issued_order_id: string | null; issued_order_code: string | null; issued_branch: string | null; used_source: string | null; used_ref_id: string | null;
  used_ref_code: string | null; used_branch: string | null; used_on: string | null; used_amount: string | null; used_at: Date | null; revoked_at: Date | null; revoke_reason: string | null;
};
const CODE_COLS = sql`code, campaign_id::text AS campaign_id, phone, partner_code, status, source, expires_on::text AS expires_on, issued_at, issued_order_id, issued_order_code,
  issued_branch, used_source, used_ref_id, used_ref_code, used_branch, used_on::text AS used_on, used_amount, used_at, revoked_at, revoke_reason`;
const toCode = (r: CodeDb): CodeRow & { source: string; issuedAt: string; issuedOrderCode: string | null; issuedBranch: string | null; usedAmount: number | null; usedAt: string | null; revokedAt: string | null } => ({
  code: r.code, campaignId: r.campaign_id, phone: r.phone, partnerCode: r.partner_code, status: r.status, expiresOn: r.expires_on, usedSource: r.used_source,
  usedRefId: r.used_ref_id, usedRefCode: r.used_ref_code, usedBranch: r.used_branch, usedOn: r.used_on, revokeReason: r.revoke_reason, source: r.source,
  issuedAt: r.issued_at.toISOString(), issuedOrderCode: r.issued_order_code, issuedBranch: r.issued_branch, usedAmount: r.used_amount === null ? null : Number(r.used_amount),
  usedAt: r.used_at ? r.used_at.toISOString() : null, revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
});
export type CodeView = ReturnType<typeof toCode>;

export async function codesByCode(tx: Tx, codes: readonly string[]) {
  if (!codes.length) return new Map<string, CodeView>();
  const rows = (await sql<CodeDb>`SELECT ${CODE_COLS} FROM mod_voucher.codes WHERE code IN (${sql.join([...new Set(codes)])})`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.code, toCode(r)]));
}

export async function listCodes(tx: Tx, f: { campaignId?: string; phone?: string; status?: string; q?: string; today: string; limit: number }) {
  const st = f.status;
  const rows = (await sql<CodeDb>`SELECT ${CODE_COLS} FROM mod_voucher.codes
     WHERE true ${f.campaignId ? sql`AND campaign_id::text = ${f.campaignId}` : sql``} ${f.phone ? sql`AND phone = ${f.phone}` : sql``}
       ${f.q ? sql`AND code ILIKE ${`%${f.q.trim()}%`}` : sql``}
       ${st === 'expired' ? sql`AND status = 'active' AND expires_on < ${f.today}` : st === 'active' ? sql`AND status = 'active' AND (expires_on IS NULL OR expires_on >= ${f.today})` : st ? sql`AND status = ${st}` : sql``}
     ORDER BY issued_at DESC, code LIMIT ${f.limit}`.execute(tx)).rows;
  return rows.map(toCode);
}

export async function logOf(tx: Tx, code: string) {
  return (await sql<{ action: string; ref_source: string | null; ref_id: string | null; ref_code: string | null; branch_code: string | null; amount: string | null; note: string | null; actor: string; at: Date }>`
    SELECT action, ref_source, ref_id, ref_code, branch_code, amount, note, actor, at FROM mod_voucher.code_log WHERE code = ${code} ORDER BY at, id`.execute(tx)).rows
    .map((r) => ({ action: r.action, source: r.ref_source, refId: r.ref_id, refCode: r.ref_code, branchCode: r.branch_code, amount: r.amount === null ? null : Number(r.amount), note: r.note, actor: r.actor, at: r.at.toISOString() }));
}

export async function addLog(tx: Tx, tenantId: string | number, e: { code: string; action: 'issue' | 'use' | 'release' | 'revoke' | 'conflict'; source?: string; refId?: string; refCode?: string; branch?: string | null; amount?: number | null; note?: string; actor: string }) {
  await sql`INSERT INTO mod_voucher.code_log (tenant_id, code, action, ref_source, ref_id, ref_code, branch_code, amount, note, actor)
    VALUES (${tenantId}, ${e.code}, ${e.action}, ${e.source ?? null}, ${e.refId ?? null}, ${e.refCode ?? null}, ${e.branch ?? null}, ${e.amount ?? null}, ${e.note ?? null}, ${e.actor})`.execute(tx);
}

/**
 * Phát mã cho đợt (sinh hoặc nạp). Mỗi dòng: SĐT khách (bắt buộc — luôn gắn khách) + mã (nạp) hoặc để trống (sinh ngẫu nhiên).
 * Mã nạp đã có / lặp trong danh sách → bỏ qua, báo lại. SĐT sai → bỏ qua, báo lại.
 */
export async function issueCodes(tx: Tx, ctx: ActionContext, campaignId: string, rows: readonly { phone: string; code?: string; partnerCode?: string }[], source: 'generate' | 'import', today: string) {
  const c = await getCampaign(tx, campaignId, true);
  if (c.status !== 'active') throw Errors.conflict(`Đợt ${c.code} đã ngừng — mở lại rồi mới phát mã`, { reason: 'VOUCHER_CAMPAIGN_STATE', status: c.status });
  if (c.validTo && today > c.validTo) throw Errors.conflict(`Đợt ${c.code} đã hết hạn ngày ${c.validTo}`, { reason: 'VOUCHER_CAMPAIGN_STATE', status: 'expired' });
  const expires = expiryOf(c, today > c.validFrom ? today : c.validFrom);
  const created: { code: string; phone: string }[] = [];
  const skipped: { row: number; code?: string; phone: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const phone = normalizePhone(r.phone);
    if (!phone) { skipped.push({ row: i + 1, phone: r.phone, ...(r.code ? { code: r.code } : {}), reason: 'SĐT phải có 10 số, bắt đầu bằng 0' }); continue; }
    let code = r.code ? normalizeCode(r.code) : '';
    if (source === 'import') {
      if (!/^[A-Z0-9_-]{3,64}$/.test(code)) { skipped.push({ row: i + 1, phone, code: r.code ?? '', reason: 'Mã chỉ gồm chữ không dấu, số, _ -, dài 3–64' }); continue; }
      if (seen.has(code)) { skipped.push({ row: i + 1, phone, code, reason: 'Mã lặp trong danh sách' }); continue; }
      seen.add(code);
      await lockCode(tx, code);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (source === 'generate') code = randomCode();
      const ins = await sql<{ code: string }>`INSERT INTO mod_voucher.codes (tenant_id, code, campaign_id, phone, partner_code, source, expires_on, issued_by)
        VALUES (${ctx.tenant.id}, ${code}, ${c.id}::uuid, ${phone}, ${r.partnerCode ?? null}, ${source}, ${expires}, ${ctx.actor.id})
        ON CONFLICT (tenant_id, code) DO NOTHING RETURNING code`.execute(tx);
      if (ins.rows.length) {
        created.push({ code, phone });
        await addLog(tx, ctx.tenant.id, { code, action: 'issue', source: 'screen', note: `${source === 'import' ? 'Nạp' : 'Sinh'} cho SĐT ${phone}`, actor: ctx.actor.id });
        break;
      }
      if (source === 'import') { skipped.push({ row: i + 1, phone, code, reason: 'Mã đã có (đợt này hoặc đợt khác)' }); break; }
    }
  }
  return { campaignId: c.id, created, skipped };
}

export async function revokeCode(tx: Tx, tenantId: string | number, code: string, reason: string, actor: string, ref?: { source: string; refId: string; refCode?: string; branch?: string | null }) {
  const r = await sql<{ code: string }>`UPDATE mod_voucher.codes SET status = 'revoked', revoked_at = now(), revoke_reason = ${reason}
    WHERE code = ${code} AND status = 'active' RETURNING code`.execute(tx);
  if (r.rows.length) await addLog(tx, tenantId, { code, action: 'revoke', note: reason, actor, ...(ref ? { source: ref.source, refId: ref.refId, refCode: ref.refCode, branch: ref.branch } : {}) });
  return r.rows.length > 0;
}

/** Đánh dấu đã dùng (sự kiện đơn / phiếu đã ghi sổ). Mã đã dùng ở nơi khác → ghi nhật ký dùng trùng, giữ lần dùng đầu. */
export async function markUsed(tx: Tx, tenantId: string | number, u: { code: string; source: 'pos' | 'phieu-ban'; refId: string; refCode: string; branch: string; date: string; amount: number }) {
  await lockCode(tx, u.code);
  const cur = (await codesByCode(tx, [u.code])).get(u.code);
  if (!cur) return 'missing' as const;
  if (cur.status === 'used' && cur.usedRefId === u.refId) return 'again' as const;
  if (cur.status !== 'active') {
    await addLog(tx, tenantId, { code: u.code, action: 'conflict', source: u.source, refId: u.refId, refCode: u.refCode, branch: u.branch, amount: u.amount,
      note: cur.status === 'used' ? `Dùng trùng — đã dùng ở ${cur.usedRefCode ?? '?'} (${cur.usedBranch ?? ''})` : `Dùng mã đã thu hồi (${cur.revokeReason ?? ''})`, actor: 'system' });
    return 'conflict' as const;
  }
  await sql`UPDATE mod_voucher.codes SET status = 'used', used_source = ${u.source}, used_ref_id = ${u.refId}, used_ref_code = ${u.refCode}, used_branch = ${u.branch},
      used_on = ${u.date}, used_amount = ${u.amount}, used_at = now() WHERE code = ${u.code}`.execute(tx);
  await addLog(tx, tenantId, { code: u.code, action: 'use', source: u.source, refId: u.refId, refCode: u.refCode, branch: u.branch, amount: u.amount, actor: 'system' });
  return 'used' as const;
}

/** Trả mã đã dùng của một đơn / phiếu (huỷ đơn chờ thanh toán, bỏ duyệt phiếu bán): mã về "còn". */
export async function releaseUsed(tx: Tx, tenantId: string | number, source: 'pos' | 'phieu-ban', refId: string, note: string) {
  const r = await sql<{ code: string }>`UPDATE mod_voucher.codes SET status = 'active', used_source = NULL, used_ref_id = NULL,
      used_ref_code = NULL, used_branch = NULL, used_on = NULL, used_amount = NULL, used_at = NULL
    WHERE used_source = ${source} AND used_ref_id = ${refId} AND status = 'used'
    RETURNING code`.execute(tx);
  for (const x of r.rows) await addLog(tx, tenantId, { code: x.code, action: 'release', source, refId, note, actor: 'system' });
  return r.rows.map((x) => x.code);
}

/** Phát mã tự động của một đơn máy bán (sự kiện đơn đã ghi sổ). Đã phát (giao lại sự kiện) → bỏ qua. */
export async function insertAuto(tx: Tx, tenantId: string | number, v: { code: string; campaignId: string; phone: string; partnerCode: string | null; expiresOn: string | null; orderId: string; orderCode: string; branch: string }) {
  const ins = await sql<{ code: string }>`INSERT INTO mod_voucher.codes (tenant_id, code, campaign_id, phone, partner_code, source, expires_on, issued_by, issued_order_id, issued_order_code, issued_branch)
    VALUES (${tenantId}, ${v.code}, ${v.campaignId}::uuid, ${v.phone}, ${v.partnerCode}, 'auto', ${v.expiresOn}, 'system', ${v.orderId}, ${v.orderCode}, ${v.branch})
    ON CONFLICT DO NOTHING RETURNING code`.execute(tx);
  if (ins.rows.length) await addLog(tx, tenantId, { code: v.code, action: 'issue', source: 'pos', refId: v.orderId, refCode: v.orderCode, branch: v.branch, note: `Tự phát cho SĐT ${v.phone}`, actor: 'system' });
  return ins.rows.length > 0;
}

/** Mã tự phát chưa dùng của một đơn gốc. */
export async function activeIssuedBy(tx: Tx, orderId: string): Promise<string[]> {
  return (await sql<{ code: string }>`SELECT code FROM mod_voucher.codes WHERE issued_order_id = ${orderId} AND status = 'active' ORDER BY code`.execute(tx)).rows.map((r) => r.code);
}

// ── Danh mục ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** SĐT của khách đơn này: SĐT gửi kèm + SĐT / di động ở danh mục theo mã + chính mã khách nếu là SĐT. */
export async function phonesOf(tx: Tx, customer: string | undefined, phone: string | undefined): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (p: string | null | undefined) => { const n = normalizePhone(p); if (n) out.add(n); };
  add(phone);
  if (customer) {
    add(customer);
    const r = (await sql<{ phone: string | null; mobile: string | null }>`SELECT phone, mobile FROM bizcity_read.partners WHERE code = ${customer} LIMIT 1`.execute(tx)).rows[0];
    add(r?.phone); add(r?.mobile);
  }
  return out;
}

/** Giỏ đã tra danh mục: item_id, nhãn theo mã hàng. */
export async function cartOf(tx: Tx, items: readonly { sku: string; qty: number; amount: number }[]): Promise<CartLine[]> {
  const skus = [...new Set(items.map((x) => x.sku))];
  const rows = skus.length ? (await sql<{ sku: string; item_id: string | null; brand_code: string | null }>`
    SELECT sku, item_id::text AS item_id, brand_code FROM bizcity_read.products WHERE sku IN (${sql.join(skus)})`.execute(tx)).rows : [];
  const by = new Map(rows.map((r) => [r.sku, r]));
  return items.map((x) => ({ sku: x.sku, itemId: by.get(x.sku)?.item_id ?? null, brandCode: by.get(x.sku)?.brand_code ?? null, qty: x.qty, amount: x.amount }));
}

// ── Báo cáo ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Theo đợt: phát hành / còn / đã dùng / hết hạn / thu hồi, tiền đã trừ; theo cửa hàng dùng: số mã, tiền. Lọc kỳ theo ngày phát / ngày dùng. */
export async function report(tx: Tx, f: { from?: string; to?: string; issuer?: string; campaignId?: string; branches: string[]; today: string }) {
  const issuedIn = f.from && f.to ? sql`AND k.issued_at::date BETWEEN ${f.from} AND ${f.to}` : sql``;
  const camp = sql`${f.issuer ? sql`AND c.issuer = ${f.issuer}` : sql``} ${f.campaignId ? sql`AND c.campaign_id::text = ${f.campaignId}` : sql``}`;
  const branchIn = f.branches.length ? sql`AND COALESCE(k.used_branch, k.issued_branch) IN (${sql.join(f.branches)})` : sql``;
  const rows = (await sql<{ campaign_id: string; code: string; name: string; issuer: string; issuer_partner_code: string | null; kind: string; face_value: string;
    issued: string; active: string; used: string; expired: string; revoked: string; used_amount: string | null }>`
    SELECT c.campaign_id::text AS campaign_id, c.code, c.name, c.issuer, c.issuer_partner_code, c.kind, c.face_value,
           count(k.code) AS issued,
           count(k.code) FILTER (WHERE k.status = 'active' AND (k.expires_on IS NULL OR k.expires_on >= ${f.today})) AS active,
           count(k.code) FILTER (WHERE k.status = 'used') AS used,
           count(k.code) FILTER (WHERE k.status = 'active' AND k.expires_on < ${f.today}) AS expired,
           count(k.code) FILTER (WHERE k.status = 'revoked') AS revoked,
           sum(k.used_amount) FILTER (WHERE k.status = 'used') AS used_amount
      FROM mod_voucher.campaigns c
      LEFT JOIN mod_voucher.codes k ON k.campaign_id = c.campaign_id ${issuedIn} ${branchIn}
     WHERE true ${camp}
     GROUP BY c.campaign_id ORDER BY c.code`.execute(tx)).rows;
  const usedIn = f.from && f.to ? sql`AND k.used_on BETWEEN ${f.from} AND ${f.to}` : sql``;
  const byBranch = (await sql<{ campaign_id: string; code: string; name: string; issuer: string; used_branch: string; used_source: string; n: string; amount: string | null }>`
    SELECT c.campaign_id::text AS campaign_id, c.code, c.name, c.issuer, k.used_branch, k.used_source, count(*) AS n, sum(k.used_amount) AS amount
      FROM mod_voucher.codes k JOIN mod_voucher.campaigns c ON c.campaign_id = k.campaign_id
     WHERE k.status = 'used' ${usedIn} ${camp} ${f.branches.length ? sql`AND k.used_branch IN (${sql.join(f.branches)})` : sql``}
     GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY c.code, k.used_branch`.execute(tx)).rows;
  return {
    campaigns: rows.map((r) => ({
      campaignId: r.campaign_id, code: r.code, name: r.name, issuer: r.issuer, issuerPartnerCode: r.issuer_partner_code, kind: r.kind, faceValue: Number(r.face_value),
      issued: Number(r.issued), active: Number(r.active), used: Number(r.used), expired: Number(r.expired), revoked: Number(r.revoked), usedAmount: Number(r.used_amount ?? 0),
    })),
    byBranch: byBranch.map((r) => ({ campaignId: r.campaign_id, code: r.code, name: r.name, issuer: r.issuer, branchCode: r.used_branch, source: r.used_source, used: Number(r.n), usedAmount: Number(r.amount ?? 0) })),
  };
}

export { displayStatus };

// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: voucher đã dùng theo đơn / phiếu cho báo cáo khách hàng của module pos (đóng góp)
/** Mã đã dùng có ngày dùng trong khoảng (đơn máy bán / phiếu bán BH10), lọc cửa hàng dùng. */
export async function usedCodes(tx: Tx, f: { from: string; to: string; branches: string[] }) {
  return (await sql<{ code: string; campaign_id: string; campaign_name: string; issuer: string; used_source: string; used_ref_id: string; used_ref_code: string | null;
    used_branch: string | null; used_on: string; used_amount: string | null; partner_code: string | null; phone: string }>`
    SELECT c.code, c.campaign_id::text, k.name AS campaign_name, k.issuer, c.used_source, c.used_ref_id, c.used_ref_code, c.used_branch, c.used_on::text,
           c.used_amount, c.partner_code, c.phone
      FROM mod_voucher.codes c JOIN mod_voucher.campaigns k ON k.campaign_id = c.campaign_id
     WHERE c.status = 'used' AND c.used_ref_id IS NOT NULL AND c.used_on BETWEEN ${f.from}::date AND ${f.to}::date
       ${f.branches.length ? sql`AND c.used_branch IN (${sql.join(f.branches)})` : sql``}
     ORDER BY c.used_on, c.code`.execute(tx)).rows
    .map((r) => ({
      code: r.code, campaignId: r.campaign_id, campaignName: r.campaign_name, issuer: r.issuer, source: r.used_source, refId: r.used_ref_id, refCode: r.used_ref_code ?? '',
      branchCode: r.used_branch ?? '', usedOn: r.used_on, amount: r.used_amount === null ? 0 : Number(r.used_amount), partnerCode: r.partner_code ?? '', phone: r.phone,
    }));
}
