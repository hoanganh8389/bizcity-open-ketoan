/**
 * MẪU IN Yêu cầu thanh toán (CN05):
 *   Giấy đề nghị thanh toán   mẫu 05-TT (TT200): người đề nghị, bộ phận, nội dung, số tiền, bằng chữ, kèm theo, chữ ký.
 *   Uỷ nhiệm chi              rptUNC001.rpt — đơn vị nhận là đối tượng (tài khoản nhận khai ở danh mục đối tượng);
 *                             tài khoản trả tiền chưa biết tới lúc lập phiếu chi nên để dòng chấm ghi tay.
 */
import { date } from '@/lib/format';
import { Fields, Foot, OrgHead, Signs, Table, Title, m, words, type PrintCtx, type PrintTemplate, UncForm } from '@/components/print';

/** Các trường của yêu cầu thanh toán dùng khi in (khớp kiểu Req của PaymentRequestsPage). */
export interface PaymentRequestSheet {
  requestNo: string; requestDate: string; branchCode: string; partnerCode: string; partnerName: string; partnerBank: { accountNo: string; holder: string; bankName: string } | null;
  amount: number; dueDate: string | null; method: 'cash' | 'bank'; debitAccount: string | null; description: string; sourceRef: string;
  items: { docNo: string; accountCode: string; amount: number }[];
  createdByName: string; approved1By: string | null; approved2By: string | null; statusLabel: string;
}

/** Giấy đề nghị thanh toán 05-TT. */
function RequestSheet({ r, ctx }: { r: PaymentRequestSheet; ctx: PrintCtx }) {
  const approver = [r.approved1By, r.approved2By].filter(Boolean).join(', ');
  return (
    <>
      <OrgHead ctx={ctx} branchCode={r.branchCode} form="Mẫu số 05 - TT" />
      <Title title="GIẤY ĐỀ NGHỊ THANH TOÁN" date={r.requestDate} no={r.requestNo} />
      <div>Kính gửi: <b>Giám đốc {ctx.org.name}</b></div>
      <Fields rows={[
        ['Họ và tên người đề nghị thanh toán', r.createdByName],
        ['Bộ phận (hoặc địa chỉ)', ctx.branchName(r.branchCode)],
        ['Nội dung thanh toán', r.description],
        ['Đơn vị / người nhận tiền', `${r.partnerName}${r.partnerCode ? ` (${r.partnerCode})` : ''}`],
        ['Hình thức', r.method === 'bank' ? `Chuyển khoản${r.partnerBank?.accountNo ? ` — TK ${r.partnerBank.accountNo}, ${r.partnerBank.holder}, ${r.partnerBank.bankName}` : ''}` : 'Tiền mặt'],
        ...(r.dueDate ? [['Hạn thanh toán', date(r.dueDate)] as [string, string]] : []),
        ['Số tiền', <><b>{m(r.amount)}</b> đồng</>],
        ['Viết bằng chữ', <i>{words(r.amount)}</i>],
        ['Kèm theo', <>{r.sourceRef || '..........'} &nbsp;chứng từ gốc</>],
      ]} />
      {r.items.length > 0 ? (
        <Table compact rows={r.items} cols={[
          { h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { h: 'Số chứng từ công nợ', v: (i) => i.docNo },
          { h: 'Tài khoản', w: 90, center: true, v: (i) => i.accountCode },
          { h: 'Số đề nghị', w: 120, num: true, v: (i) => m(i.amount) },
        ]} foot={<tr><td colSpan={3} className="c">Cộng</td><td className="num">{m(r.items.reduce((s, i) => s + i.amount, 0))}</td></tr>} />
      ) : r.debitAccount ? <div className="pd-note">Khoản chi chưa ghi công nợ — ghi Nợ tài khoản {r.debitAccount}.</div> : null}
      <Signs date={r.requestDate} items={[
        { title: 'Người đề nghị thanh toán', name: r.createdByName },
        { title: 'Kế toán trưởng' },
        { title: 'Người duyệt', name: approver || undefined },
      ]} />
      <Foot ctx={ctx} text={r.statusLabel} />
    </>
  );
}

export const PAYMENT_REQUEST_TEMPLATES: PrintTemplate<PaymentRequestSheet>[] = [
  { id: 'dntt', name: 'Giấy đề nghị thanh toán 05-TT', paper: 'A5L', source: 'mẫu 05-TT', render: (r, c) => <RequestSheet r={r} ctx={c} /> },
  { id: 'dntt-a4', name: 'Giấy đề nghị thanh toán 05-TT khổ A4', paper: 'A4', source: 'mẫu 05-TT', render: (r, c) => <RequestSheet r={r} ctx={c} /> },
  {
    id: 'unc', name: 'Ủy nhiệm chi', paper: 'A4', source: 'rptUNC001.rpt',
    render: (r, c) => (
      <UncForm u={{
        no: r.requestNo, date: r.requestDate, amount: r.amount, description: r.description || `Thanh toán cho ${r.partnerName}`,
        payer: { name: c.org.name }, payee: { name: r.partnerBank?.holder || r.partnerName, accountNo: r.partnerBank?.accountNo, bankName: r.partnerBank?.bankName },
        note: `Theo yêu cầu thanh toán ${r.requestNo}${r.sourceRef ? ` · ${r.sourceRef}` : ''}`,
      }} />
    ),
  },
];
