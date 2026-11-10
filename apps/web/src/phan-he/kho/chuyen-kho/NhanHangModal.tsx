// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — thủ kho nhập xác nhận nhận hàng phiếu chuyển kho (đóng góp)
/**
 * Thủ kho nhập xác nhận (KHO01): mặc định nhận đủ; nhận thiếu thì sửa cột "Thực nhận" và ghi chú lý do. Xác nhận = ghi chứng từ đầu
 * nhập: tồn chi nhánh + kho nhập tăng theo số thực nhận, vào đúng các lô bên xuất đã xuất. Phần chênh còn trên tài khoản hàng đang
 * chuyển để kế toán xử lý.
 */
import { useState } from 'react';
import { errorText } from '@/lib/api';
import { today } from '@/lib/format';
import { Modal, NumInput } from '@/components/ui';
import { qtyText, viDate, type CkDoc } from './api';

export function NhanHangModal({ doc, saving, error, onOk, onClose }: {
  doc: CkDoc; saving: boolean; error: unknown;
  onOk: (b: { receivedDate: string; lines: { lineKey: string; receivedQty: number }[]; note: string }) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(() => (doc.receivedDate ?? (today() < doc.docDate ? doc.docDate : today())));
  const [rec, setRec] = useState<Record<string, number>>(() => Object.fromEntries(doc.lines.map((l) => [l.lineKey, l.receivedQty ?? l.qty])));
  const [note, setNote] = useState(doc.receivedNote ?? '');
  const lotsOf = (key: string) => (doc.outLots?.[key] ?? []).map((x) => `${x.lotNo || 'không số'}${x.expDate ? ` (${viDate(x.expDate)})` : ''}: ${qtyText(x.qty)}`).join(' · ');
  const total = doc.lines.reduce((s, l) => s + l.qty, 0);
  const got = doc.lines.reduce((s, l) => s + (rec[l.lineKey] ?? 0), 0);
  const over = doc.lines.filter((l) => (rec[l.lineKey] ?? 0) > l.qty);
  const short = got < total;
  return (
    <Modal wide title={`Nhận hàng — phiếu chuyển kho ${doc.docNo}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => setRec(Object.fromEntries(doc.lines.map((l) => [l.lineKey, l.qty])))} title="Điền số thực nhận = số xuất cho mọi dòng">Nhận đủ</button>
        <button className="btn btn-primary" disabled={saving || over.length > 0 || date < doc.docDate || (short && !note.trim())}
          title={over.length ? 'Có dòng nhận nhiều hơn số xuất' : date < doc.docDate ? 'Ngày nhận trước ngày xuất' : short && !note.trim() ? 'Nhận thiếu: ghi lý do ở ô Ghi chú' : 'Cộng tồn bên nhận theo số thực nhận'}
          onClick={() => onOk({ receivedDate: date, note: note.trim(), lines: doc.lines.map((l) => ({ lineKey: l.lineKey, receivedQty: rec[l.lineKey] ?? 0 })) })}>Xác nhận nhận hàng</button>
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full muted" style={{ fontSize: 12 }}>
        Từ <b>{doc.fromBranchCode}{doc.fromWarehouse ? ` · ${doc.fromWarehouse}` : ''}</b> → <b>{doc.toBranchCode}{doc.toWarehouse ? ` · ${doc.toWarehouse}` : ''}</b>, xuất ngày {viDate(doc.docDate)}.
        Hàng vào đúng lô bên xuất đã xuất. Nhận thiếu thì phần chênh còn ở hàng đang chuyển.
      </div>
      <div className="full row" style={{ gap: 16 }}>
        <label className="row" style={{ gap: 6 }}>Ngày nhận <input className="input" type="date" value={date} min={doc.docDate} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="row" style={{ gap: 6, flex: 1 }}>Ghi chú <input className="input" style={{ flex: 1 }} value={note} placeholder={short ? 'Bắt buộc khi nhận thiếu: thiếu do đâu' : 'Không bắt buộc'} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="full" style={{ overflowX: 'auto' }}>
        <table className="grid-table" style={{ width: '100%', minWidth: 820 }}>
          <thead><tr>
            <th style={{ width: 34 }}>#</th><th style={{ width: 120 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 60 }}>ĐVT</th>
            <th style={{ width: 230 }} title="Lô bên xuất đã xuất cho dòng này — hàng nhận vào đúng các lô này">Lô đã xuất</th>
            <th style={{ width: 90 }}>SL xuất</th><th style={{ width: 110 }} title="Số thủ kho đếm được khi nhận">Thực nhận</th><th style={{ width: 80 }}>Chênh</th>
          </tr></thead>
          <tbody>
            {doc.lines.map((l, i) => {
              const r = rec[l.lineKey] ?? 0;
              return (
                <tr key={l.lineKey}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td><td className="mono">{l.sku}</td><td>{l.name}</td><td>{l.unit}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{lotsOf(l.lineKey) || (l.lotNo ? `${l.lotNo}${l.expDate ? ` (${viDate(l.expDate)})` : ''}` : '')}</td>
                  <td className="num">{qtyText(l.qty)}</td>
                  <td><NumInput value={r} blankZero={false} onChange={(n) => setRec((x) => ({ ...x, [l.lineKey]: n ?? 0 }))} /></td>
                  <td className={`num ${r !== l.qty ? 'ck-over' : ''}`}>{r !== l.qty ? qtyText(r - l.qty) : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="ck-total"><td colSpan={5} style={{ textAlign: 'right' }}><b>Tổng</b></td><td className="num"><b>{qtyText(total)}</b></td><td className="num"><b>{qtyText(got)}</b></td><td className="num ck-over"><b>{got !== total ? qtyText(got - total) : ''}</b></td></tr></tfoot>
        </table>
      </div>
      {Boolean(error) && <div className="alert alert-bad full">{errorText(error)}</div>}
    </Modal>
  );
}
