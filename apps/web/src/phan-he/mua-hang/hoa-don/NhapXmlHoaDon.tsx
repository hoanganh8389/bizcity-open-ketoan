// [2026-11-06 10:40 PM Nguyễn Văn Thủy] MH22 — nhập nhiều hoá đơn điện tử XML kèm PDF / ZIP cùng tên, gửi từng hoá đơn một (đóng góp)
/**
 * NHẬP HOÁ ĐƠN ĐIỆN TỬ XML: chọn nhiều tệp, tệp cùng tên (bỏ đuôi _GDT, _NCC) đi với nhau thành một hoá đơn.
 * Máy chủ đọc XML, tìm hoặc tạo NCC theo MST, đính kèm tệp gốc. Mỗi hoá đơn gửi riêng: hoá đơn lỗi không ảnh hưởng hoá đơn khác.
 */
import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { invoiceApi, type IngestResult, type IngestStatus } from './api';

const GIOI_HAN = 18 * 1024 * 1024;
const NHAN: Record<IngestStatus | 'error', [string, string]> = {
  saved: ['Đã nhập', 'badge-ok'], duplicate: ['Đã có', 'badge-gray'], replaced_or_cancelled: ['Bị thay thế / huỷ', 'badge-warn'],
  previously_cancelled: ['Đã huỷ trước đó', 'badge-gray'], wrong_buyer: ['Sai người mua', 'badge-bad'], partner_ambiguous: ['Trùng MST', 'badge-warn'], error: ['Lỗi', 'badge-bad'],
};
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f); });
const goc = (name: string) => name.replace(/\.[^.]+$/, '').replace(/_(GDT|NCC)(_html)?$/i, '').toLowerCase();
const duoi = (f: File) => f.name.split('.').pop()!.toLowerCase();

interface Dong { ten: string; status: IngestStatus | 'error'; text: string; r?: IngestResult }

export function NhapXmlHoaDon({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Dong[]>([]);
  const [busy, setBusy] = useState('');
  const [thieu, setThieu] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (list: File[]) => {
    const nhom = new Map<string, File[]>();
    for (const f of list) nhom.set(goc(f.name), [...(nhom.get(goc(f.name)) ?? []), f]);
    const out: Dong[] = [];
    const khongXml: string[] = [];
    let i = 0;
    const nhomXml = [...nhom.values()].filter((g) => g.some((f) => duoi(f) === 'xml') || (khongXml.push(g[0]!.name), false));
    setThieu(khongXml);
    setRows([]);
    for (const g of nhomXml) {
      i += 1;
      const xml = g.find((f) => duoi(f) === 'xml')!;
      setBusy(`Đang nhập ${i}/${nhomXml.length}…`);
      try {
        if (g.reduce((s, f) => s + f.size, 0) > GIOI_HAN) throw new Error('Tệp của hoá đơn này vượt 18 MB');
        const files = await Promise.all(g.filter((f) => f !== xml).map(async (f) => ({
          fileName: f.name, mime: f.type || 'application/octet-stream', kind: duoi(f) === 'pdf' ? 'hoa_don' as const : 'khac' as const, dataBase64: await toBase64(f),
        })));
        const r = await invoiceApi.ingestXml({ fileName: xml.name, xmlBase64: await toBase64(xml), files });
        out.push({ ten: r.label, status: r.status, text: [r.message, ...r.warnings].join('. '), r });
      } catch (e) {
        out.push({ ten: xml.name, status: 'error', text: e instanceof Error && !('code' in e) ? e.message : errorText(e) });
      }
      setRows([...out]);
    }
    setBusy('');
    if (input.current) input.current.value = '';
    if (out.some((x) => x.status === 'saved' || x.status === 'duplicate')) onDone();
  };

  const dem = (s: Dong['status']) => rows.filter((x) => x.status === s).length;
  return (
    <Modal wide title="Nhập hoá đơn điện tử XML" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn" disabled={Boolean(busy)} title="Chọn cùng lúc XML, PDF, ZIP. Tệp cùng tên được đính vào cùng một hoá đơn" onClick={() => input.current?.click()}><FileUp size={14} /> {busy || 'Chọn tệp XML, PDF, ZIP…'}</button>
          <input ref={input} type="file" hidden multiple accept=".xml,.pdf,.zip" onChange={(e) => e.target.files?.length && void pick([...e.target.files])} />
          {!!rows.length && !busy && <span style={{ fontSize: 13 }}>Đã nhập {dem('saved')} · Đã có {dem('duplicate')} · Lỗi {dem('error')}</span>}
        </div>
        {!!thieu.length && <div className="alert alert-warn" style={{ marginTop: 6 }} title={thieu.join('\n')}>{thieu.length} tệp không có XML đi kèm nên chưa nhập: {thieu.slice(0, 5).join(', ')}{thieu.length > 5 ? '…' : ''}</div>}
        {!!rows.length && (
          <table className="mh-mini" style={{ marginTop: 8 }}>
            <thead><tr>
              <th title="Ký hiệu và số hoá đơn, hoặc tên tệp nếu chưa đọc được">Hoá đơn</th>
              <th title="Kết quả nhập hoá đơn này">Kết quả</th>
              <th title="Mã nhà cung cấp, tìm theo mã số thuế người bán">NCC</th>
              <th className="num" title="Số dòng hàng đã lưu">Dòng</th>
              <th className="num" title="Số dòng chưa biết là mã nào bên mình: mở hoá đơn để chọn">Chưa nhận diện</th>
              <th className="num" title="Số tệp mới đính vào hoá đơn lần này">Tệp mới</th>
              <th title="Giải thích chi tiết">Ghi chú</th>
            </tr></thead>
            <tbody>
              {rows.map((x, k) => (
                <tr key={k}>
                  <td className="mono">{x.ten}</td><td><span className={`badge ${NHAN[x.status][1]}`}>{NHAN[x.status][0]}</span></td><td className="mono">{x.r?.partnerCode}</td>
                  <td className="num">{x.r?.lines}</td><td className="num">{x.r?.unmatched || ''}</td><td className="num">{x.r?.attached || ''}</td><td>{x.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
