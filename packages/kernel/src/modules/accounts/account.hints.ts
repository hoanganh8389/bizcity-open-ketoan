// @bizcity-layer K kernel/accounts
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14: khung "Vì sao" cho form tài khoản — nhắc / hướng dẫn / cảnh báo mềm / chặn theo bizcity_catalog_hint@1, so với hệ thống tài khoản chuẩn (db/seeds/tai-khoan.csv)
/**
 * Đánh giá một bản khai báo tài khoản (thêm hoặc sửa) trước khi lưu — chỉ đọc, không ghi gì.
 * Cùng hàm dùng cho POST /api/v1/accounts/validate (form gọi khi ô đổi) và cho chính lúc lưu (meta.findings + ghi nhận cảnh báo).
 *
 * "Bản chất thường gặp" của một tài khoản = dòng của nó (hoặc tài khoản cấp 1 cùng gốc 3 số) trong hệ thống tài khoản chuẩn
 * đã nạp khi khởi tạo đơn vị; tài khoản con thì so với tài khoản cha của đơn vị.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogFinding, type CatalogFinding } from '@ketoan/contracts';
import { SEEDS_DIR } from '@bizcity/platform/db/paths';
import type { Db } from '@bizcity/platform/db/client';
import { parseCsv } from '../../db/seed.js';
import { accountRepository } from './account.repository.js';

export interface AccountDraft {
  code: string;
  parentCode?: string | null;
  normalSide?: 'debit' | 'credit' | 'both';
  trackPartner?: boolean;
  isDebt?: boolean;
  isActive?: boolean;
}

interface StdAccount { normalSide: string; trackPartner: boolean; isDebt: boolean }
let standard: Promise<Map<string, StdAccount>> | null = null;

/** Hệ thống tài khoản chuẩn (một lần mỗi tiến trình). Thiếu tệp → bản đồ rỗng: không có luật so chuẩn, không lỗi. */
function standardChart(): Promise<Map<string, StdAccount>> {
  standard ??= readFile(path.join(SEEDS_DIR, 'tai-khoan.csv'), 'utf8')
    .then((t) => new Map(parseCsv(t).map((a) => [a.code!, { normalSide: a.normal_side ?? 'debit', trackPartner: a.track_partner === '1', isDebt: a.is_debt === '1' }])))
    .catch(() => new Map());
  return standard;
}

const SIDE_TEXT: Record<string, string> = { debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' };
const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/**
 * mode = 'create': bản khai báo đầy đủ; 'update': chỉ các trường gửi lên, phần còn lại lấy từ tài khoản đang có.
 */
export async function accountHints(db: Db, tenantId: string, draft: AccountDraft, mode: 'create' | 'update'): Promise<CatalogFinding[]> {
  const out: CatalogFinding[] = [];
  const std = await standardChart();
  const current = mode === 'update' ? await accountRepository.findByCode(db, tenantId, draft.code) : undefined;
  const parentCode = mode === 'update' ? current?.parent_code ?? null : draft.parentCode ?? null;
  const side = draft.normalSide ?? (current?.normal_side as AccountDraft['normalSide']) ?? 'debit';
  const trackPartner = draft.trackPartner ?? current?.track_partner ?? false;
  const isDebt = draft.isDebt ?? current?.is_debt ?? false;
  const root = draft.code.slice(0, 3);
  const parent = parentCode ? await accountRepository.findByCode(db, tenantId, parentCode) : undefined;

  if (mode === 'create' && parentCode && !draft.code.startsWith(parentCode)) {
    out.push(catalogFinding('ACC-BLOCK-001', { parent: parentCode }, { field: 'code' }));
  }
  if (parent) {
    const inherited = [SIDE_TEXT[parent.normal_side] ?? parent.normal_side, parent.track_partner ? 'theo dõi đối tượng' : null, parent.is_debt ? 'là công nợ' : null].filter(Boolean).join(', ');
    out.push(catalogFinding('ACC-HINT-001', { parent: parent.code, inherited }, { field: 'parentCode' }));
  }
  if (side === 'both') out.push(catalogFinding('ACC-HINT-002', {}, { field: 'normalSide' }));

  // Bản chất thường gặp: tài khoản cha của đơn vị; không có cha → dòng chuẩn của chính mã, rồi của gốc 3 số.
  const ref = parent
    ? { normalSide: parent.normal_side, trackPartner: parent.track_partner, isDebt: parent.is_debt }
    : std.get(draft.code) ?? std.get(root);
  if (ref) {
    if (ref.normalSide !== 'both' && side !== ref.normalSide) {
      out.push(catalogFinding('ACC-HINT-004', { side: SIDE_TEXT[side] ?? side, root: parent?.code ?? root, expected: SIDE_TEXT[ref.normalSide] ?? ref.normalSide },
        { field: 'normalSide', fix: { label: `Đặt "${SIDE_TEXT[ref.normalSide]}"`, set: { normalSide: ref.normalSide } } }));
    }
    const debtGroup = ref.trackPartner || ref.isDebt || ref.normalSide === 'both';
    if (debtGroup && !trackPartner && !isDebt && side !== 'both') {
      out.push(catalogFinding('ACC-HINT-003', { code: draft.code, root: parent?.code ?? root }, { field: 'trackPartner', fix: { label: 'Tích "Theo dõi đối tượng"', set: { trackPartner: true } } }));
    } else if (ref.trackPartner && !trackPartner) {
      out.push(catalogFinding('ACC-HINT-005', { code: draft.code, root: parent?.code ?? root }, { field: 'trackPartner', fix: { label: 'Tích "Theo dõi đối tượng"', set: { trackPartner: true } } }));
    }
  } else if (mode === 'create' && !parentCode) {
    out.push(catalogFinding('ACC-HINT-007', { code: draft.code }, { field: 'parentCode' }));
  }

  if (mode === 'update' && draft.isActive === false && current?.is_active) {
    const r = await db.selectFrom('ledger_lines').select((eb) => eb.fn.sum<string>(eb('debit', '-', eb.ref('credit'))).as('net'))
      .where('tenant_id', '=', tenantId).where('account_code', '=', draft.code).executeTakeFirst();
    const net = Number(r?.net ?? 0);
    if (Math.abs(net) >= 0.005) out.push(catalogFinding('ACC-HINT-006', { code: draft.code, balance: `${net > 0 ? 'Nợ' : 'Có'} ${fmt(Math.abs(net))}` }, { field: 'isActive' }));
  }
  return out;
}
