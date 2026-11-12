// [2026-11-12 kiennt] NT-QUY-001 — khung đính kèm chứng từ gốc dùng chung (phiếu chuyển tiền, phiếu chuyển kho, biên bản kiểm kê)
/**
 * ĐÍNH KÈM CHỨNG TỪ GỐC của một chứng từ (ảnh / PDF uỷ nhiệm chi, sao kê, biên lai, hoá đơn, biên bản ký tay…).
 * Gọi API đính kèm chung `/api/v1/document-attachments` với khoá `ledger.event:<docKey>` — tệp gắn theo chứng từ, không theo
 * phiên bản: sửa phiếu sang phiên bản mới, huỷ phiếu, kỳ đã khoá vẫn giữ / xem / đính được (đính tệp không đổi sổ).
 *   - Kéo thả hoặc chọn tệp, tối đa 15 MB / tệp; gửi lại đúng tệp đã có thì không thêm bản trùng (máy chủ so sha256).
 *   - Bấm tên tệp: PDF / ảnh xem nhanh trên web, loại khác tải về. Gỡ tệp = ẩn khỏi danh sách, không xoá hẳn.
 *   - Người chỉ có quyền xem chứng từ (documents:read): xem, tải; không thấy nút đính / gỡ.
 * Bọc data-view-ok: dùng được khi hộp thoại chứng từ đang ở chế độ Xem.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Modal } from '@/components/ui';
import './dinh-kem.css';

export const MAX_TEP_BYTES = 15 * 1024 * 1024;

/** Loại tệp chứng từ gốc (khoá theo khuôn của API: chữ thường, số, gạch dưới). */
export const LOAI_TEP: Record<string, string> = {
  chung_tu_goc: 'Chứng từ gốc',
  uy_nhiem_chi: 'Uỷ nhiệm chi',
  sao_ke: 'Sao kê / giấy báo ngân hàng',
  bien_lai: 'Biên lai / giấy nộp tiền',
  hoa_don: 'Hoá đơn',
  bien_ban: 'Biên bản',
  khac: 'Khác',
};

export interface TepDinhKem { id: string; docRef: string; kind: string; fileName: string; contentType: string; sizeBytes: number; note: string; createdBy: string; createdAt: string }

/** Khoá chứng từ cho API đính kèm; null khi chưa có (phiếu chưa ghi) hoặc mã không hợp lệ (có khoảng trắng). */
export const docRefOf = (docKey: string | null | undefined): string | null =>
  docKey && !/\s/.test(docKey) && docKey.length <= 200 ? `ledger.event:${docKey}` : null;

export const dungLuong = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(f); });
const xemDuoc = (f: TepDinhKem) => f.contentType.includes('pdf') || f.contentType.startsWith('image/') || /\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(f.fileName);
const fileUrl = (id: string) => `/api/v1/document-attachments/${encodeURIComponent(id)}/file`;

export const dinhKemApi = {
  list: (docRef: string) => api.get<{ docRef: string; files: TepDinhKem[] }>('/api/v1/document-attachments', { docRef }),
  add: (b: { docRef: string; kind: string; fileName: string; contentType: string; dataBase64: string }) => api.post<TepDinhKem & { created: boolean }>('/api/v1/document-attachments', b),
  archive: (id: string) => api.post(`/api/v1/document-attachments/${encodeURIComponent(id)}/archive`, {}),
  download: (f: TepDinhKem) => api.download(fileUrl(f.id), {}, f.fileName),
};

/** Tên người gửi: danh sách người dùng (người quản trị đọc được), chính mình, còn lại "Người dùng #id". */
function useTenNguoi() {
  const { user } = useAuth();
  const users = useQuery({ queryKey: ['users', 'ten'], queryFn: () => api.get<{ id: string; fullName: string }[]>('/api/v1/users'), retry: false, staleTime: 10 * 60_000 });
  return (actor: string) => {
    const id = actor.startsWith('user:') ? actor.slice(5) : actor;
    if (user && String(user.id) === id) return user.fullName;
    const u = users.data?.find((x) => String(x.id) === id);
    return u?.fullName ?? (actor.startsWith('user:') ? `Người dùng #${id}` : actor);
  };
}

export function TepChungTu({ docRef, defaultKind = 'chung_tu_goc', title = 'Đính kèm' }: { docRef: string | null; defaultKind?: string; title?: string }) {
  const { can } = useAuth();
  const ghi = can('documents:write');
  const tenNguoi = useTenNguoi();
  const q = useQuery({ queryKey: ['dinh-kem', docRef], queryFn: () => dinhKemApi.list(docRef!), enabled: Boolean(docRef) });
  const kind = defaultKind;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [drag, setDrag] = useState(false);
  const [xem, setXem] = useState<TepDinhKem | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    setBusy(true); setErr(''); setNote('');
    try {
      let trung = 0;
      for (const f of [...files]) {
        if (f.size > MAX_TEP_BYTES) throw new Error(`${f.name}: tệp tối đa 15 MB`);
        if (!f.size) throw new Error(`${f.name}: tệp rỗng`);
        const r = await dinhKemApi.add({ docRef: docRef!, kind, fileName: f.name, contentType: f.type || 'application/octet-stream', dataBase64: await toBase64(f) });
        if (!r.created) trung++;
      }
      if (trung) setNote(`${trung} tệp đã có sẵn trên phiếu — không thêm bản trùng.`);
      await q.refetch();
    } catch (e) { setErr(e instanceof Error && !('code' in e) ? e.message : errorText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const go = async (f: TepDinhKem) => {
    if (!window.confirm(`Gỡ tệp ${f.fileName} khỏi phiếu?\nTệp không bị xoá hẳn (vẫn tra lại được trong nhật ký).`)) return;
    try { await dinhKemApi.archive(f.id); await q.refetch(); } catch (e) { setErr(errorText(e)); }
  };

  const files = q.data?.files ?? [];
  // Giao diện theo kiểu MISA: tiêu đề "Đính kèm · Dung lượng tối đa", ô viền đứt có "Chọn tệp hoặc kéo và thả tệp vào đây",
  // danh sách tệp gọn bên dưới. Loại tệp lấy theo màn (defaultKind) — không bắt chọn.
  return (
    <div className="dk-box" data-view-ok>
      <div className="dk-head"><Paperclip size={16} /> <span className="dk-title">{title}</span><span className="dk-hint">Dung lượng tối đa 15MB</span></div>
      {!docRef ? <div className="dk-drop dk-off">Ghi phiếu trước rồi mới gắn tệp.</div> : <>
        {ghi && (
          <div className={`dk-drop ${drag ? 'on' : ''}`} data-view-ok
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
            <Upload size={18} />
            {busy ? <span>Đang gửi…</span> : <span><button type="button" className="dk-link" data-view-ok onClick={() => input.current?.click()}>Chọn tệp</button> hoặc kéo và thả tệp vào đây</span>}
            <input ref={input} type="file" multiple hidden data-view-ok onChange={(e) => e.target.files && void upload(e.target.files)} />
          </div>
        )}
        {err && <div className="alert alert-bad dk-msg">{err}</div>}
        {note && <div className="alert alert-warn dk-msg">{note}</div>}
        {files.length > 0 && (
          <ul className="dk-list">
            {files.map((f) => (
              <li key={f.id} title={`${LOAI_TEP[f.kind] ?? f.kind} · gửi bởi ${tenNguoi(f.createdBy)} lúc ${new Date(f.createdAt).toLocaleString('vi-VN', { hour12: false })}`}>
                <button type="button" data-view-ok className="dk-file" onClick={() => (xemDuoc(f) ? setXem(f) : void dinhKemApi.download(f).catch((e) => setErr(errorText(e))))}>
                  {xemDuoc(f) ? <Eye size={14} /> : <Paperclip size={14} />}<span>{f.fileName}</span>
                </button>
                <span className="dk-meta">{dungLuong(f.sizeBytes)} · {tenNguoi(f.createdBy)} · {new Date(f.createdAt).toLocaleString('vi-VN', { hour12: false })}</span>
                <button type="button" data-view-ok className="dk-icon" title="Tải về" onClick={() => void dinhKemApi.download(f).catch((e) => setErr(errorText(e)))}><Download size={14} /></button>
                {ghi && <button type="button" data-view-ok className="dk-icon dk-del" title="Gỡ tệp khỏi phiếu (không xoá hẳn)" onClick={() => void go(f)}><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
        {!ghi && !q.isLoading && !files.length && <div className="muted dk-msg">Chưa có tệp nào.</div>}
        {q.error && <div className="alert alert-bad dk-msg">{errorText(q.error)}</div>}
      </>}
      {xem && <XemNhanh file={xem} onClose={() => setXem(null)} />}
    </div>
  );
}

/** Xem nhanh PDF / ảnh ngay trên web (không phải tải về). */
function XemNhanh({ file, onClose }: { file: TepDinhKem; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const pdf = file.contentType.includes('pdf') || /\.pdf$/i.test(file.fileName);
  useEffect(() => {
    let u = '';
    api.blob(fileUrl(file.id)).then((b) => { u = URL.createObjectURL(pdf ? new Blob([b], { type: 'application/pdf' }) : b); setUrl(u); }).catch((e) => setErr(errorText(e)));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [file.id, pdf]);
  return (
    <Modal wide title={file.fileName} onClose={onClose}
      footer={<><button type="button" className="btn" data-view-ok onClick={() => void dinhKemApi.download(file)}><Download size={14} /> Tải về</button><button type="button" className="btn" data-view-ok onClick={onClose}>Đóng</button></>}>
      {err && <div className="alert alert-bad full">{err}</div>}
      {!err && !url && <div className="muted full">Đang tải…</div>}
      {url && <div className="full">{pdf ? <iframe title={file.fileName} src={url} className="dk-pdf" /> : <img src={url} alt={file.fileName} className="dk-img" />}</div>}
    </Modal>
  );
}
