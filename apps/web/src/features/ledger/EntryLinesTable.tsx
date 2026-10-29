/**
 * Bảng dòng định khoản của một bút toán (dùng ở chi tiết chứng từ và chi tiết bút toán).
 */
import { Money } from '@/components/ui';

export interface EntryLine {
  lineNo: number;
  pairNo: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  part: string;
  taxCode: string | null;
  description: string;
  partnerName?: string | null;
  productSku?: string | null;
}

const PART_LABEL: Record<string, string> = { goods: 'Tiền hàng', tax: 'Thuế', cogs: 'Giá vốn', discount: 'Chiết khấu', payment: 'Thanh toán', other: 'Khác' };

export function EntryLinesTable({ lines }: { lines: EntryLine[] }) {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Cặp</th>
          <th>Tài khoản</th>
          <th>Diễn giải</th>
          <th>Phần</th>
          <th>Thuế</th>
          <th className="num">Nợ</th>
          <th className="num">Có</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.lineNo}>
            <td className="muted">{l.pairNo}</td>
            <td>
              <span className="mono">{l.accountCode}</span> <span className="muted">{l.accountName}</span>
            </td>
            <td>{l.description}{l.partnerName ? <span className="muted"> · {l.partnerName}</span> : null}</td>
            <td>{PART_LABEL[l.part] ?? l.part}</td>
            <td className="mono">{l.taxCode}</td>
            <td className="num"><Money value={l.debit} /></td>
            <td className="num"><Money value={l.credit} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5}>Cộng</td>
          <td className="num"><Money value={debit} /></td>
          <td className="num"><Money value={credit} /></td>
        </tr>
      </tfoot>
    </table>
  );
}
