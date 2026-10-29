/**
 * MẪU IN các sổ của một tài khoản (màn AccountLedgerPage, chọn mẫu theo preset.kind và mã màn):
 *   cash     Sổ quỹ tiền mặt S07-DN (ACC55, rdlcSoQuyTienMat.rdlc) / Sổ tiền gửi ngân hàng S08-DN (ACC56)
 *   ledger   Sổ cái S03b-DN (ACC88; mẫu HTsoft nằm trong DLL nên dựng theo TT200)
 *   detail   Sổ chi tiết tài khoản S38-DN (ACC12); ACC76 sổ kế toán chi tiết quỹ tiền mặt S07a-DN; ACC86 sổ nguồn vốn CSH S51-DN
 *   partner  Sổ chi tiết thanh toán S31-DN (ACC40, ACC81); ACC62 BCCN nội bộ chi tiết; ACC87 sổ chi tiết tiền vay S15-DN
 */
import { DOC_TYPE_LABELS, type DocType } from '@ketoan/contracts';
import { date } from '@/lib/format';
import { BOOK_SIGNS, Dots, LedgerForm, m, mb, screenTemplate, type LedgerCol, type LedgerExtra, type PrintTemplate, type Row, type Sign } from '@/components/print';

export type LedgerKind = 'detail' | 'ledger' | 'partner' | 'cash';
export interface LedgerLine {
  postingDate: string; docNo: string; docType?: string; invoiceNo: string | null; description: string; accountCode: string; counterAccounts: string;
  partnerCode: string | null; partnerName: string | null; branchCode: string; debit: number; credit: number; balanceDebit: number; balanceCredit: number;
}
/** Một sổ đã xem trên màn: điều kiện lọc + số liệu máy chủ trả. */
export interface LedgerSheet {
  kind: LedgerKind; code: string; title: string; from: string; to: string; branchCodes: string; partnerCode?: string;
  account: { code: string; name: string };
  opening: { debit: number; credit: number }; closing: { debit: number; credit: number }; totals: { debit: number; credit: number };
  rows: LedgerLine[];
}
type Col = LedgerCol<LedgerLine>;

const branchOf = (s: LedgerSheet) => (s.branchCodes && !s.branchCodes.includes(',') ? s.branchCodes : undefined);
const bal = (b: { debit: number; credit: number }) => b.debit - b.credit;
const accText = (s: LedgerSheet) => `${s.account.code} — ${s.account.name}`;
/** Đối tượng đã lọc: mã + tên (lấy tên từ dòng sổ). */
const partnerText = (s: LedgerSheet) => {
  if (!s.partnerCode) return '';
  const name = s.rows.find((r) => r.partnerCode === s.partnerCode)?.partnerName;
  return name ? `${s.partnerCode} — ${name}` : s.partnerCode;
};
const descOf = (r: LedgerLine, partner = true) => <>{r.description}{partner && r.partnerName ? <i> — {r.partnerName}</i> : null}</>;
/** Tài khoản doanh thu, chi phí (loại 5–8) và 911: không in dòng số dư cuối kỳ (như màn). */
const isProfitLoss = (code: string) => /^[5-8]/.test(code) || code.startsWith('911');
const SIGNS_LAP_BIEU: Sign[] = [{ title: 'Người lập biểu' }, ...BOOK_SIGNS.slice(1)];

/* Cột hay dùng */
const cNgayGs: Col = { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 64, center: true, v: (r) => date(r.postingDate) };
const cSoCt: Col = { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 92, v: (r) => r.docNo };
const cNgayCt: Col = { key: 'nct', h: 'Ngày, tháng', group: 'Chứng từ', w: 64, center: true, v: (r) => date(r.postingDate) };
const cDu: Col = { key: 'du', h: 'TK đối ứng', w: 66, center: true, v: (r) => r.counterAccounts };
const cNo = (group: string, h = 'Nợ'): Col => ({ key: 'n', h, group, w: 96, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit });
const cCo = (group: string, h = 'Có'): Col => ({ key: 'c', h, group, w: 96, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit });
const cDuNo: Col = { key: 'dn', h: 'Nợ', group: 'Số dư', w: 100, num: true, v: (r) => mb(r.balanceDebit) };
const cDuCo: Col = { key: 'dc', h: 'Có', group: 'Số dư', w: 100, num: true, v: (r) => mb(r.balanceCredit) };
/** Dòng số dư đầu / cuối kỳ đặt vào hai cột (Nợ, Có) cho trước. */
const balRow = (label: string, b: { debit: number; credit: number }, kn: string, kc: string): LedgerExtra => ({ label, strong: true, cells: { [kn]: mb(b.debit), [kc]: mb(b.credit) } });

/** Sổ quỹ tiền mặt S07-DN / sổ tiền gửi S08-DN: Thu / Chi / Tồn theo từng chứng từ. */
const cashBook = (bank: boolean): PrintTemplate<LedgerSheet> => ({
  id: bank ? 's08' : 's07', name: bank ? 'Sổ tiền gửi ngân hàng S08-DN' : 'Sổ quỹ tiền mặt S07-DN', paper: 'A4L', source: bank ? 'rdlcBCTienMatTienNganHang.rdlc' : 'rdlcSoQuyTienMat.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: bank ? 'SỔ TIỀN GỬI NGÂN HÀNG' : 'SỔ QUỸ TIỀN MẶT', form: bank ? 'Mẫu số S08-DN' : 'Mẫu số S07-DN', branchCode: branchOf(s), from: s.from, to: s.to,
      info: [['Tài khoản', `${s.account.code} — ${s.account.name}`]], bookNote: true, rows: s.rows,
      signs: bank ? BOOK_SIGNS : [{ title: 'Thủ quỹ' }, ...BOOK_SIGNS.slice(1)],
      before: [{ label: 'Số tồn đầu kỳ', strong: true, cells: { ton: m(bal(s.opening)) } }],
      total: 'Cộng số phát sinh trong kỳ',
      after: [{ label: 'Số tồn cuối kỳ', cells: { ton: m(bal(s.closing)) } }],
      cols: [
        { key: 'ngay', h: 'Ngày, tháng chứng từ', w: 66, center: true, v: (r) => date(r.postingDate) },
        { key: 'thu', h: 'Thu', group: 'Số hiệu chứng từ', w: 92, v: (r) => (r.debit ? r.docNo : '') },
        { key: 'chi', h: 'Chi', group: 'Số hiệu chứng từ', w: 92, v: (r) => (r.credit ? r.docNo : '') },
        { key: 'dg', h: 'Diễn giải', v: (r) => <>{r.description}{r.partnerName ? <i> — {r.partnerName}</i> : null}</> },
        { key: 'du', h: 'TK đối ứng', w: 66, center: true, v: (r) => r.counterAccounts },
        { key: 'tt', h: 'Thu', group: 'Số tiền', w: 96, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'tc', h: 'Chi', group: 'Số tiền', w: 96, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'ton', h: 'Tồn', group: 'Số tiền', w: 104, num: true, v: (r) => m(r.balanceDebit - r.balanceCredit) },
        { key: 'gc', h: 'Ghi chú', w: 70, v: (r) => (r.invoiceNo ? `HĐ ${r.invoiceNo}` : '') },
      ],
    }} />
  ),
});

/** Sổ cái S03b-DN (hình thức Nhật ký chung): không có cột số dư, dòng dư đầu / cuối kỳ đặt ở cột Nợ / Có. */
const soCai: PrintTemplate<LedgerSheet> = {
  id: 's03b', name: 'Sổ cái S03b-DN', paper: 'A4L',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CÁI', form: 'Mẫu số S03b-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
      info: [['Tên tài khoản', s.account.name], ['Số hiệu', s.account.code]],
      before: [balRow('Số dư đầu kỳ', s.opening, 'n', 'c'), { label: <i>Số phát sinh trong kỳ</i> }],
      total: 'Cộng số phát sinh trong kỳ',
      after: [balRow('Số dư cuối kỳ', s.closing, 'n', 'c')],
      cols: [
        cNgayGs, cSoCt, cNgayCt,
        { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r) },
        { key: 'trang', h: 'Trang sổ', group: 'Nhật ký chung', w: 40, center: true, v: () => '' },
        { key: 'stt', h: 'STT dòng', group: 'Nhật ký chung', w: 40, center: true, v: (_, i) => i + 1 },
        cDu, cNo('Số tiền'), cCo('Số tiền'),
      ],
    }} />
  ),
};

/** Sổ chi tiết tài khoản S38-DN, A4 ngang: phát sinh + số dư luỹ kế từng dòng. */
const soChiTiet: PrintTemplate<LedgerSheet> = {
  id: 's38', name: 'Sổ chi tiết tài khoản S38-DN', paper: 'A4L', source: 'rdlcSoChiTietTaiKhoan.rdlc, rdlcACC12.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CHI TIẾT CÁC TÀI KHOẢN', form: 'Mẫu số S38-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
      info: [['Tài khoản', accText(s)], ['Đối tượng', partnerText(s)], ['Loại tiền', 'VNĐ']],
      before: [balRow('Số dư đầu kỳ', s.opening, 'dn', 'dc')],
      total: 'Cộng số phát sinh trong kỳ',
      after: isProfitLoss(s.account.code) ? [] : [balRow('Số dư cuối kỳ', s.closing, 'dn', 'dc')],
      cols: [cNgayGs, cSoCt, cNgayCt, { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r) }, cDu, cNo('Số phát sinh'), cCo('Số phát sinh'), cDuNo, cDuCo],
    }} />
  ),
};

/** Sổ chi tiết tài khoản S38-DN, A4 dọc gọn (SoChiTietTKS38.rdlc): Ngày ghi sổ | Ngày | Số | Diễn giải | Nợ PS | Có PS | Nợ tồn | Có tồn. */
const soChiTietDoc: PrintTemplate<LedgerSheet> = {
  id: 's38-doc', name: 'Sổ chi tiết tài khoản S38-DN (A4 dọc)', paper: 'A4', source: 'SoChiTietTKS38.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CHI TIẾT TÀI KHOẢN', form: 'Mẫu số S38-DN', branchCode: branchOf(s), from: s.from, to: s.to, rows: s.rows, signs: SIGNS_LAP_BIEU,
      info: [['Tài khoản', accText(s)], ...(s.partnerCode ? [['Đối tượng', partnerText(s)] as Row] : [])],
      before: [balRow('Số dư đầu kỳ', s.opening, 'dn', 'dc')],
      total: 'Cộng phát sinh',
      after: isProfitLoss(s.account.code) ? [] : [balRow('Số dư cuối kỳ', s.closing, 'dn', 'dc')],
      cols: [
        { key: 'ngs', h: 'Ngày ghi sổ', w: 58, center: true, v: (r) => date(r.postingDate) },
        { key: 'nct', h: 'Ngày', w: 58, center: true, v: (r) => date(r.postingDate) },
        { key: 'so', h: 'Số', w: 80, v: (r) => r.docNo },
        { key: 'dg', h: 'Diễn giải', v: (r) => <>{descOf(r)}{r.counterAccounts ? <span> ({r.counterAccounts})</span> : null}</> },
        { key: 'n', h: 'Nợ PS', w: 80, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'c', h: 'Có PS', w: 80, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'dn', h: 'Nợ tồn', w: 84, num: true, v: (r) => mb(r.balanceDebit) },
        { key: 'dc', h: 'Có tồn', w: 84, num: true, v: (r) => mb(r.balanceCredit) },
      ],
    }} />
  ),
};

/** Sổ kế toán chi tiết quỹ tiền mặt S07a-DN (A4 ngang): số hiệu chứng từ Thu / Chi, phát sinh Thu / Chi, Số tồn, Ghi chú người nộp / nhận. */
const soChiTietQuy: PrintTemplate<LedgerSheet> = {
  id: 's07a', name: 'Sổ kế toán chi tiết quỹ tiền mặt S07a-DN', paper: 'A4L', source: 'rdlcSoKeToanChiTietQuyTienMat.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ KẾ TOÁN CHI TIẾT QUỸ TIỀN MẶT', form: 'Mẫu số S07a-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
      info: [['Tài khoản', accText(s)], ['Loại quỹ', 'VNĐ']],
      before: [{ label: 'Số tồn đầu kỳ', strong: true, cells: { ton: m(bal(s.opening)) } }],
      total: 'Cộng số phát sinh trong kỳ',
      after: [{ label: 'Số tồn cuối kỳ', cells: { ton: m(bal(s.closing)) } }],
      cols: [
        cNgayGs,
        { key: 'nct', h: 'Ngày, tháng chứng từ', w: 64, center: true, v: (r) => date(r.postingDate) },
        { key: 'thu', h: 'Thu', group: 'Số hiệu chứng từ', w: 88, v: (r) => (r.debit ? r.docNo : '') },
        { key: 'chi', h: 'Chi', group: 'Số hiệu chứng từ', w: 88, v: (r) => (r.credit ? r.docNo : '') },
        { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r, false) },
        cDu,
        { key: 'tt', h: 'Thu', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'tc', h: 'Chi', group: 'Số phát sinh', w: 92, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'ton', h: 'Số tồn', w: 100, num: true, v: (r) => m(r.balanceDebit - r.balanceCredit) },
        { key: 'gc', h: 'Ghi chú (người nhận / người nộp)', w: 120, v: (r) => r.partnerName ?? '' },
      ],
    }} />
  ),
};

/** Sổ kế toán chi tiết quỹ tiền mặt S07-DN, A4 dọc gọn (SoChiTietTKS07.rdlc). */
const soChiTietQuyDoc: PrintTemplate<LedgerSheet> = {
  id: 's07-doc', name: 'Sổ kế toán chi tiết quỹ tiền mặt (A4 dọc)', paper: 'A4', source: 'SoChiTietTKS07.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ KẾ TOÁN CHI TIẾT QUỸ TIỀN MẶT', form: 'Mẫu số S07-DN', branchCode: branchOf(s), from: s.from, to: s.to, rows: s.rows, signs: SIGNS_LAP_BIEU,
      info: [['Tài khoản', accText(s)]],
      before: [{ label: 'Số tồn đầu kỳ', strong: true, cells: { ton: m(bal(s.opening)) } }],
      total: 'Cộng phát sinh',
      after: [{ label: 'Số tồn cuối kỳ', cells: { ton: m(bal(s.closing)) } }],
      cols: [
        { key: 'ngs', h: 'Ngày ghi sổ', w: 58, center: true, v: (r) => date(r.postingDate) },
        { key: 'nct', h: 'Ngày CT', w: 58, center: true, v: (r) => date(r.postingDate) },
        { key: 'thu', h: 'Thu', group: 'Số chứng từ', w: 76, v: (r) => (r.debit ? r.docNo : '') },
        { key: 'chi', h: 'Chi', group: 'Số chứng từ', w: 76, v: (r) => (r.credit ? r.docNo : '') },
        { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r) },
        { key: 'tt', h: 'Nợ', w: 80, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'tc', h: 'Có', w: 80, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'ton', h: 'Số tồn', w: 86, num: true, v: (r) => m(r.balanceDebit - r.balanceCredit) },
      ],
    }} />
  ),
};

/** Chia số phát sinh TK 411 theo tài khoản chi tiết: 4111 vốn góp, 4112 thặng dư vốn, còn lại vốn khác. */
const vonLoai = (r: LedgerLine) => (r.accountCode.startsWith('4111') ? 'gop' : r.accountCode.startsWith('4112') ? 'td' : 'khac');
const vonCols = (side: 'n' | 'c', group: string): Col[] => ([['gop', 'Vốn góp'], ['td', 'Thặng dư vốn'], ['khac', 'Vốn khác']] as const).map(([k, h]) => {
  const val = (r: LedgerLine) => (vonLoai(r) === k ? (side === 'n' ? r.debit : r.credit) : 0);
  return { key: `${side}${k}`, h, group, w: 84, num: true, v: (r) => mb(val(r)), sum: val };
});

/** Sổ theo dõi chi tiết nguồn vốn chủ sở hữu S51-DN (HTsoft in A3; ở đây A4 ngang, số dư gộp một cột). */
const soNguonVon: PrintTemplate<LedgerSheet> = {
  id: 's51', name: 'Sổ theo dõi chi tiết nguồn vốn CSH S51-DN', paper: 'A4L', source: 'rdlcSoChiTietNguonVonCSH.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: `SỔ THEO DÕI CHI TIẾT NGUỒN VỐN CHỦ SỞ HỮU (TK ${s.account.code})`, form: 'Mẫu số S51-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
      info: [['Tài khoản', accText(s)]],
      before: [{ label: 'Số dư đầu kỳ', strong: true, cells: { sd: m(-bal(s.opening)) } }],
      total: 'Cộng số phát sinh trong kỳ',
      after: [{ label: 'Số dư cuối kỳ', cells: { sd: m(-bal(s.closing)) } }],
      cols: [
        { key: 'so', h: 'Số hiệu', group: 'Chứng từ', w: 84, v: (r) => r.docNo },
        { key: 'nct', h: 'Ngày tháng', group: 'Chứng từ', w: 60, center: true, v: (r) => date(r.postingDate) },
        { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r) },
        { key: 'du', h: 'Tài khoản đối ứng', w: 60, center: true, v: (r) => r.counterAccounts },
        ...vonCols('n', 'Số phát sinh Nợ (giảm)'),
        ...vonCols('c', 'Số phát sinh Có (tăng)'),
        { key: 'sd', h: 'Số dư', w: 96, num: true, v: (r) => m(r.balanceCredit - r.balanceDebit) },
      ],
    }} />
  ),
};

/** Sổ chi tiết thanh toán với người mua (người bán) S31-DN: thêm cột Thời hạn được chiết khấu (để trống). */
const soThanhToan: PrintTemplate<LedgerSheet> = {
  id: 's31', name: 'Sổ chi tiết thanh toán với người mua / người bán S31-DN', paper: 'A4L', source: 'rdlcBCSoChiTietThanhToan.rdlc, rdlcSochiTietThanhToanMuaBan.rdlc',
  render: (s, ctx) => {
    const ai = s.account.code.startsWith('131') ? 'NGƯỜI MUA' : s.account.code.startsWith('331') ? 'NGƯỜI BÁN' : 'NGƯỜI MUA (NGƯỜI BÁN)';
    return (
      <LedgerForm ctx={ctx} d={{
        title: `SỔ CHI TIẾT THANH TOÁN VỚI ${ai}`, form: 'Mẫu số S31-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
        info: [['Tài khoản', accText(s)], ['Đối tượng', partnerText(s) || 'Tất cả'], ['Loại tiền', 'VNĐ']],
        before: [balRow('Số dư đầu kỳ', s.opening, 'dn', 'dc'), { label: <i>Số phát sinh trong kỳ</i> }],
        total: 'Cộng số phát sinh',
        after: [balRow('Số dư cuối kỳ', s.closing, 'dn', 'dc')],
        cols: [
          cNgayGs, cSoCt, cNgayCt, { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r, !s.partnerCode) }, cDu,
          { key: 'han', h: 'Thời hạn được chiết khấu', w: 64, center: true, v: () => '' },
          cNo('Số phát sinh'), cCo('Số phát sinh'), cDuNo, cDuCo,
        ],
      }} />
    );
  },
};

/** Sổ chi tiết công nợ (rdlcBCSoChiTietCongNo.rdlc): Ngày CT | Số CT | KH | Diễn giải | TK đối ứng | PS Nợ | PS Có | Nợ / Có cuối kỳ. */
const soCongNo: PrintTemplate<LedgerSheet> = {
  id: 'congno', name: 'Sổ chi tiết công nợ', paper: 'A4L', source: 'rdlcBCSoChiTietCongNo.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CHI TIẾT CÔNG NỢ', branchCode: branchOf(s), from: s.from, to: s.to, rows: s.rows, signs: [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }],
      info: [['Tài khoản', accText(s)], ['ĐVKH', partnerText(s) || 'Tất cả']],
      before: [balRow('Số dư đầu kỳ', s.opening, 'dn', 'dc')],
      total: 'Cộng phát sinh',
      after: [balRow('Số dư cuối kỳ', s.closing, 'dn', 'dc')],
      note: 'Chứng từ gốc kèm theo: Hóa đơn GTGT',
      cols: [
        { key: 'nct', h: 'Ngày CT', w: 62, center: true, v: (r) => date(r.postingDate) },
        { key: 'so', h: 'Số CT', w: 90, v: (r) => r.docNo },
        { key: 'kh', h: 'KH', w: 150, v: (r) => [r.partnerCode, r.partnerName].filter(Boolean).join(' — ') },
        { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
        cDu,
        { key: 'n', h: 'PS Nợ', w: 92, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'c', h: 'PS Có', w: 92, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'dn', h: 'Nợ cuối kỳ', w: 96, num: true, v: (r) => mb(r.balanceDebit) },
        { key: 'dc', h: 'Có cuối kỳ', w: 96, num: true, v: (r) => mb(r.balanceCredit) },
      ],
    }} />
  ),
};

/** Báo cáo chi tiết công nợ nội bộ kế toán (ACC62; rdlcBCSoChiTietCongNoNBKeToan.rdlc). */
const congNoNoiBo: PrintTemplate<LedgerSheet> = {
  id: 'cnnb', name: 'Báo cáo chi tiết công nợ nội bộ', paper: 'A4L', source: 'rdlcBCSoChiTietCongNoNBKeToan.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'BÁO CÁO CHI TIẾT CÔNG NỢ NỘI BỘ KẾ TOÁN', branchCode: branchOf(s), from: s.from, to: s.to, rows: s.rows, signs: SIGNS_LAP_BIEU,
      info: [['Tài khoản', accText(s)], ...(s.partnerCode ? [['Đối tượng', partnerText(s)] as Row] : [])],
      before: [balRow('Số dư đầu kỳ', s.opening, 'dn', 'dc')],
      total: 'Cộng phát sinh',
      after: [balRow('Số dư cuối kỳ', s.closing, 'dn', 'dc')],
      cols: [
        { key: 'tk', h: 'TK', w: 46, center: true, v: (r) => r.accountCode },
        { key: 'so', h: 'Số CT', w: 86, v: (r) => r.docNo },
        { key: 'ma', h: 'Mã CT', w: 80, v: (r) => (r.docType ? DOC_TYPE_LABELS[r.docType as DocType] ?? r.docType : '') },
        { key: 'ngs', h: 'Ngày, tháng ghi sổ', w: 60, center: true, v: (r) => date(r.postingDate) },
        { key: 'dg', h: 'Diễn giải', v: (r) => r.description },
        { key: 'kh', h: 'Khách hàng', w: 130, v: (r) => [r.partnerCode, r.partnerName].filter(Boolean).join(' — ') },
        { key: 'cn', h: 'CN', w: 44, center: true, v: (r) => r.branchCode },
        { key: 'n', h: 'PS Nợ', w: 86, num: true, v: (r) => mb(r.debit), sum: (r) => r.debit },
        { key: 'c', h: 'PS Có', w: 86, num: true, v: (r) => mb(r.credit), sum: (r) => r.credit },
        { key: 'dn', h: 'Dư Nợ CK', w: 90, num: true, v: (r) => mb(r.balanceDebit) },
        { key: 'dc', h: 'Dư Có CK', w: 90, num: true, v: (r) => mb(r.balanceCredit) },
      ],
    }} />
  ),
};

/** Sổ chi tiết tiền vay S15-DN (ACC87; rdlcSoChiTietTienVay.rdlc): khế ước vay ghi tay, cột Ngày đến hạn thanh toán để trống. */
const soTienVay: PrintTemplate<LedgerSheet> = {
  id: 's15', name: 'Sổ chi tiết tiền vay S15-DN', paper: 'A4L', source: 'rdlcSoChiTietTienVay.rdlc',
  render: (s, ctx) => (
    <LedgerForm ctx={ctx} d={{
      title: 'SỔ CHI TIẾT TIỀN VAY', form: 'Mẫu số S15-DN', branchCode: branchOf(s), from: s.from, to: s.to, bookNote: true, rows: s.rows,
      signs: [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Người đại diện theo pháp luật', note: '(Ký, họ tên, đóng dấu)' }],
      info: [['Tài khoản', accText(s)], ['Đối tượng cho vay', partnerText(s) || <Dots w="50%" />], ['Khế ước vay', <>Số <Dots w={90} /> ngày <Dots w={90} /> (Tỷ lệ lãi vay <Dots w={60} />)</>]],
      before: [balRow('Số dư đầu kỳ', s.opening, 'n', 'c'), { label: <i>Số phát sinh trong kỳ</i> }],
      total: 'Cộng số phát sinh',
      after: [balRow('Số dư cuối kỳ', s.closing, 'n', 'c')],
      cols: [
        cNgayGs, cSoCt, cNgayCt, { key: 'dg', h: 'Diễn giải', v: (r) => descOf(r, !s.partnerCode) }, cDu,
        { key: 'han', h: 'Ngày đến hạn thanh toán', w: 70, center: true, v: () => '' },
        cNo('Số tiền'), cCo('Số tiền'),
      ],
    }} />
  ),
};

/** Mẫu theo loại sổ và mã màn; luôn kèm "In bảng đang xem" ở cuối. */
export function ledgerTemplates(kind: LedgerKind, code: string): PrintTemplate<LedgerSheet>[] {
  const own: PrintTemplate<LedgerSheet>[] =
    kind === 'cash' ? [cashBook(code === 'ACC56')]
    : kind === 'ledger' ? [soCai]
    : code === 'ACC76' ? [soChiTietQuy, soChiTietQuyDoc, soChiTiet]
    : code === 'ACC86' ? [soNguonVon, soChiTiet]
    : code === 'ACC62' ? [congNoNoiBo, soChiTiet]
    : code === 'ACC87' ? [soTienVay, soChiTiet]
    : kind === 'partner' ? [soThanhToan, soCongNo, soChiTiet]
    : [soChiTiet, soChiTietDoc];
  return [...own, screenTemplate<LedgerSheet>()];
}
