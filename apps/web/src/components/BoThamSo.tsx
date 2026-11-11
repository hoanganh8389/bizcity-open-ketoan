// [2026-11-11 Nguyễn Văn Thủy] BỘ THAM SỐ BÁO CÁO ĐÃ LƯU — đặt tên, chọn lại một lần bấm, bộ mặc định khi mở báo cáo (đóng góp)
/**
 * Khối đầu bảng tham số báo cáo: chọn bộ đã lưu · Lưu · Xoá. Lưu NGUYÊN bộ tham số của màn (kỳ, chi nhánh, kho, tài khoản,
 * đối tượng, tuỳ chọn…) — màn chỉ cần đưa state đang xem (`value`) và hàm đặt lại (`onApply`).
 *   - Kỳ là kỳ chọn nhanh (Tháng này, Quý này, Năm nay…) thì lưu theo kỳ, không đóng cứng ngày: tháng sau mở vẫn là tháng mới.
 *   - "Mở báo cáo dùng bộ này": bộ mặc định tự áp khi mở màn (trừ khi mở từ liên kết có sẵn tham số trên địa chỉ).
 *   - Lưu trên trình duyệt theo người dùng và theo màn (như màn hay dùng, bộ chọn chi nhánh).
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Save, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { PERIOD_PRESETS, presetOf } from '@/lib/format';

type ThamSo = Record<string, unknown>;
interface Bo { name: string; value: ThamSo; ky?: string; macDinh?: boolean }
export interface BoThamSoProps { value: object; onApply: (v: never) => void; /** Mặc định = đường dẫn màn. Màn có nhiều thẻ báo cáo thì thêm hậu tố. */ id?: string }

const keyOf = (user: string, id: string) => `ketoan.bo-tham-so.${user}.${id}`;
const doc = (key: string): Bo[] => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as Bo[]; } catch { return []; } };
const ghi = (key: string, list: Bo[]) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* chế độ riêng tư */ } };
const kyLabel = (k?: string) => PERIOD_PRESETS.find((p) => p.key === k)?.label;

/** Giá trị áp: tham số đang có + bộ đã lưu (trường mới thêm sau giữ nguyên); kỳ chọn nhanh tính lại theo hôm nay. */
function giaTri(cur: ThamSo, b: Bo): ThamSo {
  const v: ThamSo = { ...cur, ...b.value };
  const p = PERIOD_PRESETS.find((x) => x.key === b.ky);
  if (p && 'from' in v && 'to' in v) [v.from, v.to] = p.range();
  return v;
}

export function BoThamSo({ value, onApply, id }: BoThamSoProps) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const key = keyOf(user?.id ?? 'guest', id ?? pathname);
  const [list, setList] = useState<Bo[]>(() => doc(key));
  const [dang, setDang] = useState('');
  const [ten, setTen] = useState<string | null>(null);
  const [macDinh, setMacDinh] = useState(false);
  const cur = value as ThamSo;
  const apply = (b: Bo) => { setDang(b.name); onApply(giaTri(cur, b) as never); };

  // Mở màn: áp bộ mặc định một lần (mở từ liên kết có tham số trên địa chỉ thì theo liên kết).
  const daMo = useRef(false);
  useEffect(() => {
    if (daMo.current) return;
    daMo.current = true;
    const b = list.find((x) => x.macDinh);
    if (b && !search) apply(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const luu = () => {
    const name = (ten ?? '').trim();
    if (!name) return;
    const ky = typeof cur.from === 'string' && typeof cur.to === 'string' ? presetOf(cur.from, cur.to) || undefined : undefined;
    const b: Bo = { name, value: cur, ...(ky ? { ky } : {}), ...(macDinh ? { macDinh: true } : {}) };
    const next = [...list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()).map((x) => (macDinh ? { ...x, macDinh: false } : x)), b].sort((a, c) => a.name.localeCompare(c.name, 'vi'));
    setList(next); ghi(key, next); setDang(name); setTen(null);
  };
  const xoa = () => {
    if (!dang || !window.confirm(`Xoá bộ tham số "${dang}"?`)) return;
    const next = list.filter((x) => x.name !== dang);
    setList(next); ghi(key, next); setDang('');
  };
  const doiMacDinh = () => {
    const next = list.map((x) => ({ ...x, macDinh: x.name === dang ? !x.macDinh : false }));
    setList(next); ghi(key, next);
  };
  const chon = list.find((x) => x.name === dang);

  return (
    <div className="bo-tham-so" data-no-search>
      <div className="bo-ts-row">
        <select className="select input" value={dang} title="Bộ tham số đã lưu: chọn để áp ngay (kỳ, chi nhánh, kho, tài khoản…)"
          onChange={(e) => { const b = list.find((x) => x.name === e.target.value); if (b) apply(b); else setDang(''); }}>
          <option value="">{list.length ? '— Bộ tham số đã lưu —' : '— Chưa lưu bộ tham số nào —'}</option>
          {list.map((b) => <option key={b.name} value={b.name}>{b.macDinh ? '★ ' : ''}{b.name}{b.ky ? ` · ${kyLabel(b.ky)}` : ''}</option>)}
        </select>
        <button type="button" className="btn btn-sm" title="Lưu các tham số đang chọn thành một bộ có tên (trùng tên thì ghi đè)" onClick={() => { setTen(dang); setMacDinh(Boolean(chon?.macDinh)); }}><Save size={13} /></button>
        <button type="button" className={`btn btn-sm${chon?.macDinh ? ' on' : ''}`} disabled={!chon} title={chon?.macDinh ? 'Đang là bộ mặc định khi mở báo cáo — bấm để bỏ' : 'Đặt làm bộ mặc định khi mở báo cáo'} onClick={doiMacDinh}><Star size={13} fill={chon?.macDinh ? 'currentColor' : 'none'} /></button>
        <button type="button" className="btn btn-sm" disabled={!chon} title="Xoá bộ tham số đang chọn" onClick={xoa}><Trash2 size={13} /></button>
      </div>
      {ten !== null && (
        <form className="bo-ts-new" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); luu(); }}>
          <input className="input" autoFocus placeholder="Tên bộ, vd: Tháng này – CN Phú Thọ" value={ten} onChange={(e) => setTen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setTen(null); } }} />
          <label className="checkbox" title="Mở báo cáo này là tự áp bộ tham số này"><input type="checkbox" checked={macDinh} onChange={(e) => setMacDinh(e.target.checked)} /> Mở báo cáo dùng bộ này</label>
          {typeof cur.from === 'string' && typeof cur.to === 'string' && (
            <span className="muted bo-ts-ky">{presetOf(cur.from, cur.to) ? `Kỳ lưu theo "${kyLabel(presetOf(cur.from, cur.to))}" — tự đổi theo ngày mở` : 'Kỳ lưu đúng ngày đang chọn'}</span>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={!ten.trim()}>Lưu</button>
            <button type="button" className="btn btn-sm" onClick={() => setTen(null)}>Huỷ</button>
          </div>
        </form>
      )}
    </div>
  );
}
