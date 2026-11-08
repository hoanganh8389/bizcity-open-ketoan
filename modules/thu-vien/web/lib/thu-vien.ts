/**
 * Logic thuần của màn Kho thư viện (HT14) — không gọi API, không React; test ở modules/thu-vien/test/.
 * Khuôn dữ liệu theo bizcity_library@1 (docs/contracts/BIZCITY-LIBRARY-v1.md) và API core.library.* (docs/api/16-thu-vien.md).
 */

export interface LibrarySummary {
  id: string;
  kind: string;
  title: string;
  version: string;
  released: string;
  contentHash: string;
  owner: string;
  count: number;
  verified: number;
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: string; value?: unknown };

export interface LibraryRule {
  code: string;
  level: 'block' | 'warn' | 'info';
  title: string;
  why: string;
  fix?: string;
  when: Condition;
  basis?: { ref: string; verified: boolean }[];
}

export interface LibraryEnvelope {
  id: string;
  kind: string;
  title: string;
  description: string;
  version: string;
  released: string;
  contentHash: string;
  owner: string;
  sources: { title: string; kind: string; date?: string; note?: string }[];
  generatedBy?: string;
  codePrefix?: string;
  selector: { value: string; label: string; search: string[]; group?: string; filters?: { field: string; label: string }[]; showValueAt?: boolean };
  rules?: LibraryRule[];
  changelog: { version: string; date: string; hash: string; notes: string }[];
}

export const KIND_LABEL: Record<string, string> = {
  param: 'tham số', calendar: 'lịch', 'code-list': 'danh mục mã', 'permission-template': 'mẫu vai trò', 'business-map': 'sườn nghiệp vụ',
  'rule-set': 'bộ luật kiểm', 'report-list': 'danh sách báo cáo', 'import-template': 'mẫu nhập', 'master-sample': 'dữ liệu gốc mẫu',
};

export const LEVEL_LABEL: Record<LibraryRule['level'], { text: string; badge: string }> = {
  block: { text: '✘ chặn', badge: 'badge-bad' },
  warn: { text: '⚠ cảnh báo', badge: 'badge-warn' },
  info: { text: 'ℹ nhắc', badge: 'badge-info' },
};

const OP_TEXT: Record<string, string> = {
  eq: 'là', ne: 'không là', in: 'thuộc', nin: 'không thuộc', gt: '>', gte: '≥', lt: '<', lte: '≤', exists: 'có giá trị', missing: 'để trống', matches: 'khớp mẫu',
};

/** Tên trường cho người đọc: `input.op` → "ô nhập · op", `item.payload.kind` → "mục · payload.kind". */
export function fieldText(field: string): string {
  const [root, ...rest] = field.split('.');
  return `${root === 'input' ? 'ô nhập' : root === 'item' ? 'mục' : root} · ${rest.join('.')}`;
}

const valueText = (v: unknown): string => (Array.isArray(v) ? v.map((x) => JSON.stringify(x)).join(', ') : JSON.stringify(v));

/** Điều kiện khai báo của luật đọc bằng lời (tab Luật). */
export function conditionText(c: Condition): string {
  if ('all' in c) return c.all.map(conditionText).join(' và ');
  if ('any' in c) return `(${c.any.map(conditionText).join(' hoặc ')})`;
  if ('not' in c) return `không phải (${conditionText(c.not)})`;
  const op = OP_TEXT[c.op] ?? c.op;
  return c.op === 'exists' || c.op === 'missing' ? `${fieldText(c.field)} ${op}` : `${fieldText(c.field)} ${op} ${valueText(c.value)}`;
}

/** Số ngày từ ngày phát hành tới hôm nay (độ tươi). */
export function freshnessDays(released: string, today: string): number {
  const a = Date.parse(`${released}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Thẻ sức khoẻ của tab Tổng quan (lớp "thư viện" của 26 §9 — chưa có số sử dụng tới B2). */
export function healthSummary(list: LibrarySummary[], today: string) {
  const items = list.reduce((a, l) => a + l.count, 0);
  const verified = list.reduce((a, l) => a + l.verified, 0);
  const stale = list.filter((l) => freshnessDays(l.released, today) > 180).length;
  const unverifiedLibs = list.filter((l) => l.verified < l.count).length;
  return { libraries: list.length, items, verified, verifiedPct: items ? Math.round((verified * 1000) / items) / 10 : 0, stale, unverifiedLibs };
}

/** Một thư viện cần chú ý gì (thẻ Danh sách, bảng Tổng quan). */
export function attention(l: LibrarySummary, today: string): string[] {
  const out: string[] = [];
  if (l.verified === 0) out.push('chưa mục nào được duyệt');
  else if (l.verified < l.count) out.push(`${l.count - l.verified} mục chưa duyệt`);
  if (freshnessDays(l.released, today) > 180) out.push('bản cuối đã hơn 6 tháng');
  return out;
}

/** Giá trị cho người đọc: số theo kiểu Việt Nam, còn lại chuỗi. */
export const showValue = (v: unknown): string => (typeof v === 'number' ? v.toLocaleString('vi-VN') : v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Băm rút gọn để hiện. */
export const shortHash = (h: string): string => (h.startsWith('sha256:') ? `${h.slice(7, 13)}…${h.slice(-4)}` : h);

/** Ô "Kiểm thử": chuỗi người dán → input của core.library.validate. Số thì gửi số; `{…}` thì gửi đối tượng. */
export function parseTestInput(code: string, rawValue: string, override: boolean): string | Record<string, unknown> {
  const c = code.trim();
  const v = rawValue.trim();
  if (!v && !override) return c;
  const out: Record<string, unknown> = { code: c };
  if (v) {
    if (/^-?\d+([.,]\d+)?$/.test(v)) out.value = Number(v.replace(',', '.'));
    else if (v.startsWith('{')) { try { out.fields = JSON.parse(v); } catch { out.value = v; } }
    else out.value = v;
  }
  if (override) out.override = true;
  return out;
}

/** Số liệu sử dụng (core.library.usage) — khuôn trả về của API. */
export interface UsageCounts { pass: number; warn: number; block: number }
export interface UsageReport {
  from: string;
  to: string;
  total: UsageCounts;
  byLibrary: (UsageCounts & { libraryId: string })[];
  bySource: (UsageCounts & { source: string; libraryId: string; deprecated: number })[];
  topFindings: { code: string; libraryId: string; outcome: 'pass' | 'warn' | 'block'; count: number }[];
  unknown: { libraryId: string; source: string; count: number }[];
}

export const usageTotal = (u: UsageCounts): number => u.pass + u.warn + u.block;

/** Tỉ lệ phần trăm một chữ số thập phân; không có lượt → null (hiện "—", không vẽ 0 % giả). */
export function usagePct(part: number, u: UsageCounts): number | null {
  const t = usageTotal(u);
  return t ? Math.round((part * 1000) / t) / 10 : null;
}

/**
 * Tình trạng một nguồn trên số liệu 30 ngày (26 §9, lớp "sử dụng"). Kết luận ĐẠT / KHÔNG ĐẠT theo module cần độ phủ trường
 * khai trong manifest — có ở B5; ở đây chỉ nói điều số liệu chứng minh được.
 */
export function sourceStatus(r: UsageCounts & { deprecated: number }): { badge: 'badge-ok' | 'badge-warn' | 'badge-bad'; text: string } {
  const blockPct = usagePct(r.block, r) ?? 0;
  if (blockPct >= 1) return { badge: 'badge-bad', text: `chặn ${blockPct} % lượt` };
  if (r.deprecated > 0) return { badge: 'badge-warn', text: `dùng mã ngừng ${r.deprecated} lượt` };
  if (r.warn > 0) return { badge: 'badge-warn', text: `cảnh báo ${usagePct(r.warn, r)} % lượt` };
  return { badge: 'badge-ok', text: 'qua thư viện' };
}

/** Lần xác nhận / gỡ mới nhất của một mục ở đơn vị (core.library.attestations, B3a). */
export interface Attestation { code: string; attested: boolean; valid: boolean; version: string; itemHash: string; by: string; at: string; reason: string; evidenceId: string }

/** Nhãn tình trạng xác nhận của đơn vị. */
export function attestationState(a: Attestation | undefined): { badge: 'badge-ok' | 'badge-warn' | 'badge-gray'; text: string } {
  if (!a) return { badge: 'badge-gray', text: 'chưa xác nhận' };
  if (!a.attested) return { badge: 'badge-gray', text: 'đã gỡ xác nhận' };
  if (!a.valid) return { badge: 'badge-warn', text: `hết hiệu lực — mục đã đổi sau bản ${a.version}` };
  return { badge: 'badge-ok', text: 'đã đối chiếu' };
}

/** Mọi căn cứ của một mục: căn cứ của mục + căn cứ của từng khoảng giá trị (không lặp). */
export function basisList(item: Record<string, unknown>): { ref: string; key?: string; verified: boolean }[] {
  type B = { ref: string; key?: string; verified: boolean };
  const own = (item.basis as B[] | undefined) ?? [];
  const eff = ((item.effective as { basis?: B[] }[] | undefined) ?? []).flatMap((e) => e.basis ?? []);
  const seen = new Set<string>();
  return [...own, ...eff].filter((b) => { const k = `${b.key ?? ''}|${b.ref}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
