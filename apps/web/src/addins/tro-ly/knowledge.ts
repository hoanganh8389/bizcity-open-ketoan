/**
 * Kho tri thức của Trợ lý (tầng 1, không AI) — dùng chung cho trang TI12 và robot nổi góc màn hình:
 *   - hỏi đáp thường gặp: docs/tro-ly/*.md, mỗi mục "## Câu hỏi" + câu trả lời;
 *   - dữ liệu huấn luyện: câu hỏi / hướng dẫn do người dùng thêm ở thẻ "Dữ liệu huấn luyện" (máy chủ lưu tệp JSONL);
 *   - màn chức năng: menu (tên, mã, nhóm);
 *   - hướng dẫn sử dụng: docs/huong-dan/*.md.
 * Tìm theo từ khoá đã bỏ dấu, chấm điểm theo số từ trùng (câu hỏi / từ khoá / tên màn nặng hơn phần nội dung).
 */
import { useQuery } from '@tanstack/react-query';
import { Marked } from 'marked';
import type { MenuItem } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { getGuide, listGuides } from '@/help/guides';
import { flattenMenu } from '@/layout/menu';

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export interface FaqItem { q: string; a: string; /** Mã màn liên quan (chỉ mục huấn luyện). */ screens?: string[]; /** Có = mục huấn luyện. */ id?: string; kind?: 'faq' | 'guide'; keywords?: string[] }

const faqFiles = import.meta.glob('../../../../../docs/tro-ly/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const FAQ: FaqItem[] = Object.values(faqFiles).flatMap((md) => md.split(/^## /m).slice(1).map((sec) => {
  const nl = sec.indexOf('\n');
  return { q: sec.slice(0, nl).trim(), a: sec.slice(nl + 1).trim() };
}));

export interface TrainingEntry {
  id: string; kind: 'faq' | 'guide'; question: string; keywords: string[]; answer: string; screens: string[]; active: boolean;
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string;
}
export const KNOWLEDGE_URL = '/api/v1/addins/tro-ly/knowledge';

/** Toàn bộ mục huấn luyện (kể cả đang tắt). Người không có quyền đọc danh mục: danh sách rỗng. */
export function useTraining() {
  return useQuery({ queryKey: ['tro-ly-knowledge'], queryFn: () => api.get<TrainingEntry[]>(KNOWLEDGE_URL), staleTime: 60_000, retry: false });
}
export const trainedFaq = (list: TrainingEntry[] | undefined): FaqItem[] => (list ?? []).filter((x) => x.active)
  .map((x) => ({ q: x.question, a: x.answer, screens: x.screens, id: x.id, kind: x.kind, keywords: x.keywords }));

const GUIDES = listGuides().map((g) => ({ ...g, body: getGuide(g.key) ?? '' }));

/** Từ có nghĩa của câu hỏi (bỏ dấu, bỏ từ quá ngắn / từ hỏi thường gặp). */
const STOP = new Set(['la', 'gi', 'sao', 'nao', 'the', 'thi', 'co', 'khong', 'ko', 'k', 'va', 'cua', 'cho', 'de', 'o', 'nhu', 'muon', 'lam', 'minh', 'toi', 'ban', 'oi', 'nhi', 'a', 'ma', 'duoc', 'dc', 'xem', 'o dau']);
export function terms(q: string): string[] {
  return [...new Set(fold(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)))];
}
const score = (ts: string[], strong: string, weak = '') => {
  const s = fold(strong);
  const w = fold(weak);
  return ts.reduce((n, t) => n + (s.includes(t) ? 3 : 0) + (w.includes(t) ? 1 : 0), 0);
};

/** Điểm một mục hỏi đáp: từ khoá huấn luyện trùng nguyên cụm trong câu hỏi được cộng đậm. */
function faqScore(ts: string[], raw: string, x: FaqItem) {
  const kw = x.keywords ?? [];
  const phrase = kw.reduce((n, k) => { const f = fold(k).trim(); return n + (f.length >= 2 && raw.includes(f) ? 6 : 0); }, 0);
  return phrase + score(ts, `${x.q} ${kw.join(' ')}`, x.a) + (x.id ? 1 : 0);
}

/** Tìm hỏi đáp: tài liệu soạn sẵn + mục huấn luyện (truyền vào `extra`). */
export function searchFaq(q: string, limit = 3, extra: FaqItem[] = []) {
  const ts = terms(q);
  if (!ts.length) return [];
  const raw = fold(q);
  return [...extra, ...FAQ].map((x) => ({ ...x, s: faqScore(ts, raw, x) })).filter((x) => x.s >= Math.min(3, ts.length * 2)).sort((a, b) => b.s - a.s).slice(0, limit);
}

export function searchScreens(menu: MenuItem[], q: string, limit = 6) {
  const ts = terms(q);
  const raw = fold(q.trim());
  if (!ts.length && !raw) return [];
  return flattenMenu(menu)
    .map((x) => ({ ...x, s: (x.code && fold(x.code) === raw.replace(/\s/g, '') ? 10 : 0) + score(ts, `${x.label} ${x.code ?? ''}`, x.group) }))
    .filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, limit);
}

/** Màn theo danh sách mã (ACC14, BH02…) — nút mở màn của mục huấn luyện. */
export function screensByCode(menu: MenuItem[], codes: string[] = []) {
  if (!codes.length) return [];
  const want = new Set(codes.map((c) => c.trim().toUpperCase()));
  return flattenMenu(menu).filter((x) => x.code && want.has(x.code.toUpperCase()));
}

export function searchGuides(q: string, limit = 3) {
  const ts = terms(q);
  if (!ts.length) return [];
  return GUIDES.map((g) => ({ key: g.key, title: g.title, body: g.body, s: score(ts, g.title, g.body) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, limit);
}

/* ---------- Hiển thị markdown an toàn ----------
 * Câu trả lời huấn luyện do người dùng nhập: không cho HTML thô (hiện nguyên văn), liên kết / ảnh chỉ nhận
 * http(s) hoặc đường dẫn trong phần mềm (bắt đầu bằng "/"), liên kết mở thẻ mới. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const okUrl = (u: string) => /^(https?:\/\/|\/(?!\/))/i.test(u.trim());
const safeMarked = new Marked({
  renderer: {
    html({ text }) { return esc(text); },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return okUrl(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>` : inner;
    },
    image({ href, title, text }) {
      return okUrl(href) ? `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy"${title ? ` title="${esc(title)}"` : ''}>` : esc(text);
    },
  },
});
export const safeMarkdown = (md: string) => safeMarked.parse(md, { async: false }) as string;
