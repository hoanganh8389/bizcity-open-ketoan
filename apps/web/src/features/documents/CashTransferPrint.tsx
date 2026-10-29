/**
 * MẪU IN Phiếu chuyển tiền (Q2); Uỷ nhiệm chi dùng mẫu chung UncForm (components/print/forms.tsx).
 *
 *   Phiếu chuyển tiền   rptPhieuChuyenTien.rpt (Crystal, chưa trích được bố cục — dựng theo tên mẫu, khổ A5 ngang):
 *                       từ quỹ / tài khoản → đến quỹ / tài khoản, số tiền, bằng chữ, nội dung, chữ ký.
 *   Uỷ nhiệm chi        rptUNC001.rpt — chỉ đúng khi phiếu rút tiền từ tài khoản ngân hàng.
 */
import type { ReactNode } from 'react';
import { Fields, Foot, OrgHead, Signs, Title, UncForm, m, words, type PrintCtx, type PrintTemplate, type Row } from '@/components/print';
import type { BankAccount } from '../catalog/BankAccountsPage';

/* ------------------------------------------------------------------ Phiếu chuyển tiền */
export interface CashTransferSheet {
  docNo: string; docDate: string; description: string; total: number; reasonCode: string; toReasonCode: string;
  fromBranchCode: string; fromBranchName: string; toBranchCode: string; toBranchName: string;
  fromMethodCode: string; toMethodCode: string; fromBank?: BankAccount; toBank?: BankAccount;
}

/** "Quỹ tiền mặt" hoặc "TK 0123… — Ngân hàng X (TK kế toán 1121…)". */
const fundText = (bank: BankAccount | undefined, method: string): ReactNode => (bank
  ? <><b>{bank.accountNo}</b> — {bank.bankName}{bank.bankBranch ? `, ${bank.bankBranch}` : ''}{bank.accountCode ? ` (TK ${bank.accountCode})` : ''}</>
  : method === 'TM' ? 'Quỹ tiền mặt' : `Hình thức ${method}`);

function TransferSheet({ s, ctx }: { s: CashTransferSheet; ctx: PrintCtx }) {
  return (
    <>
      <OrgHead ctx={ctx} branchCode={s.fromBranchCode} />
      <Title title="PHIẾU CHUYỂN TIỀN" date={s.docDate} no={s.docNo} />
      <Fields rows={[
        ['Chuyển từ', <><b>{s.fromBranchCode} — {s.fromBranchName}</b>: {fundText(s.fromBank, s.fromMethodCode)}</>],
        ['Chuyển đến', <><b>{s.toBranchCode} — {s.toBranchName}</b>: {fundText(s.toBank, s.toMethodCode)}</>],
        ['Số tiền', <><b>{m(s.total)}</b> đồng</>],
        ['Viết bằng chữ', <i>{words(s.total)}</i>],
        ['Nội dung', s.description],
        ...(s.reasonCode || s.toReasonCode ? [['Lý do chi / thu', [s.reasonCode, s.toReasonCode].filter(Boolean).join(' / ')] as Row] : []),
      ]} />
      <Signs date={s.docDate} items={[{ title: 'Người lập' }, { title: 'Thủ quỹ / Kế toán' }, { title: 'Người nhận' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

function TransferUnc({ s, ctx }: { s: CashTransferSheet; ctx: PrintCtx }) {
  const b = s.fromBank; const t = s.toBank;
  return (
    <UncForm u={{
      no: s.docNo, date: s.docDate, amount: s.total, description: s.description || `Chuyển tiền ${s.fromBranchName} sang ${s.toBranchName}`,
      payer: { name: b?.holder || ctx.org.name, accountNo: b?.accountNo, bankName: b?.bankName, bankBranch: b?.bankBranch },
      payee: { name: t?.holder || ctx.org.name, accountNo: t?.accountNo, bankName: t?.bankName, bankBranch: t?.bankBranch },
      note: b ? `Phiếu chuyển tiền ${s.docNo}` : `Phiếu chuyển tiền ${s.docNo} không rút từ tài khoản ngân hàng — ghi tay tài khoản trả tiền.`,
    }} />
  );
}

export const CASH_TRANSFER_TEMPLATES: PrintTemplate<CashTransferSheet>[] = [
  { id: 'pct', name: 'Phiếu chuyển tiền', paper: 'A5L', source: 'rptPhieuChuyenTien.rpt', render: (s, c) => <TransferSheet s={s} ctx={c} /> },
  { id: 'unc', name: 'Ủy nhiệm chi (chuyển khoản)', paper: 'A4', source: 'rptUNC001.rpt', render: (s, c) => <TransferUnc s={s} ctx={c} /> },
];
