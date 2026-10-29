/**
 * Tệp đính kèm (hợp đồng, CO, CQ, báo giá, hoá đơn, biên bản…) của một NCC, một chứng từ hay một chính sách.
 * Kéo thả hoặc chọn tệp (tối đa 15 MB / tệp), chọn loại; nội dung lưu trên ổ dữ liệu ERP, ghi người gửi + thời gian.
 * Bấm tên tệp = xem nhanh ngay trên web (PDF, ảnh, Excel); nút tải về để mở bằng phần mềm trên máy.
 */
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { errorText } from '@/lib/api';
import { purchaseApi, type Attachment, type OwnerType } from '../du-lieu';
import { XemTep, canPreview } from './XemTep';

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f); });

export function TepDinhKem({ ownerType, ownerId, defaultKind = 'khac', compact }: { ownerType: OwnerType; ownerId: string; defaultKind?: string; compact?: boolean }) {
  const q = useQuery({ queryKey: ['mua-hang', 'att', ownerType, ownerId], queryFn: () => purchaseApi.attachments(ownerType, ownerId), enabled: Boolean(ownerId) && !ownerId.startsWith('new-') });
  const [kind, setKind] = useState(defaultKind);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (!ownerId || ownerId.startsWith('new-')) return <div className="muted" style={{ fontSize: 12 }}>Ghi phiếu trước rồi mới gắn tệp.</div>;
  const upload = async (files: FileList | File[]) => {
    setBusy(true); setErr('');
    try {
      for (const f of [...files]) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name}: quá 15 MB`);
        await purchaseApi.addAttachment({ ownerType, ownerId, kind, fileName: f.name, mime: f.type, dataBase64: await toBase64(f) });
      }
      await q.refetch();
    } catch (e) { setErr(e instanceof Error && !('code' in e) ? e.message : errorText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const kinds = q.data?.kinds ?? { khac: 'Khác' };
  return (
    <div>
      <div className={`mh-drop ${drag ? 'on' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
        <Upload size={18} />
        <span>{busy ? 'Đang gửi…' : 'Kéo thả tệp vào đây hoặc'}</span>
        <select className="select input" style={{ width: 170, height: 28 }} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>Chọn tệp…</button>
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{err}</div>}
      <table className="mh-mini" style={{ marginTop: 6 }}>
        {!compact && <thead><tr><th>Loại</th><th>Tệp</th><th className="num">Dung lượng</th><th>Người gửi</th><th>Thời gian</th><th /></tr></thead>}
        <tbody>
          {(q.data?.files ?? []).map((f) => (
            <tr key={f.id}>
              <td><span className="badge badge-info">{f.kindLabel}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}><button type="button" data-view-ok className="btn btn-xs btn-ghost" onClick={() => (canPreview(f) ? setPreview(f) : void purchaseApi.openAttachment(f))} title={canPreview(f) ? 'Xem nhanh trên web' : 'Tải về'}>{canPreview(f) ? <Eye size={12} /> : <Paperclip size={12} />} {f.fileName}</button>
                <button type="button" data-view-ok className="btn btn-xs btn-ghost" title="Tải về" onClick={() => void purchaseApi.openAttachment(f)}><Download size={12} /></button></td>
              {!compact && <><td className="num">{size(f.size)}</td><td>{f.uploadedBy}</td><td>{new Date(f.createdAt).toLocaleString('vi-VN', { hour12: false })}</td></>}
              <td><button type="button" className="btn btn-xs" title="Xoá tệp" onClick={() => { if (window.confirm(`Xoá tệp ${f.fileName}?`)) void purchaseApi.deleteAttachment(f.id).then(() => q.refetch()); }}><Trash2 size={12} /></button></td>
            </tr>
          ))}
          {!q.isLoading && !(q.data?.files ?? []).length && <tr><td colSpan={6} className="muted">Chưa có tệp nào.</td></tr>}
        </tbody>
      </table>
      {preview && <XemTep file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
