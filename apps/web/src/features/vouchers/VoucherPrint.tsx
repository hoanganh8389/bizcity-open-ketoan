/**
 * MẪU IN phiếu thu (ACC51), phiếu chi (ACC52), phiếu báo nợ (ACC53), phiếu báo có (ACC54), phiếu kế toán (ACC16)
 * và các phiếu kế toán của phân hệ công nợ — dựng trên khung in dùng chung (components/print).
 *
 * Bố cục theo các mẫu HTsoft đang dùng (thư mục Reports của HTsoft BizMan):
 *   Phiếu thu 01-TT   rdlcPhieuThu.rdlc / rdlcPhieuThu_1lien.rdlc; bản 2 liên trên một tờ A4: rdlcPhieuThu 040326.rdlc
 *   Phiếu chi 02-TT   rdlcPhieuChi.rdlc / rdlcPhieuChi_1 lien.rdlc; 2 liên: rdlcPhieuChi 040326.rdlc
 *   Phiếu báo có      rdlcPhieuBaoCo.rdlc          Phiếu báo nợ  rdlcPhieuBaoNo.rdlc
 *   Uỷ nhiệm chi      rdlcPhieuBaoNoVCBCP / NHCT05 / NHND20…23 / TPB.rdlc, rptUNC001…003.rpt (bố cục chung các ngân hàng)
 *   Phiếu kế toán     rdlcPhieuketoan.rdlc
 * Ô chữ ký có chữ ký xác nhận trong phần mềm (còn hiệu lực) thì in "Đã ký xác nhận" kèm tên, giờ ký.
 */
import type { VoucherInput, VoucherType } from '@ketoan/contracts';
import { date, dateTime } from '@/lib/format';
import { AccSide, CashForm, Fields, Foot, OrgHead, Signs, Table, Title, TwoCopies, UncForm, m, mb, words, type AccAmount, type CashData, type PrintCtx, type PrintTemplate, type Sign, type UncData } from '@/components/print';
import type { BankAccount } from '../catalog/BankAccountsPage';

export interface SignatureInfo { role: 'preparer' | 'cashier' | 'chief_accountant' | 'director'; signerName: string; signedAt: string; version: number; valid: boolean }
/** Ô chữ ký trên phiếu in → vai ký trong phần mềm. Người nộp / nhận tiền ký tay. */
const SIGN_ROLE: Record<string, SignatureInfo['role']> = { 'Giám đốc': 'director', 'Kế toán trưởng': 'chief_accountant', 'Người lập phiếu': 'preparer', 'Người lập': 'preparer', 'Thủ quỹ': 'cashier' };
export interface PrintSheet { type: VoucherType; docNo: string; voucher: VoucherInput; branchName: string; signatures?: SignatureInfo[]; banks?: BankAccount[] }

/** Các ô ký của từng loại phiếu (thứ tự như mẫu HTsoft / TT200). */
const SIGNS: Record<VoucherType, string[]> = {
  receipt: ['Giám đốc', 'Kế toán trưởng', 'Người nộp tiền', 'Người lập phiếu', 'Thủ quỹ'],
  payment: ['Giám đốc', 'Kế toán trưởng', 'Thủ quỹ', 'Người lập phiếu', 'Người nhận tiền'],
  bank_receipt: ['Người lập phiếu', 'Kế toán trưởng', 'Giám đốc'],
  bank_payment: ['Người lập phiếu', 'Kế toán trưởng', 'Giám đốc'],
  manual: ['Người lập', 'Kế toán trưởng', 'Giám đốc'],
};

/** Các vai ký trong phần mềm có ô chữ ký trên mẫu phiếu này. */
export const signRolesOf = (type: VoucherType): SignatureInfo['role'][] => SIGNS[type].map((s) => SIGN_ROLE[s]).filter((x): x is SignatureInfo['role'] => Boolean(x));

/** Mã màn của từng loại phiếu (nhớ mẫu in mặc định theo màn). */
export const VOUCHER_SCREEN: Record<VoucherType, string> = { receipt: 'ACC51', payment: 'ACC52', bank_payment: 'ACC53', bank_receipt: 'ACC54', manual: 'ACC16' };

const totalOf = (v: VoucherInput) => v.lines.reduce((s, l) => s + l.amount + (l.taxAmount ?? 0), 0);
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
/** Góc Nợ / Có kèm số tiền (gộp theo tài khoản); thuế GTGT của dòng in thành dòng "Thuế" bên Nợ (chi) hoặc Có (thu). */
function accounts(v: VoucherInput): { debit: AccAmount[]; credit: AccAmount[] } {
  const sum = (side: 'debitAccount' | 'creditAccount') => {
    const map = new Map<string, number>();
    for (const l of v.lines) if (l[side]) map.set(l[side]!, (map.get(l[side]!) ?? 0) + l.amount);
    return [...map];
  };
  const tax = v.lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  const taxRow: AccAmount[] = tax ? [['Thuế', tax]] : [];
  const out = v.docType === 'payment' || v.docType === 'bank_payment';
  return { debit: [...sum('debitAccount'), ...(out ? taxRow : [])], credit: [...sum('creditAccount'), ...(out ? [] : taxRow)] };
}

function signItems(s: PrintSheet, names?: Partial<Record<string, string>>): Sign[] {
  return SIGNS[s.type].map((t) => {
    const sg = (s.signatures ?? []).find((x) => x.valid && x.role === SIGN_ROLE[t]);
    return {
      title: t,
      note: t === 'Giám đốc' ? '(Ký, họ tên, đóng dấu)' : '(Ký, họ tên)',
      stamp: sg ? <div className="pd-signed">Đã ký xác nhận<br /><b>{sg.signerName}</b><br />{dateTime(sg.signedAt)}</div> : undefined,
      name: sg ? undefined : names?.[t],
    };
  });
}

/** Phiếu thu / chi 01-TT, 02-TT: đổi phiếu sang dữ liệu của mẫu chung CashForm. */
const cashData = (s: PrintSheet, half?: number): CashData => {
  const v = s.voucher;
  const counter = v.counterparty || v.partnerName || '';
  return {
    kind: s.type === 'receipt' ? 'receipt' : 'payment', branchCode: v.branchCode, docNo: s.docNo, date: v.docDate,
    person: counter, unit: v.partnerName, address: v.address, reason: v.description, amount: totalOf(v), ...accounts(v),
    attach: v.reference, signs: signItems(s), half, footText: s.branchName,
  };
};

/** Phiếu báo nợ / báo có (mẫu nội bộ HTsoft) — khổ A5. */
function BankSheet({ s, ctx }: { s: PrintSheet; ctx: PrintCtx }) {
  const v = s.voucher;
  const isIn = s.type === 'bank_receipt';
  const total = totalOf(v);
  return (
    <>
      <OrgHead ctx={ctx} branchCode={v.branchCode} />
      <Title title={isIn ? 'PHIẾU BÁO CÓ' : 'PHIẾU BÁO NỢ'} date={v.docDate} side={<><div>Số: <b>{s.docNo}</b></div><AccSide {...accounts(v)} /></>} />
      <Fields rows={[
        [isIn ? 'Đơn vị / người chuyển tiền' : 'Đơn vị / người nhận tiền', v.counterparty || v.partnerName || ''],
        ['Địa chỉ', v.address ?? ''],
        [isIn ? 'Nội dung thu' : 'Nội dung chi', v.description],
        ['Số tiền', <><b>{m(total)}</b> đồng</>],
        ['Viết bằng chữ', <i>{words(total)}</i>],
        ['Kèm theo', <>{v.reference || '..........'} chứng từ gốc</>],
      ]} />
      <Table compact rows={v.lines} cols={[
        { h: 'Diễn giải', v: (l) => l.description || v.description },
        { h: 'TK Nợ', w: 70, center: true, v: (l) => l.debitAccount },
        { h: 'TK Có', w: 70, center: true, v: (l) => l.creditAccount },
        { h: 'Số tiền', w: 110, num: true, v: (l) => m(l.amount) },
        { h: 'Thuế', w: 90, num: true, v: (l) => mb(l.taxAmount) },
      ]} foot={<tr><td colSpan={3}>Cộng</td><td className="num">{m(v.lines.reduce((x, l) => x + l.amount, 0))}</td><td className="num">{mb(v.lines.reduce((x, l) => x + (l.taxAmount ?? 0), 0))}</td></tr>} />
      <Signs date={v.docDate} items={signItems(s)} />
      <Foot ctx={ctx} text={s.branchName} />
    </>
  );
}

/** Uỷ nhiệm chi: bên trả lấy tài khoản ngân hàng khớp TK Có của phiếu; bên nhận để trống số tài khoản ghi tay. */
function uncData(s: PrintSheet, ctx: PrintCtx): UncData {
  const v = s.voucher;
  const payAcc = uniq(v.lines.map((l) => l.creditAccount))[0] ?? '';
  const payer = (s.banks ?? []).find((b) => b.accountCode === payAcc);
  return {
    no: s.docNo, date: v.docDate, amount: totalOf(v), description: v.description,
    payer: { name: payer?.holder || ctx.org.name, accountNo: payer?.accountNo, bankName: payer?.bankName, bankBranch: payer?.bankBranch },
    payee: { name: v.partnerName || v.counterparty, address: v.address ?? '' },
    note: `Hạch toán: Nợ ${uniq(v.lines.map((l) => l.debitAccount)).join(', ')} / Có ${payAcc} · Phiếu báo nợ ${s.docNo}`,
  };
}

/** Phiếu kế toán (rdlcPhieuketoan): bảng Ngày, Diễn giải, Nợ, Có, Số tiền, Ghi chú. */
function ManualSheet({ s, ctx }: { s: PrintSheet; ctx: PrintCtx }) {
  const v = s.voucher;
  const total = v.lines.reduce((x, l) => x + l.amount, 0);
  const tax = v.lines.reduce((x, l) => x + (l.taxAmount ?? 0), 0);
  return (
    <>
      <OrgHead ctx={ctx} branchCode={v.branchCode} />
      <Title title="PHIẾU KẾ TOÁN" date={v.docDate} side={<div>Số phiếu: <b>{s.docNo}</b></div>} />
      {(v.partnerName || v.counterparty || v.partnerCode) && <Fields rows={[['Đối tượng', [v.partnerCode, v.partnerName || v.counterparty].filter(Boolean).join(' — ')], ['Diễn giải', v.description]]} />}
      <Table rows={v.lines} minRows={4} cols={[
        { h: 'Ngày tháng', w: 78, center: true, v: () => date(v.docDate) },
        { h: 'Diễn giải', v: (l) => l.description || v.description },
        { h: 'Nợ', w: 70, center: true, v: (l) => l.debitAccount },
        { h: 'Có', w: 70, center: true, v: (l) => l.creditAccount },
        { h: 'Số tiền', w: 110, num: true, v: (l) => m(l.amount) },
        { h: 'Ghi chú', w: 120, v: (l) => [l.invoiceNo && `HĐ ${l.invoiceNo}`, l.taxAmount ? `Thuế ${m(l.taxAmount)}` : ''].filter(Boolean).join(' · ') },
      ]} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{m(total)}</td><td className="num">{tax ? `Thuế ${m(tax)}` : ''}</td></tr>} />
      <div className="pd-words">Số tiền viết bằng chữ: <i>{words(total + tax)}</i></div>
      <div className="pd-words">Chứng từ gốc kèm theo: {v.reference || '..........................................'}</div>
      <Signs date={v.docDate} items={signItems(s)} />
      <Foot ctx={ctx} text={s.branchName} />
    </>
  );
}

const tpl = (t: PrintTemplate<PrintSheet>) => t;
const receiptTemplates = (type: 'receipt' | 'payment'): PrintTemplate<PrintSheet>[] => {
  const name = type === 'receipt' ? 'Phiếu thu' : 'Phiếu chi';
  const file = type === 'receipt' ? 'rdlcPhieuThu' : 'rdlcPhieuChi';
  return [
    tpl({ id: 'a5', name: `${name} ${type === 'receipt' ? '01-TT' : '02-TT'} — 1 liên`, paper: 'A5L', source: `${file}.rdlc`, render: (s, ctx) => <CashForm c={cashData(s)} ctx={ctx} /> }),
    tpl({ id: '2lien', name: `${name} 2 liên trên một tờ A4`, paper: 'A4', source: `${file} 040326.rdlc`, render: (s, ctx) => <TwoCopies render={(n) => <CashForm c={cashData(s, n)} ctx={ctx} />} /> }),
    tpl({ id: 'a4', name: `${name} khổ A4 dọc`, paper: 'A4', source: `${file}_1lien.rdlc`, render: (s, ctx) => <CashForm c={cashData(s)} ctx={ctx} /> }),
  ];
};

/** Các mẫu in theo loại phiếu; mẫu đầu là mặc định khi người dùng chưa chọn. */
export const VOUCHER_TEMPLATES: Record<VoucherType, PrintTemplate<PrintSheet>[]> = {
  receipt: receiptTemplates('receipt'),
  payment: receiptTemplates('payment'),
  bank_receipt: [tpl({ id: 'bc', name: 'Phiếu báo có', paper: 'A5L', source: 'rdlcPhieuBaoCo.rdlc', render: (s, ctx) => <BankSheet s={s} ctx={ctx} /> })],
  bank_payment: [
    tpl({ id: 'bn', name: 'Phiếu báo nợ', paper: 'A5L', source: 'rdlcPhieuBaoNo.rdlc', render: (s, ctx) => <BankSheet s={s} ctx={ctx} /> }),
    tpl({ id: 'unc', name: 'Ủy nhiệm chi', paper: 'A4', source: 'rdlcPhieuBaoNoVCBCP.rdlc, rptUNC001.rpt', render: (s, ctx) => <UncForm u={uncData(s, ctx)} /> }),
  ],
  manual: [tpl({ id: 'pk', name: 'Phiếu kế toán', paper: 'A4', source: 'rdlcPhieuketoan.rdlc', render: (s, ctx) => <ManualSheet s={s} ctx={ctx} /> })],
};

