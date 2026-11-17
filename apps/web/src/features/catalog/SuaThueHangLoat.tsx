// [2026-11-17 05:09 PM kiennt] DM10 — sửa thuế suất GTGT hàng loạt: mặt hàng đang chọn hoặc mọi mặt hàng đang hiện trên lưới (đóng góp)
/**
 * SỬA THUẾ GTGT HÀNG LOẠT (DM10). Chọn phạm vi (mặt hàng đang chọn / các dòng đang hiện trên lưới sau khi lọc nhóm, lọc cột),
 * chọn thuế suất đầu ra từ Biểu thuế; mã thuế đầu vào tự theo cặp chuẩn (R10 ↔ V10…) như form mặt hàng.
 * Ghi từng mặt hàng qua PUT /api/v1/products/:sku chỉ với taxOutCode / taxInCode (ô khác giữ nguyên, có nhật ký từng mã).
 * Mặt hàng đã đúng thuế này thì bỏ qua.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { Field, Modal } from '@/components/ui';

interface TaxCode { code: string; name: string; direction: string; isActive: boolean; rate?: number }
interface Dong { sku: string; name: string; taxOutCode: string | null; taxInCode: string | null }

/** Thuế suất thường dùng → cặp mã VAT ra / vào chuẩn (như ProductFullForm). */
const VAT_RATES = [
  { key: 'kct', label: 'KCT', out: 'KCT', in: 'V13K' },
  { key: '0', label: '0%', out: 'R00', in: 'V00' },
  { key: '5', label: '5%', out: 'R05', in: 'V05' },
  { key: '8', label: '8%', out: 'R08', in: 'V08' },
  { key: '10', label: '10%', out: 'R10', in: 'V10' },
];
/** Số yêu cầu ghi chạy song song. */
const SONG_SONG = 4;

export function SuaThueHangLoat({ sel, view, onClose }: { sel: Dong | null; view: () => Dong[]; onClose: () => void }) {
  const qc = useQueryClient();
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const [dangHien] = useState(() => view());
  const [phamVi, setPhamVi] = useState<'sel' | 'view'>(sel && dangHien.length <= 1 ? 'sel' : 'view');
  const [ma, setMa] = useState('');
  const [chay, setChay] = useState<{ xong: number; tong: number; loi: string[]; done: boolean } | null>(null);

  const outTaxes = useMemo(() => {
    const std = VAT_RATES.map((r) => r.out);
    return taxes.filter((t) => t.direction === 'output' && t.isActive)
      .sort((a, b) => { const ia = std.indexOf(a.code), ib = std.indexOf(b.code); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.code.localeCompare(b.code); });
  }, [taxes]);
  const nhan = (t: TaxCode) => { const s = VAT_RATES.find((r) => r.out === t.code); return s ? `${s.label} — ${t.code} ${t.name}` : `${t.code} — ${t.name}`; };
  // Mã đầu vào theo cặp chuẩn; không có ở Biểu thuế thì để trống (như form mặt hàng).
  const maVao = (code: string) => {
    const t = taxes.find((x) => x.code === code);
    const std = VAT_RATES.find((r) => r.out === code) ?? VAT_RATES.find((r) => r.key !== 'kct' && Number(r.key) === Number(t?.rate));
    return std && taxes.some((x) => x.code === std.in && x.direction === 'input') ? std.in : null;
  };

  const ds = phamVi === 'sel' ? (sel ? [sel] : []) : dangHien;
  const canDoi = ma ? ds.filter((p) => p.taxOutCode !== ma || p.taxInCode !== maVao(ma)) : [];

  const ghi = async () => {
    const list = canDoi;
    if (list.length > 200 && !window.confirm(`Đổi thuế suất của ${list.length.toLocaleString('vi-VN')} mặt hàng?`)) return;
    const body = { taxOutCode: ma, taxInCode: maVao(ma) };
    const st = { xong: 0, tong: list.length, loi: [] as string[], done: false };
    setChay({ ...st });
    let i = 0;
    const tho = async () => {
      while (i < list.length) {
        const p = list[i++]!;
        try { await api.put(`/api/v1/products/${encodeURIComponent(p.sku)}`, body); } catch (e) { st.loi.push(`${p.sku}: ${errorText(e)}`); }
        st.xong++;
        setChay({ ...st, loi: [...st.loi] });
      }
    };
    await Promise.all(Array.from({ length: Math.min(SONG_SONG, list.length) }, tho));
    setChay({ ...st, loi: [...st.loi], done: true });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const dangChay = Boolean(chay && !chay.done);
  const lyDoChan = !ma ? 'Chọn thuế suất GTGT' : !ds.length ? 'Chưa chọn mặt hàng nào' : !canDoi.length ? 'Các mặt hàng đã đúng thuế suất này' : '';
  return (
    <Modal title="Sửa thuế GTGT hàng loạt" onClose={() => !dangChay && onClose()}
      footer={<>
        {!chay?.done && <button className="btn btn-primary" disabled={Boolean(lyDoChan) || dangChay} title={lyDoChan || undefined} onClick={() => void ghi()}>{dangChay ? `Đang ghi ${chay!.xong}/${chay!.tong}…` : `Ghi ${canDoi.length.toLocaleString('vi-VN')} mặt hàng`}</button>}
        <button className="btn" disabled={dangChay} title={dangChay ? 'Đang ghi — chờ xong rồi đóng' : undefined} onClick={onClose}>Thoát</button>
      </>}>
      <Field label="Áp dụng cho" full>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="checkbox"><input type="radio" checked={phamVi === 'sel'} disabled={!sel || Boolean(chay)} onChange={() => setPhamVi('sel')} />
            {sel ? <>Mặt hàng đang chọn: <b className="mono">{sel.sku}</b> {sel.name}</> : <span className="muted">Mặt hàng đang chọn (chưa chọn dòng nào)</span>}</label>
          <label className="checkbox"><input type="radio" checked={phamVi === 'view'} disabled={!dangHien.length || Boolean(chay)} onChange={() => setPhamVi('view')} />
            <b>{dangHien.length.toLocaleString('vi-VN')}</b>&nbsp;mặt hàng đang hiện trên lưới (theo nhóm hàng và lọc cột đang đặt)</label>
        </div>
      </Field>
      <Field label="Thuế suất GTGT mới (*)" full>
        <select className="select input" value={ma} disabled={Boolean(chay)} onChange={(e) => setMa(e.target.value)}>
          <option value="">— chọn —</option>
          {outTaxes.map((t) => <option key={t.code} value={t.code}>{nhan(t)}</option>)}
        </select>
      </Field>
      {ma && !chay && (
        <div className="full muted" style={{ fontSize: 12 }}>
          Sẽ đổi <b>{canDoi.length.toLocaleString('vi-VN')}</b> mặt hàng{ds.length - canDoi.length ? `, bỏ qua ${(ds.length - canDoi.length).toLocaleString('vi-VN')} mặt hàng đã đúng thuế này` : ''}.
          Thuế đầu vào: {maVao(ma) ?? '(để trống — Biểu thuế chưa có mã đầu vào tương ứng)'}.
        </div>
      )}
      {chay && (
        <div className="full" style={{ fontSize: 13 }}>
          {chay.done ? <div className={chay.loi.length ? 'alert alert-warn' : 'alert alert-info'}>Đã ghi {(chay.tong - chay.loi.length).toLocaleString('vi-VN')}/{chay.tong.toLocaleString('vi-VN')} mặt hàng{chay.loi.length ? `, lỗi ${chay.loi.length}` : ''}.</div>
            : <progress max={chay.tong} value={chay.xong} style={{ width: '100%' }} />}
          {chay.loi.length > 0 && <ul style={{ maxHeight: 160, overflowY: 'auto', margin: '6px 0 0 18px', fontSize: 12 }}>{chay.loi.map((l) => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}
    </Modal>
  );
}
