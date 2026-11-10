// [2026-11-11 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): tính tiêu chí hoàn thiện T1..T6 của công cụ nhà phát triển TỪ REPO — dùng chung cho scripts/cong-cu-dev.mjs (sinh) và SC-DEV-2 (kiểm)
/**
 * Hàm thuần trên bộ đọc repo `r` = { read(rel) → string|null, exists(rel) → bool, files({ under, ext }) → rel[] }.
 * Mỗi tiêu chí trả { state: 'co' | 'chua', ev: string } — `ev` là bằng chứng (đường dẫn / lý do), không ai gõ trạng thái (R-CONT-7).
 *   T1 API riêng       mọi đường API khai trong `api[]` có trong mã (apps/api/src, packages/kernel/src); không có API → chua
 *   T2 Test API        có tệp apps/api/test/*.test.ts gọi một đường API của công cụ
 *   T3 Nguồn chưa bật  công cụ đọc nguồn ngoài CSDL (Loki, Tempo, Prometheus…) thì màn dùng SourceOff (nói "chưa bật", không báo lỗi kỹ thuật)
 *   T4 Hướng dẫn riêng helpKey của màn khác "ban-dieu-tra" và có docs/huong-dan/<helpKey>.md
 *   T5 Liên kết chéo   thư mục màn có liên kết sang công cụ dev khác (/dev/<khác>)
 *   T6 Nhiều đơn vị    không khai `singleInstall` (chỉ chạy ở bản cài một đơn vị)
 */
export const CRITERIA = [
  ['T1', 'Có API riêng, chỉ đọc'],
  ['T2', 'Có test API'],
  ['T3', 'Nguồn chưa bật thì nói cách bật'],
  ['T4', 'Có hướng dẫn riêng'],
  ['T5', 'Liên kết chéo sang công cụ khác'],
  ['T6', 'Chạy ở bản cài nhiều đơn vị'],
];

const API_SRC = ['apps/api/src', 'packages/kernel/src'];
const pathOf = (api) => api.replace(/^[A-Z]+\s+/, '').trim();
/** Phần cố định của đường (trước tham số :x) để tìm trong test. */
const stemOf = (p) => p.split('/:')[0].replace(/\/$/, '');

export function computeCriteria(r, tool) {
  const out = {};
  const srcText = () => API_SRC.flatMap((u) => r.files({ under: [u], ext: ['.ts'] })).map((f) => r.read(f) ?? '').join('\n');
  // T1
  if (!tool.api?.length) out.T1 = { state: 'chua', ev: 'không có API riêng' };
  else {
    const src = srcText();
    const miss = tool.api.filter((a) => !src.includes(`'${pathOf(a)}'`) && !src.includes(`"${pathOf(a)}"`));
    out.T1 = miss.length ? { state: 'chua', ev: `không thấy trong mã: ${miss.join(', ')}` } : { state: 'co', ev: `${tool.api.length} đường API` };
  }
  // T2
  const stems = (tool.api ?? []).map((a) => stemOf(pathOf(a)));
  const test = stems.length ? r.files({ under: ['apps/api/test'], ext: ['.test.ts'] }).find((f) => stems.some((s) => (r.read(f) ?? '').includes(s))) : null;
  out.T2 = test ? { state: 'co', ev: test } : { state: 'chua', ev: stems.length ? 'không test nào gọi API của công cụ' : 'không có API để test' };
  // T3
  const pageDir = tool.page.replace(/\/[^/]+$/, '');
  const pageText = r.files({ under: [pageDir], ext: ['.tsx', '.ts'] }).map((f) => r.read(f) ?? '').join('\n');
  const external = (tool.sources ?? []).filter((s) => s !== 'CSDL');
  if (!external.length) out.T3 = { state: 'co', ev: 'chỉ đọc CSDL, không phụ thuộc nguồn ngoài' };
  else out.T3 = pageText.includes('SourceOff') ? { state: 'co', ev: `${external.join(', ')}: màn dùng SourceOff` } : { state: 'chua', ev: `${external.join(', ')}: màn chưa nói "chưa bật"` };
  // T4
  const key = /helpKey="([^"]+)"/.exec(r.read(tool.page) ?? '')?.[1];
  if (!key) out.T4 = { state: 'chua', ev: 'màn không có helpKey' };
  else if (key === 'ban-dieu-tra') out.T4 = { state: 'chua', ev: 'dùng chung hướng dẫn ban-dieu-tra' };
  else out.T4 = r.exists(`docs/huong-dan/${key}.md`) ? { state: 'co', ev: `docs/huong-dan/${key}.md` } : { state: 'chua', ev: `thiếu docs/huong-dan/${key}.md` };
  // T5
  const self = tool.path.replace(/^\/dev\//, '');
  const others = new Set([...pageText.matchAll(/['"`]\/dev\/([a-z-]+)/g)].map((m) => m[1]).filter((x) => x !== self));
  out.T5 = others.size ? { state: 'co', ev: `sang ${[...others].sort().map((x) => `/dev/${x}`).join(', ')}` } : { state: 'chua', ev: 'không liên kết sang công cụ khác' };
  // T6
  out.T6 = tool.singleInstall ? { state: 'chua', ev: 'chỉ chạy ở bản cài một đơn vị' } : { state: 'co', ev: 'không giới hạn bản cài' };
  return out;
}

/** Mục menu Nhà phát triển (apps/web/src/phan-he/dev/menu.ts): [{ code, path }]. */
export function menuItems(text) {
  return [...(text ?? '').matchAll(/path:\s*'(\/dev\/[a-z-]+)',\s*code:\s*'(DEV\d+)'/g)].map((m) => ({ path: m[1], code: m[2] }));
}
