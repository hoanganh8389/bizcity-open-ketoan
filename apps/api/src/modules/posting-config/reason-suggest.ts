// @bizcity-layer K kernel/config
// [2026-10-30 10:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — posting.reason.suggest tất định (từ khoá, ví dụ, tên lý do, lịch sử đơn vị) + kiểm lý do mặc định cho docType module nộp.
/**
 * GỢI Ý LÝ DO ĐỊNH KHOẢN (bizcity_posting_template@1 §6, PHASES 3.12; PHASE-012 S012-4).
 *
 * Tất định — cùng câu, cùng cấu hình, cùng sổ ⇒ cùng kết quả; chạy được khi không có Cell / LLM. Cell chỉ chọn trong danh sách này:
 * AI không tạo lý do mới, không viết tài khoản.
 *
 * Điểm (0…1) của một lý do đang dùng, câu đã bỏ dấu + chữ thường:
 *   + 0,60 nếu câu chứa một từ khoá `ai.keywords` (gói định khoản đã cài), +0,10 mỗi từ khoá khớp thêm (tối đa +0,20)
 *   + 0,30 × độ giống (Jaccard từ) với ví dụ gần nhất `ai.examples`
 *   + 0,20 × tỷ lệ từ của TÊN lý do có trong câu (lý do không thuộc gói nào vẫn được gợi ý)
 *   + 0,15 × tỷ lệ bút toán cũ của đơn vị có diễn giải giống câu (≥ 0,5) đã dùng lý do này (lịch sử, không chéo đơn vị)
 *   + 0,05 nếu lý do là mặc định của docType người gọi đưa
 *   × 0,30 nếu câu khớp một vế `ai.notFor` (phần trước "→")
 * Bằng nhau thì mã nhỏ trước. `confident` = điểm cao nhất ≥ minScore; không thì Cell hỏi lại bằng `askIf` (§6).
 */
import type { Db } from '../../db/client.js';
import type { PackItem, PostingPack } from './pack.js';

export interface ReasonSuggestion {
  code: string;
  name: string;
  kind: string;
  score: number;
  why: string[];
  askIf: string[];
}

type Hints = NonNullable<PostingPack['reasons'][number]['ai']>;

/** Bỏ dấu tiếng Việt, chữ thường, gom khoảng trắng. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const words = (s: string) => new Set(fold(s).split(' ').filter((w) => w.length > 1));
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
};
const contains = (text: string, phrase: string) => {
  const p = fold(phrase);
  return p.length > 1 && ` ${text} `.includes(` ${p} `);
};
const round = (x: number) => Math.round(x * 100) / 100;

/**
 * Gợi ý AI của mọi gói đang cài, theo mã lý do (gói cài sau thắng). Bỏ mục gói bị `conflict`: lý do cùng mã của đơn vị
 * đang khác lý do trong gói, gợi ý của gói không mô tả đúng lý do đó.
 */
async function hintsByReason(db: Db, tenantId: string): Promise<Map<string, Hints>> {
  const packs = await db.selectFrom('config_packs').select(['manifest', 'items']).where('tenant_id', '=', tenantId).where('status', '=', 'installed').orderBy('installed_at').execute();
  const out = new Map<string, Hints>();
  for (const p of packs) {
    const conflict = new Set((p.items as PackItem[]).filter((i) => i.kind === 'reason' && i.action === 'conflict').map((i) => i.code));
    for (const r of (p.manifest as PostingPack).reasons ?? []) if (r.ai && !conflict.has(r.code)) out.set(r.code, r.ai);
  }
  return out;
}

export async function suggestReasons(
  db: Db,
  tenantId: string,
  q: { text: string; kind?: string; docType?: string; limit?: number; minScore?: number },
): Promise<{ suggestions: ReasonSuggestion[]; confident: boolean; askIf: string[] }> {
  const text = fold(q.text);
  const tw = words(q.text);
  let rq = db.selectFrom('posting_reasons').select(['code', 'name', 'kind', 'flags']).where('tenant_id', '=', tenantId).where('is_active', '=', true);
  if (q.kind) rq = rq.where('kind', '=', q.kind);
  const [reasons, hints, history] = await Promise.all([
    rq.orderBy('code').execute(),
    hintsByReason(db, tenantId),
    // Lịch sử: 2.000 bút toán gần nhất có lý do (đủ để học thói quen đơn vị, không quét cả sổ).
    db.selectFrom('ledger_entries').select(['reason_code', 'description']).where('tenant_id', '=', tenantId).where('reason_code', 'is not', null)
      .where('status', '=', 'posted').where('is_reversal', '=', false).orderBy('id', 'desc').limit(2000).execute(),
  ]);
  const similar = history.filter((h) => jaccard(tw, words(h.description)) >= 0.5);
  const usedFor = new Map<string, number>();
  for (const h of similar) usedFor.set(h.reason_code!, (usedFor.get(h.reason_code!) ?? 0) + 1);

  const scored: ReasonSuggestion[] = reasons.map((r) => {
    const ai = hints.get(r.code) ?? {};
    const why: string[] = [];
    let s = 0;
    const hits = (ai.keywords ?? []).filter((k) => contains(text, k));
    if (hits.length) { s += 0.6 + 0.1 * Math.min(2, hits.length - 1); why.push(`khớp từ khoá ${hits.map((k) => `"${k}"`).join(', ')}`); }
    const ex = Math.max(0, ...(ai.examples ?? []).map((e) => jaccard(tw, words(e))));
    if (ex > 0) { s += 0.3 * ex; if (ex >= 0.3) why.push(`giống ví dụ của gói (${Math.round(ex * 100)}%)`); }
    const nw = words(r.name);
    const nameHit = nw.size ? [...nw].filter((w) => tw.has(w)).length / nw.size : 0;
    if (nameHit > 0) { s += 0.2 * nameHit; if (nameHit >= 0.5) why.push('khớp tên lý do'); }
    const used = usedFor.get(r.code) ?? 0;
    if (used) { s += 0.15 * (used / similar.length); why.push(`đơn vị đã dùng ${used} lần cho nội dung tương tự`); }
    if (q.docType && (r.flags as Record<string, unknown> | null)?.default === q.docType) { s += 0.05; why.push(`mặc định của ${q.docType}`); }
    const not = (ai.notFor ?? []).find((n) => contains(text, n.split('→')[0]!));
    if (not) { s *= 0.3; why.push(`không dùng cho: ${not}`); }
    return { code: r.code, name: r.name, kind: r.kind, score: round(Math.min(1, s)), why, askIf: ai.askIf ?? [] };
  });
  const suggestions = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (a.code < b.code ? -1 : 1)).slice(0, q.limit ?? 5);
  const top = suggestions[0];
  const confident = !!top && top.score >= (q.minScore ?? 0.5);
  return { suggestions, confident, askIf: confident ? [] : (top?.askIf ?? []) };
}

/**
 * Lý do mặc định cho các docType một module nộp (manifest `ledger.submits[].reasons`, BIZCITY-POSTING-TEMPLATE §7):
 * đơn vị chưa có lý do `flags.default = <khoá>` đang dùng → `ready: false` kèm gói gợi ý, thay vì để phiếu đầu tiên lỗi POSTING_FAILED.
 */
export async function reasonReadiness(db: Db, tenantId: string, submits: { docType: string; default?: string; suggestedPacks?: string[] }[]) {
  const rows = await db.selectFrom('posting_reasons').select(['code', 'flags']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const installed = new Set((await db.selectFrom('config_packs').select('pack_id').where('tenant_id', '=', tenantId).where('status', '=', 'installed').execute()).map((p) => p.pack_id));
  return submits.map((s) => {
    const key = s.default ?? s.docType;
    const hit = rows.find((r) => (r.flags as Record<string, unknown> | null)?.default === key);
    return {
      docType: s.docType, defaultKey: key, ready: !!hit, reasonCode: hit?.code ?? null,
      suggestedPacks: (s.suggestedPacks ?? []).map((id) => ({ id, installed: installed.has(id.split('@')[0]!) })),
    };
  });
}
