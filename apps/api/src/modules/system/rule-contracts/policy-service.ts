// @bizcity-layer P module-sdk
// [2026-11-08 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9.3 / 9.6): liệt kê chính sách đang hiệu lực, tính theo chính sách, phát hành inline
/**
 * DỊCH VỤ CHÍNH SÁCH cho nguồn ngoài (POS, Woo, sàn): đọc từ sổ đăng ký (@bizcity/platform/core/policies), chạy Rule Contract.
 * Chỉ nội dung inline (store = inline) mới có `params` ở đây; chính sách mà nội dung ở bảng của module chủ (mua hàng) hiện ra
 * trong danh sách nhưng không có params và không tính được ở W3a.
 *
 * [2026-11-12 09:25 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 2–3 (đóng góp): bản `store = module` đọc được qua bộ đọc của module chủ (BH12 đăng ký, khớp băm);
 * evaluate nhận `lines[].price`, trả thêm `discounts[]`; chính sách của module có bộ kiểm áp được (hạn mức chi nhánh) thì lọc trước.
 */
import { createHash } from 'node:crypto';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { settingsToday } from '@bizcity/platform/core/settings';
import { inlinePolicyId, listPublishedPolicies, publishInlinePolicy, type PolicyEnvelope } from '@bizcity/platform/core/policies';
import { getRuleContract, policyAvailability, policyContent, type Treatment } from './index.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Z0-9][A-Z0-9_.-]{0,63}$/;
/** Miền → module chủ khi phát hành inline. Chỉ miền có module chủ mới phát hành inline được. */
const OWNER_OF_DOMAIN: Record<string, string> = { sale: 'ban-hang' };

export interface PolicyScope { branchCodes?: string[]; channels?: string[] }
const scopeOf = (e: PolicyEnvelope): PolicyScope => {
  const s = (e.scope ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : undefined);
  return { branchCodes: arr(s.branchCodes), channels: arr(s.channels) };
};
const coversWindow = (w: { from?: string; to?: string }, at: string) => (!w.from || w.from <= at) && (!w.to || w.to >= at);
const domainOf = (ruleContract: string) => ruleContract.split('.')[0] ?? '';

export interface PolicyView {
  policyKey: string; policyId: string; version: number; ruleContract: string; ownerModule: string; store: string;
  scope: PolicyScope; effectiveFrom: string | null; effectiveTo: string | null; contentHash: string;
  /** null khi nội dung không ở sổ đăng ký, hoặc không đọc được (xem `problem`). */
  params: unknown;
  problem?: string;
}

/**
 * Chính sách đang hiệu lực tại `at`: bản phủ ngày `at` VÀ (khi có) cửa sổ chiến dịch trong nội dung phủ ngày đó. `branch` / `channel`
 * lọc theo phạm vi khi người gọi nêu; không nêu thì không lọc. `etag` đổi khi và chỉ khi tập (chính sách, bản, băm) đổi.
 */
export async function listPolicies(trx: Db, tenantId: string, q: { at?: string; domain?: string; branch?: string; channel?: string }) {
  const at = q.at ?? settingsToday();
  const rows = await listPublishedPolicies(trx, tenantId, { at, ruleContractPrefix: q.domain ? `${q.domain}.` : undefined });
  const items: PolicyView[] = [];
  for (const e of rows) {
    const scope = scopeOf(e);
    if (q.branch && scope.branchCodes?.length && !scope.branchCodes.includes(q.branch)) continue;
    if (q.channel && scope.channels?.length && !scope.channels.includes(q.channel)) continue;
    const view: PolicyView = {
      policyKey: e.policyKey, policyId: e.policyId, version: e.version, ruleContract: e.ruleContract, ownerModule: e.ownerModule, store: e.store,
      scope, effectiveFrom: e.effectiveFrom, effectiveTo: e.effectiveTo, contentHash: e.contentHash, params: null,
    };
    const contract = getRuleContract(e.ruleContract);
    if (contract) {
      const content = await policyContent(trx, tenantId, e, e.content);
      if (content === null) {
        // Bản module không đọc được (module chủ chưa có bộ đọc, hoặc bản đã bị sửa đè): giữ trong danh sách, params null — như W3a.
        if (e.store === 'inline') view.problem = 'bản không có nội dung';
      } else {
        const parsed = contract.params.safeParse(content);
        if (!parsed.success) view.problem = 'nội dung không đúng khuôn của Rule Contract';
        else {
          if (!coversWindow(contract.window(parsed.data), at)) continue;
          view.params = parsed.data;
        }
      }
    } else if (e.store === 'inline') view.problem = `chưa có Rule Contract ${e.ruleContract}`;
    items.push(view);
  }
  const etag = createHash('sha256').update(items.map((i) => `${i.policyId}@${i.version}#${i.contentHash}`).sort().join('|')).digest('hex').slice(0, 32);
  return { asOf: at, etag, items };
}

/** `price`: đơn giá trọn (gồm thuế, trước giảm) trên một đơn vị nhỏ nhất — cần cho chương trình giảm giá. */
export interface EvalLine { lineKey: string; sku: string; qty: number; itemId?: string; price?: number }
/** [2026-11-13 10:20 AM Võ Hoàng] POS-KM2 — 00 §18 mục 3: ngữ cảnh cho điều kiện của khuôn khuyến mại (giờ / thứ, khách, mã giảm giá). */
export interface EvaluateRequest {
  docDate: string; branchCode?: string; channel?: string; lines: EvalLine[]; policies?: { key: string; version?: number }[];
  at?: { time?: string; weekday?: number }; customer?: { birthday?: string; memberLevel?: string }; coupons?: string[];
}
export interface PolicyRefOut { key: string; version: number; hash: string; policyId: string }

/**
 * Tính theo chính sách. Mỗi chính sách áp ĐỘC LẬP trên các dòng gốc (cộng dồn, chưa có "áp riêng"). Chính sách không áp được nằm
 * ở `skipped` kèm lý do — không im lặng. `policyRefs` chỉ gồm chính sách đã tạo ra kết quả: đúng mảng nguồn gắn vào chứng từ nạp
 * (bizcity_ledger_intake@1 §3.1, W2a kiểm lại ở IN-POL-001..003).
 */
export async function evaluatePolicies(trx: Db, tenantId: string, req: EvaluateRequest) {
  if (!DAY.test(req.docDate)) throw Errors.validation(`docDate "${req.docDate}" sai khuôn YYYY-MM-DD`);
  const { items } = await listPolicies(trx, tenantId, { at: req.docDate, domain: 'sale' });
  const wanted = req.policies?.length ? req.policies : null;
  const applied: { policyRef: PolicyRefOut; ruleContract: string; result: unknown; explain: string; treatment: Treatment[]; quota?: unknown }[] = [];
  const skipped: { key: string; version?: number; reason: string }[] = [];
  const gifts: { sku: string; itemId?: string; qty: number; isGift: true; policyRef: { key: string; version: number; line: 'gift' } }[] = [];
  const discounts: { lineKey: string; sku: string; qty: number; amount: number; policyRef: { key: string; version: number; line: 'discount' } }[] = [];
  const envelopes = new Map((await listPublishedPolicies(trx, tenantId, { at: req.docDate, ruleContractPrefix: 'sale.' })).map((e) => [`${e.policyId}@${e.version}`, e]));

  if (wanted) {
    for (const w of wanted) {
      const hit = items.find((i) => i.policyKey === w.key);
      if (!hit) skipped.push({ key: w.key, version: w.version, reason: 'không có chính sách đang hiệu lực mang mã này tại ngày chứng từ' });
      else if (w.version !== undefined && hit.version !== w.version) skipped.push({ key: w.key, version: w.version, reason: `bản ${w.version} không phủ ngày chứng từ; bản hiệu lực là ${hit.version}` });
    }
  }
  // [2026-11-13 10:20 AM Võ Hoàng] POS-KM2 — 00 §18 mục 3: thứ tự theo ưu tiên (lớn trước) rồi mã; chương trình áp riêng giữ các dòng nó đã dùng.
  const context = { docDate: req.docDate, ...(req.at ? { at: req.at } : {}), ...(req.customer ? { customer: req.customer } : {}), ...(req.coupons ? { coupons: req.coupons } : {}) };
  const paramOf = (i: PolicyView) => (i.params && typeof i.params === 'object' ? (i.params as { priority?: number; exclusive?: boolean; legalCapPct?: number | null }) : {});
  const ordered = [...items].sort((a, b) => Number(paramOf(b).priority ?? 0) - Number(paramOf(a).priority ?? 0) || a.policyKey.localeCompare(b.policyKey));
  const taken = new Map<string, string>();
  const capOf = new Map<string, number | null>();
  for (const i of ordered) {
    if (wanted && !wanted.some((w) => w.key === i.policyKey && (w.version === undefined || w.version === i.version))) continue;
    const reason = (() => {
      if (i.problem) return i.problem;
      if (i.params === null) return 'nội dung không có ở sổ đăng ký (ở module chủ) — chưa tính được';
      if (i.scope.branchCodes?.length && !req.branchCode) return 'chính sách giới hạn chi nhánh — cần branchCode';
      if (i.scope.branchCodes?.length && !i.scope.branchCodes.includes(req.branchCode!)) return 'ngoài phạm vi chi nhánh';
      if (i.scope.channels?.length && !req.channel) return 'chính sách giới hạn kênh — cần channel';
      if (i.scope.channels?.length && !i.scope.channels.includes(req.channel!)) return 'ngoài phạm vi kênh';
      return null;
    })();
    if (reason) { skipped.push({ key: i.policyKey, version: i.version, reason }); continue; }
    // Bộ kiểm của module chủ (BH12: hạn mức của chi nhánh) — trước khi tính, để chương trình hết suất không gợi ý quà.
    const env = envelopes.get(`${i.policyId}@${i.version}`);
    const avail: { skip?: string; info?: Record<string, unknown> } = env ? await policyAvailability(trx, tenantId, env, { branchCode: req.branchCode, docDate: req.docDate }) : {};
    if (avail.skip) { skipped.push({ key: i.policyKey, version: i.version, reason: avail.skip }); continue; }
    const contract = getRuleContract(i.ruleContract)!;
    const free = req.lines.filter((l) => !taken.has(l.lineKey));
    const result = contract.evaluate(i.params, { lines: free, context });
    if ((result as { indeterminate?: boolean }).indeterminate) { skipped.push({ key: i.policyKey, version: i.version, reason: contract.explain(i.params, result) }); continue; }
    const gift = (result as { gifts?: { sku: string; itemId?: string; qty: number }[] }).gifts ?? [];
    const disc = (result as { discounts?: { lineKey: string; sku: string; qty: number; amount: number }[] }).discounts ?? [];
    if (!gift.length && !disc.length) {
      const by = [...new Set(req.lines.filter((l) => taken.has(l.lineKey)).map((l) => taken.get(l.lineKey)!))];
      skipped.push({ key: i.policyKey, version: i.version, reason: contract.explain(i.params, result) + (by.length ? ` (dòng đã được chương trình áp riêng ${by.join(', ')} dùng)` : '') });
      continue;
    }
    const pp = paramOf(i);
    if (pp.exclusive) for (const lk of (result as { touched?: string[] }).touched ?? disc.map((d) => d.lineKey)) taken.set(lk, i.policyKey);
    if ('legalCapPct' in pp && !(result as { selfCapped?: boolean }).selfCapped) capOf.set(i.policyKey, pp.legalCapPct ?? null);
    const policyRef = { key: i.policyKey, version: i.version, hash: i.contentHash, policyId: i.policyId };
    applied.push({ policyRef, ruleContract: i.ruleContract, result, explain: contract.explain(i.params, result), treatment: contract.treatment(result), ...(avail.info?.quota ? { quota: avail.info.quota } : {}) });
    for (const g of gift) gifts.push({ ...g, isGift: true, policyRef: { key: i.policyKey, version: i.version, line: 'gift' } });
    for (const x of disc) discounts.push({ ...x, policyRef: { key: i.policyKey, version: i.version, line: 'discount' } });
  }
  // Trần NĐ81 (00 §18 mục 3): tổng giảm của các chương trình có trần trên một dòng ≤ trần % tiền dòng; kẹp chương trình tính sau trước.
  const capped: { lineKey: string; key: string; before: number; after: number; capPct: number }[] = [];
  const grossOf = new Map(req.lines.map((l) => [l.lineKey, l.price !== undefined ? Math.round(l.qty * l.price) : null]));
  for (const lk of [...new Set(discounts.map((d) => d.lineKey))]) {
    const list = discounts.filter((d) => d.lineKey === lk && capOf.has(d.policyRef.key) && capOf.get(d.policyRef.key) !== null);
    const g = grossOf.get(lk);
    if (!list.length || g == null) continue;
    const pct = Math.min(...list.map((d) => capOf.get(d.policyRef.key)!));
    let over = list.reduce((s, d) => s + d.amount, 0) - Math.floor((g * pct) / 100);
    for (const d of [...list].reverse()) {
      if (over <= 0) break;
      const cut = Math.min(d.amount, over);
      capped.push({ lineKey: lk, key: d.policyRef.key, before: d.amount, after: d.amount - cut, capPct: pct });
      d.amount -= cut; over -= cut;
    }
  }
  const finalDiscounts = discounts.filter((d) => d.amount > 0);
  return {
    docDate: req.docDate, applied, skipped, policyRefs: applied.map((a) => ({ key: a.policyRef.key, version: a.policyRef.version, hash: a.policyRef.hash, policyId: a.policyRef.policyId })),
    gifts, discounts: finalDiscounts, ...(capped.length ? { capped } : {}),
  };
}

export interface PublishRequest { key: string; ruleContract: string; params?: unknown; scope?: PolicyScope; effectiveFrom: string; reason?: string; legalRef?: string }

/**
 * Phát hành một bản chính sách inline. Kiểm: mã đúng khuôn; Rule Contract có thật và miền có module chủ; nội dung đúng khuôn zod;
 * kiểm chéo trường của Rule Contract; lùi về trước hôm nay cần lý do. Trần pháp lý (NĐ81): kẹp lúc tính (evaluate, 00 §18), không chặn phát hành.
 */
export async function publishPolicy(trx: Db, who: { tenantId: string; actor: string }, req: PublishRequest) {
  if (!KEY_RE.test(req.key)) throw Errors.validation(`Mã chính sách "${req.key}" sai khuôn: chữ hoa, số, _ . - ; tối đa 64 ký tự, bắt đầu bằng chữ hoặc số`);
  const contract = getRuleContract(req.ruleContract);
  if (!contract) throw Errors.validation(`Chưa có Rule Contract ${req.ruleContract}`);
  const owner = OWNER_OF_DOMAIN[domainOf(contract.id)];
  if (!owner) throw Errors.validation(`Miền ${domainOf(contract.id)} chưa có module chủ — chưa phát hành inline được`);
  if (!DAY.test(req.effectiveFrom)) throw Errors.validation(`effectiveFrom "${req.effectiveFrom}" sai khuôn YYYY-MM-DD`);
  const parsed = contract.params.safeParse(req.params);
  if (!parsed.success) throw Errors.validation('Nội dung chính sách chưa đúng', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const issues = contract.publishChecks(parsed.data);
  if (issues.length) throw Errors.validation('Nội dung chính sách chưa đạt kiểm phát hành', issues);
  const reason = req.reason?.trim() || null;
  if (req.effectiveFrom < settingsToday() && (!reason || reason.length < 3)) throw Errors.validation('Áp lùi về trước hôm nay — cần lý do (≥ 3 ký tự)');
  const env = await publishInlinePolicy(trx, {
    tenantId: who.tenantId, ownerModule: owner, policyKey: req.key, ruleContract: contract.id, scope: { ...(req.scope ?? {}) },
    effectiveFrom: req.effectiveFrom, content: parsed.data, actor: who.actor, reason, legalRef: req.legalRef ?? null,
  });
  return { policyKey: env.policyKey, policyId: inlinePolicyId(owner, req.key), version: env.version, effectiveFrom: env.effectiveFrom, contentHash: env.contentHash, ruleContract: env.ruleContract };
}

