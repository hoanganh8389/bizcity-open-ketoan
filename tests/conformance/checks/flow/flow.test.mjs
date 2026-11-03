// [2026-11-03 10:50 PM Johnny Chu - Chu Hoàng Anh] FLOW — thử phần logic thuần của R-FLOW (đọc bảng giữ chỗ, phạm vi, chồng chéo, thứ dùng chung). Chạy: node --test tests/conformance/checks/flow/flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRegistry, findOverlaps, inScope, isDocsOnly, normPath, overlaps, parseClaims, sharedTouched } from './flow.lib.mjs';
import { buildBoard, parseAllChecklists, parseChecklist, renderJson, renderMd, viecProblems } from './board.lib.mjs';

// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2: khuôn CLAIMS.md có cột Việc (mặc định — trong các ca cũ)
const HEAD = '| Đợt | Việc | Phạm vi | Người nhận | Nhánh | Trạng thái | Từ ngày |\n|---|---|---|---|---|---|---|\n';
const doc = (...rows) => `# x\n\n## Đang có\n\n${HEAD}${rows.join('\n')}\n`;
const row = (dot, phamvi, nguoi, nhanh, trang, tu, viec = '—') => `| ${dot} | ${viec} | ${phamvi} | ${nguoi} | ${nhanh} | ${trang} | ${tu} |`;
const OK_ROW = row('A', '`a/b/**`; `c.ts`', 'x', '`feat/a` (ghi chú)', 'đang làm', '2026-11-03');

test('đọc dòng đúng khuôn: phạm vi, nhánh (bỏ ghi chú), trạng thái có đuôi', () => {
  const { rows, problems } = parseClaims(doc(row('A', '`a/b/**`; `c.ts`', 'x', '`feat/a` (tạo sau)', 'chờ merge — đang gộp', '2026-11-03')));
  assert.deepEqual(problems, []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].phamvi, ['a/b/**', 'c.ts']);
  assert.equal(rows[0].nhanh, 'feat/a');
  assert.equal(rows[0].trangthai, 'chờ merge');
});

test('báo lỗi khuôn: thiếu mục, trạng thái lạ, ngày sai, phạm vi trống, phạm vi cả kho, thiếu nhánh', () => {
  assert.match(parseClaims('# x\n').problems[0].message, /thiếu mục/);
  const bad = parseClaims(doc(
    row('A', '`a/**`', 'x', '`b/a`', 'đã xong', '2026-11-03'),
    row('B', '`a/**`', 'x', '`b/b`', 'đang làm', '2026-13-40'),
    row('C', 'không có dấu ngoặc', 'x', '`b/c`', 'đang làm', '2026-11-03'),
    row('D', '`**`', 'x', '`b/d`', 'đang làm', '2026-11-03'),
    row('E', '`e/**`', 'x', 'không nhánh', 'đang làm', '2026-11-03'),
  )).problems.map((p) => p.message).join('\n');
  assert.match(bad, /Trạng thái/);
  assert.match(bad, /Từ ngày/);
  assert.match(bad, /ít nhất một đường dẫn/);
  assert.match(bad, /quá rộng/);
  assert.match(bad, /Nhánh/);
});

test('sai tiêu đề cột và sai số ô', () => {
  const md = '## Đang có\n\n| Đợt | Phạm vi |\n|---|---|\n| A | `a` |\n';
  assert.match(parseClaims(md).problems.map((p) => p.message).join('\n'), /cột bảng phải là/);
  assert.match(parseClaims(doc('| A | `a` | x |')).problems[0].message, /7 ô/);
});

// [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — FLOW-2: cột Việc, đọc checklist, dựng bảng việc (R-FLOW-8)
test('cột Việc: đọc mã, — là rỗng, mã sai khuôn bị báo', () => {
  const ok = parseClaims(doc(row('A', '`a/**`', 'x', '`feat/a`', 'đang làm', '2026-11-03', 'S014-14, S010-1a')));
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.rows[0].viec, ['S014-14', 'S010-1a']);
  assert.deepEqual(parseClaims(doc(OK_ROW)).rows[0].viec, []);
  assert.match(parseClaims(doc(row('A', '`a/**`', 'x', '`feat/a`', 'đang làm', '2026-11-03', 'việc 1'))).problems[0].message, /không phải mã việc/);
});

const CK = (rows) => `# x\n\n| ID | Việc | Ưu tiên | Trạng thái |\n|---|---|---|---|\n${rows.join('\n')}\n`;

test('đọc checklist: dấu \\| trong ô, dòng chú thích giữa bảng, hậu tố chữ cái, báo lỗi khuôn', () => {
  const md = CK(['| S001-1 | Việc **một** `a \\| b` | P0 | ✅ xong |', '<!-- [dấu] -->', '| S001-1a | Việc hai | P1 | ☐ |', '| S001-2 | thiếu ô | ✅ |', '| S001-3 | không ký hiệu | P2 | xong rồi |', '| S001-1 | trùng | P0 | ⏸ chủ để sau |']);
  const { items, problems } = parseChecklist(md, 'docs/phases/PHASE-001-X/40-MASTER-CHECKLIST.md');
  assert.deepEqual(items.map((i) => [i.id, i.status]), [['S001-1', 'done'], ['S001-1a', 'todo'], ['S001-3', 'unknown'], ['S001-1', 'paused']]);
  assert.equal(items[0].title, 'Việc một a | b');
  const msg = problems.map((p) => p.key).join(' ');
  assert.match(msg, /cot:S001-2/);
  assert.match(msg, /ky-hieu:S001-3/);
  assert.match(msg, /trung:S001-1/);
});

test('bảng việc: cột theo giữ chỗ / ký hiệu; mã lạ và mã giữ hai lần bị báo; cùng nguồn ra cùng tệp', () => {
  const files = [{ path: 'docs/phases/PHASE-002-Y/40-MASTER-CHECKLIST.md', text: CK(['| S002-2 | b | P1 | ⛔ chờ chủ |', '| S002-1 | a | P0 | ☐ |', '| S002-3 | c | P0 | 🟡 |']) }];
  const { items } = parseAllChecklists(files);
  const claims = parseClaims(doc(row('A', '`a/**`', 'x', '`feat/a`', 'chờ merge', '2026-11-03', 'S002-1'), row('B', '`b/**`', 'y', '`feat/b`', 'đang làm', '2026-11-03', 'S002-1, S009-9')));
  const board = buildBoard(items, claims.rows);
  assert.deepEqual(board.items.map((i) => [i.id, i.column]), [['S002-1', 'merging'], ['S002-2', 'blocked'], ['S002-3', 'partial']]);
  assert.equal(board.columns.find((c) => c.key === 'merging').count, 1);
  const keys = viecProblems(claims.rows, items).map((p) => p.key);
  assert.deepEqual(keys.sort(), ['viec-hai:S002-1', 'viec-la:S009-9']);
  assert.equal(renderJson(buildBoard(items, claims.rows)), renderJson(board));
  assert.equal(renderMd(board), renderMd(buildBoard([...items].reverse(), claims.rows)));
  assert.doesNotMatch(renderJson(board), /20\d\d-\d\d-\d\dT/);
});

test('chuẩn hoá phạm vi', () => {
  assert.equal(normPath('apps/api/**'), 'apps/api');
  assert.equal(normPath('apps/api/src/modules/partners/**'), 'apps/api/src/modules/partners');
  assert.equal(normPath('scripts/nhan-viec.mjs'), 'scripts/nhan-viec.mjs');
  assert.equal(normPath('foo/bar*.ts'), 'foo');
  assert.equal(normPath('**'), '');
  assert.equal(normPath('./docs/'), 'docs');
});

test('chồng phạm vi: thư mục chứa tệp thì chồng; anh em có chung tiền tố tên thì KHÔNG', () => {
  assert.ok(overlaps('a/b', 'a/b/c.ts'));
  assert.ok(overlaps('a/b', 'a/b'));
  assert.ok(!overlaps('a/partners', 'a/partners-extra'));
  assert.ok(!overlaps('a/b', 'a/c'));
});

test('findOverlaps: hai dòng chồng, một nhánh hai dòng; dòng rời nhau thì sạch', () => {
  const rows = (...r) => parseClaims(doc(...r)).rows;
  const chong = findOverlaps(rows(row('A', '`a/b/**`', 'x', '`feat/a`', 'đang làm', '2026-11-03'), row('B', '`a/b/c.ts`', 'y', '`feat/b`', 'đang làm', '2026-11-03')));
  assert.equal(chong.length, 1);
  assert.match(chong[0].message, /chồng phạm vi/);
  const trung = findOverlaps(rows(row('A', '`a/**`', 'x', '`feat/a`', 'đang làm', '2026-11-03'), row('B', '`b/**`', 'y', '`feat/a`', 'đang làm', '2026-11-03')));
  assert.match(trung[0].message, /một nhánh một dòng/);
  assert.deepEqual(findOverlaps(rows(row('A', '`a/**`', 'x', '`feat/a`', 'đang làm', '2026-11-03'), row('B', '`b/**`', 'y', '`feat/b`', 'đang làm', '2026-11-03'))), []);
});

test('tệp có nằm trong phạm vi', () => {
  const p = ['scripts/nhan-viec.mjs', 'tests/conformance/checks/flow/**'];
  assert.ok(inScope('scripts/nhan-viec.mjs', p));
  assert.ok(inScope('tests/conformance/checks/flow/flow.lib.mjs', p));
  assert.ok(!inScope('scripts/so-tiep-theo.mjs', p));
  assert.ok(!inScope('tests/conformance/checks/flowx/a.mjs', p));
});

test('thứ dùng chung: runtime action, contracts, bằng chứng, lớp; tệp thường thì không', () => {
  const t = sharedTouched(['packages/platform/src/core/actions.ts', 'packages/contracts/src/x.ts', 'apps/api/src/modules/a.ts']);
  assert.deepEqual(t.map((x) => x.ten).sort(), ['API runtime của action / SDK', 'Khuôn / mã dùng chung (packages/contracts)']);
  assert.deepEqual(sharedTouched(['apps/api/src/modules/a.ts', 'README.md']), []);
  assert.equal(sharedTouched(['tests/conformance/lib/layers.mjs'])[0].ten, 'Luật lớp và biên module');
});

test('chỉ tài liệu', () => {
  assert.ok(isDocsOnly(['docs/a.md', 'AGENTS.md', 'CHANGELOG.md']));
  assert.ok(!isDocsOnly(['docs/a.md', 'scripts/x.mjs']));
  assert.ok(!isDocsOnly([]));
});

test('bảng CLAIMS.md thật trong kho đúng khuôn và không chồng', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const md = fs.readFileSync(path.resolve(here, '../../../../docs/phases/CLAIMS.md'), 'utf8');
  assert.deepEqual(checkRegistry(md).problems, []);
});

test('mẫu đúng khuôn đi qua checkRegistry', () => {
  assert.deepEqual(checkRegistry(doc(OK_ROW)).problems, []);
});
