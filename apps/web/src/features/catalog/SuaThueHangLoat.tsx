// [2026-11-17 kiennt] DM10 — sửa thuế suất GTGT hàng loạt (đóng góp)
// [2026-11-17 05:37 PM kiennt] DM10 — đổi sang chế độ trên lưới: bấm Sửa thuế GTGT thì lưới thêm cột tích, tích mặt hàng cần sửa, chọn thuế, Ghi xong ẩn cột (đóng góp)
// [2026-11-19 kiennt] NT-DM-012 — chọn loại thuế cố định, một loại cho bán và mua (bỏ cặp mã R/V) (đóng góp)
/**
 * THANH SỬA THUẾ GTGT HÀNG LOẠT (DM10) — hiện trên lưới khi bật chế độ "Sửa thuế GTGT"; lưới thêm cột tích để chọn mặt hàng.
 * Chọn một loại thuế cố định (NT-DM-012: KCT · 0 · 5 · 8 · 10 · KKKN) — ghi cùng một loại cho bán ra và mua vào.
 * Ghi từng mặt hàng qua PUT /api/v1/products/:sku chỉ với taxOutCode / taxInCode (ô khác giữ nguyên, có nhật ký từng mã).
 * Mặt hàng đã đúng thuế này thì bỏ qua.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ChonThue, nhanLoai, useLoaiThue } from '@/lib/thueGtgt';

interface Dong { sku: string; name: string; taxOutCode: string | null; taxInCode: string | null }

/** Số yêu cầu ghi chạy song song. */
const SONG_SONG = 4;

export interface KetQuaSuaThue { tong: number; loi: string[]; nhan: string }

export function ThanhSuaThue({ rows, onBoTich, onXong, onThoat }: { rows: Dong[]; onBoTich: () => void; onXong: (kq: KetQuaSuaThue) => void; onThoat: () => void }) {
  const qc = useQueryClient();
  const taxes = useLoaiThue();
  const [ma, setMa] = useState('');
  const [chay, setChay] = useState<{ xong: number; tong: number } | null>(null);
  const nhan = (code: string) => { const t = taxes.find((x) => x.code === code); return t ? nhanLoai(t) : code; };
  const canDoi = ma ? rows.filter((p) => p.taxOutCode !== ma || p.taxInCode !== ma) : [];

  const ghi = async () => {
    const list = canDoi;
    if (list.length > 200 && !window.confirm(`Đổi thuế suất của ${list.length.toLocaleString('vi-VN')} mặt hàng?`)) return;
    const body = { taxOutCode: ma, taxInCode: ma };
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
    onXong({ tong: list.length, loi, nhan: nhan(ma) });
  };

  const dangChay = Boolean(chay);
  const lyDoChan = !rows.length ? 'Tích các mặt hàng cần sửa ở cột đầu lưới' : !ma ? 'Chọn thuế suất GTGT mới' : !canDoi.length ? 'Các mặt hàng đã tích đã đúng thuế suất này' : '';
  return (
    <div className="alert alert-info" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <b>Sửa thuế GTGT:</b>
      <span>đã tích <b>{rows.length.toLocaleString('vi-VN')}</b> mặt hàng</span>
      {rows.length > 0 && !dangChay && <button type="button" className="btn btn-xs btn-ghost" onClick={onBoTich}>Bỏ tích hết</button>}
      <ChonThue value={ma} trong style={{ height: 28, width: 'auto', minWidth: 220 }} disabled={dangChay} onChange={(c) => setMa(c)} title="Loại thuế GTGT mới — dùng chung cho bán và mua" />
      {ma && rows.length > 0 && !dangChay && (
        <span className="muted" style={{ fontSize: 12 }}>
          sẽ đổi {canDoi.length.toLocaleString('vi-VN')}{rows.length - canDoi.length ? `, bỏ qua ${(rows.length - canDoi.length).toLocaleString('vi-VN')} đã đúng` : ''}
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
