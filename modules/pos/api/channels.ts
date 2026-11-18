/**
 * Kênh bán hàng (phiếu NT-BH-031) — đọc / ghi bảng mod_pos.sale_channels và số liệu đơn máy bán theo kênh. Chạy trong ctx.data.module
 * (RLS lọc theo đơn vị). Không chạm bảng Core, không đọc bảng của module khác (phiếu BH10 lấy qua action đọc của phieu-ban).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: danh mục kênh bán hàng + số liệu bán theo kênh (đóng góp)
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { DEFAULT_CHANNEL, SEED_CHANNELS, channelKey, matchSaleSource, orderDiscount, saleSourceMessage, type Channel, type ChannelFact, type ChannelKind } from './domain/channels.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
type Actor = { id: string; name: string };

type Row = { code: string; name: string; kind: ChannelKind; sort_order: number; is_active: boolean; updated_at: Date; updated_by_name: string | null; created_by: string };
const toChannel = (r: Row): Channel & { updatedAt: string; updatedByName: string; seeded: boolean } => ({
  code: r.code, name: r.name, kind: r.kind, sortOrder: r.sort_order, active: r.is_active,
  updatedAt: r.updated_at.toISOString(), updatedByName: r.updated_by_name ?? '', seeded: r.created_by === 'system',
});

/**
 * Nạp sẵn 14 nguồn bán của POS cũ cho đơn vị chưa có kênh nào (lần đầu đọc). Bảng không có lệnh xoá nên đã nạp thì không nạp lại;
 * hai lần đọc đầu chạy đồng thời: ON CONFLICT bỏ qua dòng trùng.
 */
export async function ensureChannels(tx: Tx, tenantId: string): Promise<void> {
  const has = (await sql`SELECT 1 FROM mod_pos.sale_channels LIMIT 1`.execute(tx)).rows.length > 0;
  if (has) return;
  for (const c of SEED_CHANNELS) {
    await sql`INSERT INTO mod_pos.sale_channels (tenant_id, code, name, kind, sort_order, created_by, created_by_name, updated_by, updated_by_name)
      VALUES (${tenantId}, ${c.code}, ${c.name}, ${c.kind}, ${c.sortOrder}, 'system', 'Nạp sẵn (nguồn bán POS cũ)', 'system', 'Nạp sẵn (nguồn bán POS cũ)')
      ON CONFLICT DO NOTHING`.execute(tx);
  }
}

/** Danh mục kênh (nạp sẵn nếu chưa có), theo thứ tự; `activeOnly` = chỉ kênh đang dùng (máy bán, ô chọn BH10). */
export async function listChannels(tx: Tx, tenantId: string, activeOnly = false) {
  await ensureChannels(tx, tenantId);
  return (await sql<Row>`SELECT code, name, kind, sort_order, is_active, updated_at, updated_by_name, created_by FROM mod_pos.sale_channels
    ${activeOnly ? sql`WHERE is_active` : sql``} ORDER BY sort_order, code`.execute(tx)).rows.map(toChannel);
}

/** Kênh đã có đơn máy bán dùng (để màn báo "đã dùng — chỉ ngừng dùng"). Đơn không mang kênh tính cho kênh mặc định. */
export async function usedChannels(tx: Tx): Promise<Set<string>> {
  const rows = (await sql<{ c: string | null }>`SELECT DISTINCT snapshot->>'saleSource' AS c FROM mod_pos.orders`.execute(tx)).rows;
  return new Set(rows.map((r) => channelKey(r.c)));
}

async function getRow(tx: Tx, code: string, lock = false): Promise<Row> {
  const r = (await sql<Row>`SELECT code, name, kind, sort_order, is_active, updated_at, updated_by_name, created_by FROM mod_pos.sale_channels
    WHERE code = ${code} ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`kênh bán ${code}`);
  return r;
}

async function nameTaken(tx: Tx, name: string, exceptCode?: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM mod_pos.sale_channels WHERE lower(btrim(name)) = lower(btrim(${name})) ${exceptCode ? sql`AND code <> ${exceptCode}` : sql``}`.execute(tx)).rows.length > 0;
}

export async function createChannel(tx: Tx, tenantId: string, actor: Actor, c: { code: string; name: string; kind: ChannelKind; sortOrder?: number }) {
  await ensureChannels(tx, tenantId);
  if ((await sql`SELECT 1 FROM mod_pos.sale_channels WHERE code = ${c.code}`.execute(tx)).rows.length) {
    throw Errors.conflict(`Mã kênh ${c.code} đã có — kênh đã ngừng thì bấm Dùng lại`, { reason: 'POS_SALE_SOURCE_EXISTS', field: 'code', code: c.code });
  }
  if (await nameTaken(tx, c.name)) throw Errors.conflict(`Tên kênh "${c.name}" đã có`, { reason: 'POS_SALE_SOURCE_EXISTS', field: 'name' });
  const sort = c.sortOrder ?? Number((await sql<{ m: number | null }>`SELECT max(sort_order) AS m FROM mod_pos.sale_channels`.execute(tx)).rows[0]?.m ?? 0) + 10;
  await sql`INSERT INTO mod_pos.sale_channels (tenant_id, code, name, kind, sort_order, created_by, created_by_name, updated_by, updated_by_name)
    VALUES (${tenantId}, ${c.code}, ${c.name.trim()}, ${c.kind}, ${sort}, ${actor.id}, ${actor.name || null}, ${actor.id}, ${actor.name || null})`.execute(tx);
  return toChannel(await getRow(tx, c.code));
}

/** Sửa tên / loại / thứ tự. Mã không đổi (đơn cũ lưu mã). */
export async function updateChannel(tx: Tx, tenantId: string, actor: Actor, code: string, c: { name: string; kind: ChannelKind; sortOrder?: number }) {
  await ensureChannels(tx, tenantId);
  const cur = await getRow(tx, code, true);
  if (await nameTaken(tx, c.name, code)) throw Errors.conflict(`Tên kênh "${c.name}" đã có`, { reason: 'POS_SALE_SOURCE_EXISTS', field: 'name' });
  await sql`UPDATE mod_pos.sale_channels SET name = ${c.name.trim()}, kind = ${c.kind}, sort_order = ${c.sortOrder ?? cur.sort_order},
    updated_by = ${actor.id}, updated_by_name = ${actor.name || null}, updated_at = now() WHERE code = ${code}`.execute(tx);
  return toChannel(await getRow(tx, code));
}

/** Ngừng dùng / dùng lại (thay cho xoá — ECP-13). */
export async function setChannelActive(tx: Tx, tenantId: string, actor: Actor, code: string, active: boolean) {
  await ensureChannels(tx, tenantId);
  await getRow(tx, code, true);
  await sql`UPDATE mod_pos.sale_channels SET is_active = ${active}, updated_by = ${actor.id}, updated_by_name = ${actor.name || null}, updated_at = now()
    WHERE code = ${code}`.execute(tx);
  return toChannel(await getRow(tx, code));
}

/**
 * Kênh của đơn máy bán gửi lên (mã, hoặc TÊN với máy bán cũ; trống = kênh mặc định). Mã lạ / kênh đã ngừng → POS_SALE_SOURCE (400).
 * Đơn bán lúc mất mạng gửi bù (offline): hàng đã bán — kênh đã ngừng vẫn nhận; kênh lạ → kênh mặc định, giữ chuỗi máy gửi để kế toán xem.
 */
export async function resolveSaleSource(tx: Tx, tenantId: string, input: string | undefined, offline: boolean): Promise<{ code: string; name: string; offlineRaw?: string }> {
  const list = await listChannels(tx, tenantId);
  const m = matchSaleSource(list, input);
  if (m.ok) return { code: m.channel.code, name: m.channel.name };
  if (offline) {
    if (m.reason === 'inactive') return { code: m.channel!.code, name: m.channel!.name };
    const d = list.find((c) => c.code === DEFAULT_CHANNEL) ?? list[0];
    return { code: d?.code ?? DEFAULT_CHANNEL, name: d?.name ?? 'Gần shop', offlineRaw: input ?? '' };
  }
  throw Errors.validation(saleSourceMessage(input ?? '', m), { reason: 'POS_SALE_SOURCE', field: 'saleSource', saleSource: input ?? '', cause: m.reason });
}

/** Tên kênh theo mã (gồm kênh đã ngừng) — cho cột Kênh của BH13 / tổng quan. */
export async function channelNames(tx: Tx, tenantId: string): Promise<Record<string, string>> {
  return Object.fromEntries((await listChannels(tx, tenantId)).map((c) => [c.code, c.name]));
}

/** Biểu thức SQL mã kênh của đơn (đơn không mang kênh / "tai_quay" → kênh mặc định). */
export const orderChannelSql = (snapshotCol: string) =>
  sql`(CASE WHEN coalesce(${sql.ref(snapshotCol)}->>'saleSource', '') IN ('', 'tai_quay') THEN ${DEFAULT_CHANNEL} ELSE ${sql.ref(snapshotCol)}->>'saleSource' END)`;

/**
 * Số liệu đơn máy bán theo kênh × cửa hàng trong khoảng ngày: đơn đã hoàn tất (ngày bán), phiếu trả (ngày trả, cửa hàng nhận trả, kênh của
 * đơn gốc). `branches` rỗng = mọi cửa hàng.
 */
export async function posChannelFacts(tx: Tx, f: { from: string; to: string; branches: readonly string[] }): Promise<ChannelFact[]> {
  const inB = (col: string) => (f.branches.length ? sql`AND ${sql.ref(col)} IN (${sql.join([...f.branches])})` : sql``);
  const orders = (await sql<{ branch_code: string; snapshot: { saleSource?: string; lines?: never[]; zBill?: never }; total: string }>`
    SELECT o.branch_code, o.snapshot, o.total FROM mod_pos.orders o
     WHERE o.status = 'completed' AND o.business_date BETWEEN ${f.from} AND ${f.to} ${inB('o.branch_code')}`.execute(tx)).rows;
  const returns = (await sql<{ branch_code: string; channel: string; refund_total: string }>`
    SELECT r.branch_code, ${orderChannelSql('o.snapshot')} AS channel, r.refund_total FROM mod_pos.returns r JOIN mod_pos.orders o ON o.order_id = r.order_id
     WHERE r.business_date BETWEEN ${f.from} AND ${f.to} ${inB('r.branch_code')}`.execute(tx)).rows;
  return [
    ...orders.map((o) => ({ source: 'pos' as const, channel: channelKey(o.snapshot.saleSource), branchCode: o.branch_code, orders: 1, revenue: Number(o.total), discount: orderDiscount(o.snapshot), returns: 0 })),
    ...returns.map((r) => ({ source: 'pos' as const, channel: r.channel, branchCode: r.branch_code, orders: 0, revenue: 0, discount: 0, returns: Number(r.refund_total) })),
  ];
}
