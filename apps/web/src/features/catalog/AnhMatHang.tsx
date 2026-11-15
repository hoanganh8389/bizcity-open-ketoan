// [2026-11-15 Nguyễn Văn Thủy] ảnh mặt hàng: dán đường dẫn hoặc tải ảnh từ máy; nhận ra ảnh thì hiện xem trước (đóng góp)
/**
 * Ô ẢNH MẶT HÀNG (thêm / sửa mặt hàng):
 *   - Dán đường dẫn ảnh (https://…) → hiện ảnh ngay; đường dẫn không phải ảnh / không tải được thì báo.
 *   - "Tải ảnh lên": chọn ảnh trong máy (jpg, png, webp, gif — tối đa 5 MB) → lưu vào tệp đính kèm của mặt hàng
 *     (docRef danh-muc.product-image:<mã hàng>, API /api/v1/document-attachments); ô ảnh ghi đường dẫn nội bộ của tệp.
 *   - Ảnh nội bộ cần đăng nhập mới xem được → tải bằng phiên đăng nhập rồi hiện (không dùng thẳng <img src>).
 */
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';

const MAX_BYTES = 5 * 1024 * 1024;
const noiBo = (url: string) => url.startsWith('/api/');

/** Đọc tệp thành base64 (bỏ phần đầu "data:…;base64,"). */
function base64(f: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });
}

/** Ảnh xem trước: ảnh nội bộ tải qua phiên đăng nhập, ảnh ngoài hiện thẳng. */
export function AnhXemTruoc({ url, size = 120, onBad }: { url: string; size?: number; onBad?: (bad: boolean) => void }) {
  const [src, setSrc] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setBad(false); onBad?.(false);
    if (!url) { setSrc(''); return; }
    if (!noiBo(url)) { setSrc(url); return; }
    let u = '';
    api.blob(url).then((b) => { u = URL.createObjectURL(b); setSrc(u); }).catch(() => { setBad(true); onBad?.(true); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!url) return null;
  if (bad) return <span className="neg" style={{ fontSize: 12 }}>Không nhận ra ảnh ở đường dẫn này</span>;
  return src ? <img src={src} alt="Ảnh mặt hàng" onError={() => { setBad(true); onBad?.(true); }} style={{ height: size, width: size, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} /> : null;
}

export function AnhMatHang({ value, sku, onChange, disabled }: { value: string; sku: string; onChange: (url: string) => void; disabled?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    if (!f.type.startsWith('image/')) { setErr('Chỉ chọn tệp ảnh (jpg, png, webp, gif).'); return; }
    if (f.size > MAX_BYTES) { setErr('Ảnh tối đa 5 MB.'); return; }
    setBusy(true);
    try {
      const ref = `danh-muc.product-image:${(sku || 'moi').replace(/\s+/g, '')}`;
      const r = await api.post<{ id: string }>('/api/v1/document-attachments', { docRef: ref, kind: 'product-image', fileName: f.name, contentType: f.type, dataBase64: await base64(f) });
      onChange(`/api/v1/document-attachments/${encodeURIComponent(r.id)}/file`);
    } catch (e) { setErr(`Chưa tải được ảnh: ${errorText(e)}`); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  return (
    <div className="anh-mh">
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <input className="input" value={noiBo(value) ? '(ảnh đã tải lên)' : value} disabled={disabled} readOnly={noiBo(value)} onChange={(e) => onChange(e.target.value.trim())} placeholder="Dán đường dẫn ảnh https://… hoặc bấm Tải ảnh lên" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={disabled || busy} title="Chọn ảnh trong máy (tối đa 5 MB)" onClick={() => file.current?.click()}>{busy ? 'Đang tải…' : 'Tải ảnh lên'}</button>
        {value && !disabled && <button type="button" className="btn btn-sm" title="Bỏ ảnh" onClick={() => onChange('')}>Bỏ ảnh</button>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      {err && <div className="neg" style={{ fontSize: 12, marginTop: 4 }}>{err}</div>}
      {value && <div style={{ marginTop: 6 }}><AnhXemTruoc url={value} /></div>}
    </div>
  );
}
