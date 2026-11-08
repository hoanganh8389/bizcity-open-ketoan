#!/usr/bin/env node
// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a (B3a, PHASE-030 · 26 §6): sinh thư viện vn.can-cu-phap-ly từ vn-rulepacks/registry/legal-sources.json + LEGAL_BASES (khoá cũ thành bí danh) — không sửa hai sổ nguồn
/**
 *   node libraries/vn.can-cu-phap-ly/build.mjs          sinh lại library.json
 *   node libraries/vn.can-cu-phap-ly/build.mjs --check  chỉ so
 * Mã mục = id của sổ (vd vn.law.88-2015-qh13). Bí danh: số hiệu văn bản và khoá LEGAL_BASES (LKT, TT99, NOI-BO…) — để
 * basis[].key của mọi thư viện trỏ được bằng khoá cũ. verified = review.status === 'approved' của sổ (hôm nay mọi mục 'pending').
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = '../../packages/vn-rulepacks/registry/legal-sources.json';
export const BASES = '../../packages/contracts/src/legal-basis.ts';
/** Khoá LEGAL_BASES không khớp được bằng số hiệu → id trong sổ (ghi rõ để người duyệt thấy). */
const MANUAL = { VAS02: 'vn.decision.149-2001-qd-btc' };
export const INTERNAL_CODE = 'noi-bo';
const KIND = { law: 'luật', decree: 'nghị định', circular: 'thông tư', resolution: 'nghị quyết', decision: 'quyết định' };

/** LEGAL_BASES đọc bằng regex (như SC-FIND-1) — script chạy được khi chưa build. */
function legalBases(src) {
  const body = src.slice(src.indexOf('export const LEGAL_BASES'), src.indexOf('} as const', src.indexOf('export const LEGAL_BASES')));
  return [...body.matchAll(/^ {2}'([A-Z0-9-]+)': \{ title: '([^']+)', page: '([^']+)' \}/gm)].map((m) => ({ key: m[1], title: m[2], page: m[3] }));
}

export function build(readSource, prev) {
  const reg = JSON.parse(readSource(SOURCE));
  if (reg.contract !== 'bizcity_vn_legal_registry@1') throw new Error(`nguồn không phải bizcity_vn_legal_registry@1: ${reg.contract}`);
  const bases = legalBases(readSource(BASES));
  const byNumber = new Map(reg.sources.map((s) => [s.number, s.id]));
  const aliasOf = new Map(); // id → [{ key, page }]
  for (const b of bases) {
    if (b.key === 'NOI-BO') continue;
    const id = MANUAL[b.key] ?? [...byNumber.entries()].find(([num]) => b.title.includes(num))?.[1];
    if (!id) throw new Error(`LEGAL_BASES ${b.key} "${b.title}" không khớp văn bản nào trong sổ — thêm vào MANUAL hoặc vào sổ`);
    aliasOf.set(id, [...(aliasOf.get(id) ?? []), b]);
  }
  const replacedBy = new Map();
  for (const s of reg.sources) for (const r of s.replaces ?? []) replacedBy.set(r, s.id);

  const items = reg.sources.map((s) => {
    const olds = aliasOf.get(s.id) ?? [];
    const repl = replacedBy.get(s.id);
    const hints = [];
    if (s.applies_to?.note) hints.push({ kind: 'why', text: s.applies_to.note });
    if (s.status === 'pending_effect') hints.push({ kind: 'warning', text: `Chưa có hiệu lực — từ ${s.effective_from}.` });
    if (s.effective_to) hints.push({ kind: 'warning', text: `Hết hiệu lực sau ${s.effective_to}.` });
    if (s.status === 'unverified') hints.push({ kind: 'warning', text: 'Sổ nguồn ghi chưa xác minh: ngày tháng, phạm vi lấy theo tài liệu thứ cấp.' });
    const url = s.official_url ?? s.secondary_urls?.[0];
    return {
      code: s.id,
      name: `${s.title} (${s.number})`,
      aliases: [s.number, ...olds.map((b) => b.key)],
      group: s.domain,
      status: repl ? 'deprecated' : 'active',
      ...(repl ? { replacedBy: repl } : {}),
      verified: s.review?.status === 'approved',
      payload: {
        kind: s.kind,
        number: s.number,
        issuer: s.issuer,
        issuedOn: s.issued_on,
        effectiveFrom: s.effective_from,
        effectiveTo: s.effective_to,
        legalStatus: s.status,
        amendedBy: s.amended_by ?? [],
        related: s.related ?? [],
        provisions: (s.provisions ?? []).map((p) => ({ ref: p.ref, summary: p.summary })),
        ...(olds[0] ? { page: olds[0].page } : {}),
        ...(url ? { url } : {}),
      },
      ...(hints.length ? { hints } : {}),
    };
  });
  const noiBo = bases.find((b) => b.key === 'NOI-BO');
  items.push({
    code: INTERNAL_CODE,
    name: 'Quy ước phần mềm (không phải văn bản pháp luật)',
    aliases: ['NOI-BO'],
    group: 'internal',
    status: 'active',
    verified: true,
    payload: { kind: 'internal', number: '—', issuer: 'Nhóm Lõi open-ketoan', issuedOn: null, effectiveFrom: null, effectiveTo: null, legalStatus: 'in_force', amendedBy: [], related: [], provisions: [], ...(noiBo ? { page: noiBo.page } : {}) },
    hints: [{ kind: 'why', text: 'Căn cứ cho luật kỹ thuật của Core (khuôn dữ liệu, mã, toàn vẹn) — không trích văn bản nhà nước.' }],
  });

  const lib = {
    contract: 'bizcity_library@1',
    id: 'vn.can-cu-phap-ly',
    kind: 'code-list',
    title: 'Căn cứ pháp lý',
    description: 'Văn bản pháp luật làm căn cứ cho thư viện, luật kiểm và mã phát hiện: số hiệu, cơ quan ban hành, hiệu lực, sửa đổi / thay thế, điều khoản. basis[].key của mọi thư viện trỏ vào đây (mã hoặc bí danh — khoá cũ LKT, TT99… vẫn dùng được).',
    version: '1.0.0',
    owner: 'kế toán trưởng',
    sources: [
      { title: 'Kho căn cứ pháp lý VN (packages/vn-rulepacks/registry/legal-sources.json, bizcity_vn_legal_registry@1)', kind: 'internal', date: '2026-11-02', note: 'Chép từ docs/can-cu, chưa người có trách nhiệm rà văn bản gốc (review pending)' },
      { title: 'LEGAL_BASES (packages/contracts/src/legal-basis.ts) — khoá cũ thành bí danh', kind: 'internal' },
    ],
    generatedBy: 'libraries/vn.can-cu-phap-ly/build.mjs',
    itemSchema: {
      type: 'object',
      required: ['kind', 'number', 'issuer', 'legalStatus', 'amendedBy', 'related', 'provisions'],
      additionalProperties: false,
      properties: {
        kind: { enum: ['law', 'decree', 'circular', 'resolution', 'decision', 'internal'], description: Object.entries(KIND).map(([k, v]) => `${k} = ${v}`).join(', ') },
        number: { type: 'string' },
        issuer: { type: 'string' },
        issuedOn: { type: ['string', 'null'] },
        effectiveFrom: { type: ['string', 'null'] },
        effectiveTo: { type: ['string', 'null'] },
        legalStatus: { enum: ['in_force', 'amended', 'replaced', 'pending_effect', 'expired', 'unverified'] },
        amendedBy: { type: 'array', items: { type: 'string' } },
        related: { type: 'array', items: { type: 'string' } },
        provisions: { type: 'array', items: { type: 'object', required: ['ref', 'summary'], additionalProperties: false, properties: { ref: { type: 'string' }, summary: { type: 'string' } } } },
        page: { type: 'string' },
        url: { type: 'string' },
      },
    },
    selector: {
      value: 'code',
      label: '{name}',
      search: ['code', 'name', 'aliases'],
      group: 'group',
      filters: [{ field: 'group', label: 'Lĩnh vực' }, { field: 'payload.legalStatus', label: 'Hiệu lực' }],
      sort: ['group', 'code'],
    },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-08', notes: `Bản đầu: ${reg.sources.length} văn bản từ kho căn cứ VN + quy ước phần mềm; khoá LEGAL_BASES là bí danh` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/vn.can-cu-phap-ly/library.json`);
}
