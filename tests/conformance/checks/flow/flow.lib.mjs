// [2026-11-03 10:40 PM Johnny Chu - Chu Hoàng Anh] FLOW — phần dùng chung của SC-FLOW-1 (bộ kiểm chuẩn) và scripts/nhan-viec.mjs: đọc bảng giữ chỗ, chuẩn hoá phạm vi, kiểm chồng chéo, bảng thứ dùng chung
/**
 * R-FLOW (docs/rules/RULE-FLOW.md): giữ chỗ vào main trước khi code. Mô-đun này chỉ có hàm thuần (không đọc đĩa, không gọi git):
 *   - SC-FLOW-1 (tests/conformance/checks/flow/flow.check.mjs) đưa nội dung CLAIMS.md qua ctx.repo — check chỉ đọc qua ctx.
 *   - scripts/nhan-viec.mjs đọc CLAIMS.md trên origin/main bằng git rồi dùng cùng các hàm này để kiểm nhánh đang làm.
 */

export const CLAIMS_FILE = 'docs/phases/CLAIMS.md';
export const STATUSES = ['đang làm', 'chờ merge'];
// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2 (R-FLOW-8): thêm cột "Việc" (mã S###-n dòng đó giữ); bảng việc sinh tự động được mọi nhánh sửa
const HEADER = ['Đợt', 'Việc', 'Phạm vi', 'Người nhận', 'Nhánh', 'Trạng thái', 'Từ ngày'];
const LEGACY_HEADER = ['Đợt', 'Phạm vi', 'Người nhận', 'Nhánh', 'Trạng thái', 'Từ ngày'];
const VIEC_RE = /^S\d{3}-\d+[a-z]?$/;

/** Tệp mọi nhánh được sửa dù không nằm trong phạm vi đã giữ chỗ: nhật ký thay đổi, bảng giữ chỗ, nhật ký checklist của phase, bảng việc sinh. */
export const ALWAYS_OK = [/^CHANGELOG\.md$/, /^docs\/phases\/CLAIMS\.md$/, /^docs\/phases\/[^/]+\/40-MASTER-CHECKLIST\.md$/, /^docs\/phases\/BANG-VIEC\.md$/, /^docs\/phases\/bang-viec\.json$/];

/**
 * Thứ dùng chung (R-FLOW-2): đổi `code` thì phải có chữ chốt ở `docs`. Giữ ngắn và có chủ đích — chỉ những chỗ mà hai phiên
 * chọn khác nhau sẽ phá nhau (API runtime của action, khuôn dùng chung, chính sách bằng chứng, luật lớp).
 */
export const SHARED = [
  { ten: 'API runtime của action / SDK', code: [/^packages\/platform\/src\/core\/actions\.ts$/, /^packages\/module-sdk\/src\//], docs: [/^docs\/contracts\/BIZCITY-ACTION-v1\.md$/, /^packages\/module-sdk\/API\.md$/] },
  { ten: 'Khuôn / mã dùng chung (packages/contracts)', code: [/^packages\/contracts\/src\//], docs: [/^docs\/(contracts|standard|adr|rules|huong-dan)\//] },
  { ten: 'Chính sách bằng chứng / nhật ký', code: [/^packages\/platform\/src\/core\/audit\.ts$/], docs: [/^docs\/contracts\/BIZCITY-EVIDENCE-v1\.md$/, /^docs\/adr\//] },
  { ten: 'Luật lớp và biên module', code: [/^tests\/conformance\/lib\/layers\.mjs$/], docs: [/^docs\/rules\/RULE-MODULE-BOUNDARY\.md$/] },
];

const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
const isRealDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Đọc bảng dưới mục `## Đang có`. Trả { rows, problems }; mỗi row: { line, dot, phamvi[], nguoi, nhanh, trangthai, trang, tu }.
 * `problems` là lỗi khuôn (không phải chồng phạm vi — việc đó ở `findOverlaps`).
 */
export function parseClaims(md) {
  const L = String(md ?? '').split(/\r?\n/);
  const problems = [];
  const rows = [];
  const start = L.findIndex((l) => /^##\s+Đang có\s*$/.test(l));
  if (start < 0) return { rows, problems: [{ line: null, message: 'CLAIMS.md thiếu mục "## Đang có"', key: 'no-section' }] };
  let i = start + 1;
  while (i < L.length && !L[i].trim().startsWith('|')) { if (/^##\s/.test(L[i])) break; i++; }
  if (i >= L.length || !L[i].trim().startsWith('|')) return { rows, problems: [{ line: start + 1, message: 'mục "Đang có" không có bảng', key: 'no-table' }] };
  const head = cellsOf(L[i]);
  // [2026-11-04 12:01 AM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2: vẫn đọc được bảng khuôn cũ (chưa có cột Việc) để nhan-viec.mjs đọc origin/main trong lúc chuyển khuôn; SC-FLOW-1 vẫn báo tiêu đề cũ
  const legacy = head.join('|') === LEGACY_HEADER.join('|');
  const width = legacy ? LEGACY_HEADER.length : HEADER.length;
  if (head.join('|') !== HEADER.join('|')) problems.push({ line: i + 1, message: `cột bảng phải là: ${HEADER.join(' | ')}${legacy ? ' (bảng đang theo khuôn cũ, thiếu cột Việc)' : ''}`, key: 'header' });
  i += 2; // bỏ dòng ngăn |---|
  for (; i < L.length && L[i].trim().startsWith('|'); i++) {
    const c0 = cellsOf(L[i]);
    const line = i + 1;
    if (c0.length !== width) { problems.push({ line, message: `dòng phải có ${width} ô, đang có ${c0.length}`, key: `cols:${line}` }); continue; }
    const c = legacy ? [c0[0], '—', ...c0.slice(1)] : c0;
    const [dot, viecRaw, phamviRaw, nguoi, nhanhRaw, trang, tu] = c;
    const viec = viecRaw === '—' || viecRaw === '-' ? [] : viecRaw.split(',').map((s) => s.replace(/`/g, '').trim()).filter(Boolean);
    const phamvi = ticks(phamviRaw);
    const nhanh = ticks(nhanhRaw)[0] ?? '';
    const trangthai = STATUSES.find((s) => trang.startsWith(s)) ?? '';
    const tag = dot.slice(0, 40);
    if (!dot) problems.push({ line, message: 'ô "Đợt" trống', key: `dot:${line}` });
    if (!viecRaw) problems.push({ line, message: `"${tag}": ô "Việc" trống — ghi mã S###-n (cách nhau dấu phẩy) hoặc —`, key: `viec:${tag}` });
    for (const v of viec) if (!VIEC_RE.test(v)) problems.push({ line, message: `"${tag}": "${v}" không phải mã việc S###-n`, key: `viec-khuon:${tag}:${v}` });
    if (!phamvi.length) problems.push({ line, message: `"${tag}": "Phạm vi" phải có ít nhất một đường dẫn trong dấu \`…\``, key: `phamvi:${tag}` });
    for (const p of phamvi) if (!normPath(p)) problems.push({ line, message: `"${tag}": phạm vi "${p}" quá rộng (cả kho) — ghi thư mục hoặc tệp cụ thể`, key: `rong:${tag}:${p}` });
    if (!nguoi) problems.push({ line, message: `"${tag}": ô "Người nhận" trống`, key: `nguoi:${tag}` });
    if (!nhanh) problems.push({ line, message: `"${tag}": "Nhánh" phải có tên nhánh trong dấu \`…\``, key: `nhanh:${tag}` });
    if (!trangthai) problems.push({ line, message: `"${tag}": "Trạng thái" phải bắt đầu bằng ${STATUSES.map((s) => `"${s}"`).join(' hoặc ')}`, key: `trangthai:${tag}` });
    if (!isRealDate(tu)) problems.push({ line, message: `"${tag}": "Từ ngày" phải là YYYY-MM-DD hợp lệ (đang là "${tu}")`, key: `tu:${tag}` });
    rows.push({ line, dot, viec: viec.filter((v) => VIEC_RE.test(v)), phamvi, nguoi, nhanh, trangthai, trang, tu });
  }
  return { rows, problems };
}

/** Chuẩn hoá phạm vi về đường dẫn thư mục / tệp: bỏ `/**`, cắt ở dấu `*` đầu tiên. Rỗng = cả kho (không hợp lệ). */
export function normPath(p) {
  let s = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  const star = s.indexOf('*');
  if (star >= 0) {
    const before = s.slice(0, star);
    s = before.endsWith('/') ? before : before.includes('/') ? before.slice(0, before.lastIndexOf('/')) : '';
  }
  return s.replace(/\/+$/, '');
}

/** Hai đường dẫn đã chuẩn hoá chồng nhau: trùng, hoặc cái này chứa cái kia. */
export const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/** Tệp có nằm trong một trong các phạm vi không. */
export function inScope(file, phamvi) {
  return phamvi.map(normPath).some((n) => n && (file === n || file.startsWith(`${n}/`)));
}

/** R-FLOW-3: hai dòng không được chồng phạm vi; một nhánh một dòng. Trả danh sách vấn đề. */
export function findOverlaps(rows) {
  const out = [];
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const A = rows[a];
      const B = rows[b];
      if (A.nhanh && A.nhanh === B.nhanh) out.push({ line: B.line, message: `nhánh \`${A.nhanh}\` có hai dòng ("${A.dot.slice(0, 30)}" và "${B.dot.slice(0, 30)}") — một nhánh một dòng`, key: `trung-nhanh:${A.nhanh}` });
      for (const pa of A.phamvi) {
        for (const pb of B.phamvi) {
          const na = normPath(pa);
          const nb = normPath(pb);
          if (na && nb && overlaps(na, nb)) out.push({ line: B.line, message: `"${A.dot.slice(0, 30)}" và "${B.dot.slice(0, 30)}" chồng phạm vi: ${pa} ~ ${pb} (R-FLOW-3: một phạm vi một người)`, key: `chong:${A.nhanh}:${B.nhanh}:${na}:${nb}` });
        }
      }
    }
  }
  return out;
}

/** Toàn bộ kiểm tĩnh của bảng: khuôn + chồng phạm vi. */
export function checkRegistry(md) {
  const { rows, problems } = parseClaims(md);
  return { rows, problems: [...problems, ...findOverlaps(rows)] };
}

/** Các mục "thứ dùng chung" mà danh sách tệp đổi có đụng tới: [{ ten, code[], docs[] }] (docs = mẫu tài liệu chốt). */
export function sharedTouched(changed) {
  const out = [];
  for (const s of SHARED) {
    const code = changed.filter((f) => s.code.some((re) => re.test(f)));
    if (code.length) out.push({ ten: s.ten, code, docs: s.docs });
  }
  return out;
}

/** Chỉ tài liệu (docs/**, *.md, CHANGELOG): không cần giữ chỗ (ngoại lệ R-FLOW). */
export const isDocsOnly = (changed) => changed.length > 0 && changed.every((f) => f.startsWith('docs/') || /\.md$/.test(f));
