#!/usr/bin/env node
// [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52 (PHASE-030 · 26 §11.1): sinh thư viện core.ly-do-dinh-khoan từ danh mục lý do nghiệp vụ chuẩn; KHÔNG mang counter_account / revenue_account / expense_account (tài khoản đi qua AccountResolver), verified: false
/**
 *   node libraries/core.ly-do-dinh-khoan/build.mjs          sinh lại library.json
 *   node libraries/core.ly-do-dinh-khoan/build.mjs --check  chỉ so
 * Nguồn: sources/ly-do.jsonl (bản chép của db/seeds/ly-do.jsonl — cột code, name, kind, counter_account, revenue_account, expense_account, cashflow_code, is_active, flags).
 * Ba cột tài khoản bị bỏ có chủ đích: thư viện không mang số tài khoản và không sinh bút toán (26 §11.1, D-LIB-8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, stamp } from '../../scripts/thu-vien/thu-vien.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = 'sources/ly-do.jsonl';
const COLS = ['code', 'name', 'kind', 'counter_account', 'revenue_account', 'expense_account', 'cashflow_code', 'is_active', 'flags'];
const KIND_TEXT = { receipt: 'Thu', payment: 'Chi', in: 'Nhập', out: 'Xuất' };
const FLAGS = ['postToLedger', 'default', 'giftCostToPromotion', 'costAtSalePrice', 'returnAtOpeningCost'];

export function build(readSource, prev) {
  const lines = readSource(SOURCE).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = JSON.parse(lines.shift());
  if (head._bang !== 'ly-do' || head._cot.join('|') !== COLS.join('|')) throw new Error(`tiêu đề nguồn lạ: ${JSON.stringify(head._cot)}`);
  const items = lines.map((l) => JSON.parse(l)).map((r) => {
    if (!KIND_TEXT[r.kind]) throw new Error(`${r.code}: loại "${r.kind}" chưa ánh xạ`);
    const flags = Object.fromEntries(Object.entries(r.flags ?? {}).map(([k, v]) => {
      if (!FLAGS.includes(k)) throw new Error(`${r.code}: cờ "${k}" chưa ánh xạ`);
      return [k, v === true];
    }));
    return {
      code: r.code,
      name: r.name,
      group: KIND_TEXT[r.kind],
      status: r.is_active === false ? 'deprecated' : 'active',
      verified: false,
      payload: { kind: r.kind, cashflowCode: r.cashflow_code ?? null, flags },
    };
  });
  const lib = {
    contract: 'bizcity_library@1',
    id: 'core.ly-do-dinh-khoan',
    kind: 'code-list',
    title: 'Lý do nghiệp vụ (định khoản)',
    description: 'Lý do nghiệp vụ chuẩn của chứng từ thu, chi, nhập, xuất (reasonCode): mã, tên, loại, mã dòng tiền, cờ. Không mang số tài khoản — tài khoản do chính sách hạch toán và gói định khoản quyết qua AccountResolver.',
    version: '1.0.0',
    owner: 'kế toán trưởng',
    sources: [{ title: 'Danh mục lý do – tài khoản (ACC18) trong db/seeds/ly-do.jsonl', kind: 'internal', date: '2026-11-09', note: 'Danh mục mẫu của công ty cung cấp; chưa kế toán trưởng nào đối chiếu (verified: false). Ba cột tài khoản của nguồn không đưa vào thư viện.' }],
    generatedBy: 'libraries/core.ly-do-dinh-khoan/build.mjs',
    itemSchema: {
      type: 'object',
      required: ['kind', 'cashflowCode', 'flags'],
      additionalProperties: false,
      properties: {
        kind: { enum: ['receipt', 'payment', 'in', 'out'], description: 'receipt = thu · payment = chi · in = nhập · out = xuất' },
        cashflowCode: { type: ['string', 'null'], description: 'mã dòng tiền (báo cáo lưu chuyển tiền tệ), null = không gắn' },
        flags: {
          type: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(FLAGS.map((f) => [f, { type: 'boolean' }])),
        },
      },
    },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name'], group: 'group', filters: [{ field: 'group', label: 'Loại' }], sort: ['code'] },
    items,
  };
  return stamp(lib, prev, { date: '2026-11-09', notes: `Bản đầu: ${items.length} lý do từ db/seeds (không số tài khoản)` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(DIR, 'library.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const next = serialize(build((n) => fs.readFileSync(path.join(DIR, n), 'utf8'), current ? JSON.parse(current) : null));
  if (process.argv.includes('--check')) { if (next !== current) { console.error('library.json lệch bản sinh lại'); process.exit(1); } console.log('khớp'); process.exit(0); }
  if (next !== current) fs.writeFileSync(file, next);
  console.log(`${next === current ? 'không đổi' : 'đã ghi'} libraries/core.ly-do-dinh-khoan/library.json`);
}
