// [2026-11-17 kiennt] DM10 — sửa thuế suất GTGT hàng loạt (đóng góp)
// [2026-11-17 05:37 PM kiennt] DM10 — đổi sang chế độ trên lưới: bấm Sửa thuế GTGT thì lưới thêm cột tích, tích mặt hàng cần sửa, chọn thuế, Ghi xong ẩn cột (đóng góp)
/**
 * THANH SỬA THUẾ GTGT HÀNG LOẠT (DM10) — hiện trên lưới khi bật chế độ "Sửa thuế GTGT"; lưới thêm cột tích để chọn mặt hàng.
 * Chọn thuế suất đầu ra từ Biểu thuế; mã thuế đầu vào tự theo cặp chuẩn (R10 ↔ V10…) như form mặt hàng.
 * Ghi từng mặt hàng qua PUT /api/v1/products/:sku chỉ với taxOutCode / taxInCode (ô khác giữ nguyên, có nhật ký từng mã).
 * Mặt hàng đã đúng thuế này thì bỏ qua.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';

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

export interface KetQuaSuaThue { tong: number; loi: string[]; nhan: string }

export function ThanhSuaThue({ rows, onBoTich, onXong, onThoat }: { rows: Dong[]; onBoTich: () => void; onXong: (kq: KetQuaSuaThue) => void; onThoat: () => void }) {
  const qc = useQueryClient();
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const [ma, setMa] = useState('');
  const [chay, setChay] = useState<{ xong: number; tong: number } | null>(null);

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
  const canDoi = ma ? rows.filter((p) => p.taxOutCode !== ma || p.taxInCode !== maVao(ma)) : [];

  const ghi = async () => {
    const list = canDoi;
    if (list.length > 200 && !window.confirm(`Đổi thuế suất của ${list.length.toLocaleString('vi-VN')} mặt hàng?`)) return;
    const body = { taxOutCode: ma, taxInCode: maVao(ma) };
    const loi: string[] = [];
    let xong = 0, i = 0;
    setChay({ xong, tong: list.length });
    const tho = async () => {
      while (i < list.length) {
        const p = list[i++]!;
        try { await api.put(`/api/v1/products/${encodeURIComponent(p.sku)}`, body); } catch (e) { loi.push(`${p.sku}: ${errorText(e)}`); }
        setChay({ xong: ++xong, tong: list.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(SONG_SONG, list.length) }, tho));
    void qc.invalidateQueries({ queryKey: ['products'] });
    const t = taxes.find((x) => x.code === ma);
    onXong({ tong: list.length, loi, nhan: t ? nhan(t) : ma });
  };

  const dangChay = Boolean(chay);
  const lyDoChan = !rows.length ? 'Tích các mặt hàng cần sửa ở cột đầu lưới' : !ma ? 'Chọn thuế suất GTGT mới' : !canDoi.length ? 'Các mặt hàng đã tích đã đúng thuế suất này' : '';
  return (
    <div className="alert alert-info" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <b>Sửa thuế GTGT:</b>
      <span>đã tích <b>{rows.length.toLocaleString('vi-VN')}</b> mặt hàng</span>
      {rows.length > 0 && !dangChay && <button type="button" className="btn btn-xs btn-ghost" onClick={onBoTich}>Bỏ tích hết</button>}
      <select className="select input" style={{ height: 28, width: 'auto', minWidth: 220 }} value={ma} disabled={dangChay} onChange={(e) => setMa(e.target.value)} title="Thuế suất GTGT bán ra mới">
        <option value="">— chọn thuế suất mới —</option>
        {outTaxes.map((t) => <option key={t.code} value={t.code}>{nhan(t)}</option>)}
      </select>
      {ma && rows.length > 0 && !dangChay && (
        <span className="muted" style={{ fontSize: 12 }}>
          sẽ đổi {canDoi.length.toLocaleString('vi-VN')}{rows.length - canDoi.length ? `, bỏ qua ${(rows.length - canDoi.length).toLocaleString('vi-VN')} đã đúng` : ''} · thuế vào {maVao(ma) ?? '(trống)'}
        </span>
      )}
      {dangChay && <progress max={chay!.tong} value={chay!.xong} style={{ width: 160 }} />}
      <span style={{ flex: 1 }} />
      <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(lyDoChan) || dangChay} title={lyDoChan || undefined} onClick={() => void ghi()}>
        {dangChay ? `Đang ghi ${chay!.xong}/${chay!.tong}…` : `Ghi${canDoi.length ? ` (${canDoi.length.toLocaleString('vi-VN')})` : ''}`}
      </button>
      <button type="button" className="btn btn-sm" disabled={dangChay} title={dangChay ? 'Đang ghi — chờ xong' : 'Thoát chế độ sửa thuế, không ghi'} onClick={onThoat}>Huỷ</button>
    </div>
  );
}
