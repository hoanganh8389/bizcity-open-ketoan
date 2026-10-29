/**
 * MẪU IN Cấn trừ công nợ (BT03):
 *   Biên bản cấn trừ công nợ   A4: các bên (đơn vị và đối tượng, chuyển nợ giữa hai đối tượng thì ba bên), các khoản
 *                              được cấn trừ ở hai phía, số tiền cấn trừ, bằng chữ, chữ ký đại diện các bên.
 *   Phiếu kế toán              dùng lại mẫu phiếu kế toán (VOUCHER_TEMPLATES.manual, rdlcPhieuketoan.rdlc).
 * Chưa ghi sổ thì in bản nháp (số phiếu để trống) để các bên ký trước.
 */
import type { VoucherInput } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { Fields, Foot, Signs, Table, Title, dayText, m, words, type PrintCtx, type PrintTemplate, Dots, type Row } from '@/components/print';
import { VOUCHER_TEMPLATES } from './VoucherPrint';

export interface OffsetParty { code: string; name: string; address?: string; taxCode?: string; phone?: string }
export interface OffsetItem { docNo: string; docDate: string; description: string; amount: number }
export interface OffsetSheet {
  docNo: string; mode: 'same' | 'two'; voucher: VoucherInput; branchName: string;
  /** Đối tượng ghi Có (A) và ghi Nợ (B; cùng một đối tượng thì B = A). */
  credit: OffsetParty; debit: OffsetParty; creditAccount: string; debitAccount: string;
  creditItems: OffsetItem[]; debitItems: OffsetItem[]; amount: number;
}

interface PartnerRow { code: string; name: string; address?: string; taxCode?: string; phone?: string }
/** Nạp địa chỉ, mã số thuế của các đối tượng trước khi in. */
export async function withParties(s: OffsetSheet): Promise<OffsetSheet> {
  const one = async (p: OffsetParty): Promise<OffsetParty> => {
    if (!p.code) return p;
    const rows = await api.get<PartnerRow[]>('/api/v1/partners', { search: p.code, status: 'all', pageSize: 50 }).catch(() => [] as PartnerRow[]);
    const r = rows.find((x) => x.code === p.code);
    return r ? { ...p, name: r.name || p.name, address: r.address, taxCode: r.taxCode, phone: r.phone } : p;
  };
  const credit = await one(s.credit);
  const debit = s.debit.code === s.credit.code ? credit : await one(s.debit);
  return { ...s, credit, debit };
}

/** Tên khoản theo tài khoản: 13x phải thu, 33x phải trả, còn lại công nợ. */
const kindOf = (acc: string) => (acc.startsWith('13') ? 'phải thu' : acc.startsWith('33') ? 'phải trả' : 'công nợ');

function PartyBlock({ label, p }: { label: string; p: { name: string; address?: string; taxCode?: string; phone?: string } }) {
  return (
    <div style={{ marginTop: 4 }}>
      <b>{label}: {p.name}</b>
      <Fields rows={[
        ['Địa chỉ', p.address ?? ''],
        ['Mã số thuế', p.taxCode ?? ''],
        ...(p.phone ? [['Điện thoại', p.phone] as Row] : []),
        ['Đại diện', <><Dots w="45%" /> &nbsp;Chức vụ: <Dots w="30%" /></>],
      ]} />
    </div>
  );
}

function ItemsTable({ title, items, account, amount }: { title: string; items: OffsetItem[]; account: string; amount: number }) {
  return (
    <>
      <div style={{ marginTop: 6 }}><b>{title}</b></div>
      <Table compact rows={items.length ? items : [{ docNo: '', docDate: '', description: `Số dư công nợ TK ${account}`, amount }]} cols={[
        { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
        { h: 'Số chứng từ', w: 110, v: (i) => i.docNo },
        { h: 'Ngày', w: 76, center: true, v: (i) => (i.docDate ? date(i.docDate) : '') },
        { h: 'Diễn giải', v: (i) => i.description },
        { h: 'Số tiền cấn trừ', w: 120, num: true, v: (i) => m(i.amount) },
      ]} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{m(items.length ? items.reduce((s, i) => s + i.amount, 0) : amount)}</td></tr>} />
    </>
  );
}

function MinutesSheet({ s, ctx }: { s: OffsetSheet; ctx: PrintCtx }) {
  const v = s.voucher;
  const two = s.mode === 'two' && s.debit.code !== s.credit.code;
  const org = { name: ctx.org.name, address: ctx.org.address, taxCode: ctx.org.taxCode, phone: ctx.org.phone };
  return (
    <>
      <div className="pd-center"><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><div><b>Độc lập – Tự do – Hạnh phúc</b></div><div>———————</div></div>
      <Title title={two ? 'BIÊN BẢN BÙ TRỪ CÔNG NỢ' : 'BIÊN BẢN CẤN TRỪ CÔNG NỢ'} sub={two ? 'Giữa ba bên' : undefined} no={s.docNo} />
      <div>Hôm nay, {dayText(v.docDate).toLowerCase()}, tại {ctx.branchName(v.branchCode) || ctx.org.name}, chúng tôi gồm:</div>
      <PartyBlock label="BÊN A" p={org} />
      <PartyBlock label="BÊN B" p={s.credit} />
      {two && <PartyBlock label="BÊN C" p={s.debit} />}
      <div style={{ marginTop: 6 }}>Các bên cùng đối chiếu và thống nhất cấn trừ công nợ như sau:</div>
      <ItemsTable title={`1. Khoản ${kindOf(s.creditAccount)} của ${s.credit.name} (TK ${s.creditAccount}) được cấn trừ`} items={s.creditItems} account={s.creditAccount} amount={s.amount} />
      <ItemsTable title={`2. Khoản ${kindOf(s.debitAccount)} của ${s.debit.name} (TK ${s.debitAccount}) được cấn trừ`} items={s.debitItems} account={s.debitAccount} amount={s.amount} />
      <div className="pd-words" style={{ marginTop: 6 }}>3. Số tiền cấn trừ: <b>{m(s.amount)}</b> đồng</div>
      <div className="pd-words">Viết bằng chữ: <i>{words(s.amount)}</i></div>
      {v.description && <div className="pd-words">Nội dung: {v.description}</div>}
      <div className="pd-words">
        {two
          ? `Sau khi bù trừ, ${s.credit.name} và ${s.debit.name} cùng giảm công nợ với ${ctx.org.name} số tiền trên; phần còn lại (nếu có) các bên tiếp tục thanh toán theo hợp đồng.`
          : `Sau khi cấn trừ, công nợ giữa ${ctx.org.name} và ${s.credit.name} cùng giảm số tiền trên; phần chênh lệch còn lại (nếu có) các bên tiếp tục thanh toán theo hợp đồng.`}
        {' '}Biên bản lập thành {two ? '03' : '02'} bản có giá trị như nhau, mỗi bên giữ 01 bản.
      </div>
      <Signs items={[
        { title: 'ĐẠI DIỆN BÊN A', note: '(Ký, họ tên, đóng dấu)' },
        { title: 'ĐẠI DIỆN BÊN B', note: '(Ký, họ tên, đóng dấu)' },
        ...(two ? [{ title: 'ĐẠI DIỆN BÊN C', note: '(Ký, họ tên, đóng dấu)' }] : []),
      ]} />
      <Foot ctx={ctx} text={s.docNo ? `Phiếu kế toán ${s.docNo}` : 'Bản nháp — chưa ghi sổ'} />
    </>
  );
}

/** Phiếu kế toán của lần cấn trừ: dùng lại mẫu phiếu kế toán chung. */
const manualOf = (s: OffsetSheet) => ({ type: 'manual' as const, docNo: s.docNo, voucher: { ...s.voucher, partnerName: s.voucher.partnerName ?? s.credit.name }, branchName: s.branchName });

export const OFFSET_TEMPLATES: PrintTemplate<OffsetSheet>[] = [
  { id: 'bb', name: 'Biên bản cấn trừ công nợ', paper: 'A4', source: 'mẫu biên bản bù trừ công nợ', render: (s, c) => <MinutesSheet s={s} ctx={c} /> },
  ...VOUCHER_TEMPLATES.manual.map((t): PrintTemplate<OffsetSheet> => ({ id: t.id, name: t.name, paper: t.paper, source: t.source, render: (s, c) => t.render(manualOf(s), c) })),
];
