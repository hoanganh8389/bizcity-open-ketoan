// [2026-11-11 Nguyễn Văn Thủy] BỘ THAM SỐ BÁO CÁO ĐÃ LƯU — đặt tên, chọn lại một lần bấm, bộ mặc định khi mở báo cáo (đóng góp)
/**
 * Khối đầu bảng tham số báo cáo: chọn bộ đã lưu · Lưu · Xoá. Lưu NGUYÊN bộ tham số của màn (kỳ, chi nhánh, kho, tài khoản,
 * đối tượng, tuỳ chọn…) — màn chỉ cần đưa state đang xem (`value`) và hàm đặt lại (`onApply`).
 *   - Kỳ là kỳ chọn nhanh (Tháng này, Quý này, Năm nay…) thì lưu theo kỳ, không đóng cứng ngày: tháng sau mở vẫn là tháng mới.
 *   - "Mở báo cáo dùng bộ này": bộ mặc định tự áp khi mở màn (trừ khi mở từ liên kết có sẵn tham số trên địa chỉ).
 *   - Lưu trên trình duyệt theo người dùng và theo màn (như màn hay dùng, bộ chọn chi nhánh).
 */
import { createContext, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { Save, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { PERIOD_PRESETS, presetOf } from '@/lib/format';

type ThamSo = Record<string, unknown>;
interface Bo { name: string; value: ThamSo; ky?: string; macDinh?: boolean }
export interface BoThamSoProps { value: object; onApply: (v: never) => void; /** Mặc định = đường dẫn màn. Màn có nhiều thẻ báo cáo thì thêm hậu tố. */ id?: string }

// [2026-11-11 Nguyễn Văn Thủy] BỘ THAM SỐ THÔNG MINH: mọi màn có bảng tham số đều có; phần chi nhánh của bộ dùng lại ở mọi màn (thay "Chọn nhanh") (đóng góp)
/** Cầu nối ô chi nhánh (BranchCheckList) ↔ bộ tham số: ô chi nhánh tự đăng ký, không màn nào phải nối tay. */
export interface BranchBridge { get: () => string[]; set: (codes: string[]) => void }
export const BranchBridgeCtx = createContext<((b: BranchBridge | null) => void) | null>(null);
/** Bộ chi nhánh dùng chung mọi màn (khoá cũ của "Chọn nhanh": các bộ đã lưu trước vẫn còn). */
interface BoCN { name: string; codes: string[] }
const CN_KEY = 'ketoan.cn.presets';
const docCN = (): BoCN[] => { try { const v = JSON.parse(localStorage.getItem(CN_KEY) ?? '[]') as BoCN[]; return Array.isArray(v) ? v.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.codes)) : []; } catch { return []; } };
const ghiCN = (list: BoCN[]) => { try { localStorage.setItem(CN_KEY, JSON.stringify(list)); } catch { /* bỏ qua */ } };

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

export function BoThamSo({ value, onApply, id, bridge }: Partial<BoThamSoProps> & { bridge?: MutableRefObject<BranchBridge | null> }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const key = keyOf(user?.id ?? 'guest', id ?? pathname);
  const [list, setList] = useState<Bo[]>(() => doc(key));
  const [dang, setDang] = useState('');
  const [ten, setTen] = useState<string | null>(null);
  const [macDinh, setMacDinh] = useState(false);
  const cur = (value ?? {}) as ThamSo;
  const coMan = Boolean(value && onApply);
  const [cn, setCn] = useState<BoCN[]>(docCN);
  const apply = (b: Bo) => { setDang(b.name); onApply?.(giaTri(cur, b) as never); };
  // Bộ chi nhánh (của màn khác / bộ cũ): chỉ tích lại các chi nhánh, tham số khác giữ nguyên.
  const applyCN = (b: BoCN) => { setDang(`cn:${b.name}`); bridge?.current?.set(b.codes); };

  // Mở màn: áp bộ mặc định một lần (mở từ liên kết có tham số trên địa chỉ thì theo liên kết).
  const daMo = useRef(false);
  useEffect(() => {
    if (daMo.current) return;
    daMo.current = true;
    const b = coMan ? list.find((x) => x.macDinh) : undefined;
    if (b && !search) apply(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const luu = () => {
    const name = (ten ?? '').trim();
    if (!name) return;
    const ky = typeof cur.from === 'string' && typeof cur.to === 'string' ? presetOf(cur.from, cur.to) || undefined : undefined;
    // Chi nhánh đang tích luôn lưu thành bộ chi nhánh dùng chung (màn khác chọn được); đang tích tất cả thì không cần.
    const codes = bridge?.current?.get() ?? [];
    if (codes.length) {
      const nextCN = [...docCN().filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { name, codes }].sort((a, c) => a.name.localeCompare(c.name, 'vi'));
      setCn(nextCN); ghiCN(nextCN);
    }
    if (coMan) {
      const b: Bo = { name, value: cur, ...(ky ? { ky } : {}), ...(macDinh ? { macDinh: true } : {}) };
      const next = [...list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()).map((x) => (macDinh ? { ...x, macDinh: false } : x)), b].sort((a, c) => a.name.localeCompare(c.name, 'vi'));
      setList(next); ghi(key, next); setDang(name);
    } else if (codes.length) setDang(`cn:${name}`);
    else window.alert('Màn này chỉ lưu được bộ chi nhánh: hãy tích các chi nhánh cần lưu (không tích tất cả).');
    setTen(null);
  };
  const xoa = () => {
    const ten2 = dang.startsWith('cn:') ? dang.slice(3) : dang;
    if (!ten2 || !window.confirm(`Xoá bộ "${ten2}"?${dang.startsWith('cn:') ? ' (bộ chi nhánh dùng ở mọi màn)' : ''}`)) return;
    if (dang.startsWith('cn:')) { const n = docCN().filter((x) => x.name !== ten2); setCn(n); ghiCN(n); }
    else { const next = list.filter((x) => x.name !== dang); setList(next); ghi(key, next); }
    setDang('');
  };
  const doiMacDinh = () => {
    const next = list.map((x) => ({ ...x, macDinh: x.name === dang ? !x.macDinh : false }));
    setList(next); ghi(key, next);
  };
  const chon = list.find((x) => x.name === dang);
  const tenMan = new Set(list.map((x) => x.name.toLowerCase()));
  const cnKhac = cn.filter((x) => !tenMan.has(x.name.toLowerCase()));
  const tong = list.length + cnKhac.length;

  return (
    <div className="bo-tham-so" data-no-search>
      <div className="bo-ts-row">
        <select className="select input" value={dang} title="Bộ tham số đã lưu: chọn để áp ngay (kỳ, chi nhánh, kho, tài khoản…)"
          onChange={(e) => { const v = e.target.value; const b = list.find((x) => x.name === v); const c = cn.find((x) => `cn:${x.name}` === v); if (b) apply(b); else if (c) applyCN(c); else setDang(''); }}>
          <option value="">{tong ? '— Bộ tham số đã lưu —' : '— Chưa lưu bộ tham số nào —'}</option>
          {list.length > 0 && <optgroup label="Của màn này">{list.map((b) => <option key={b.name} value={b.name}>{b.macDinh ? '★ ' : ''}{b.name}{b.ky ? ` · ${kyLabel(b.ky)}` : ''}</option>)}</optgroup>}
          {cnKhac.length > 0 && <optgroup label="Bộ chi nhánh (dùng mọi màn)">{cnKhac.map((b) => <option key={b.name} value={`cn:${b.name}`}>{b.name} · {b.codes.length} CN</option>)}</optgroup>}
        </select>
        <button type="button" className="btn btn-sm" title={coMan ? 'Lưu các tham số đang chọn thành một bộ có tên (trùng tên thì ghi đè); chi nhánh đang tích dùng lại được ở mọi màn' : 'Lưu các chi nhánh đang tích thành bộ có tên, dùng lại ở mọi màn'} onClick={() => { setTen(dang.startsWith('cn:') ? dang.slice(3) : dang); setMacDinh(Boolean(chon?.macDinh)); }}><Save size={13} /></button>
        {coMan && <button type="button" className={`btn btn-sm${chon?.macDinh ? ' on' : ''}`} disabled={!chon} title={chon?.macDinh ? 'Đang là bộ mặc định khi mở báo cáo — bấm để bỏ' : 'Đặt làm bộ mặc định khi mở báo cáo'} onClick={doiMacDinh}><Star size={13} fill={chon?.macDinh ? 'currentColor' : 'none'} /></button>}
      </div>
      {ten !== null && (
        <form className="bo-ts-new" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); luu(); }}>
          <input className="input" autoFocus placeholder="Tên bộ, vd: Tháng này – CN Phú Thọ" value={ten} onChange={(e) => setTen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setTen(null); } }} />
          {coMan && <label className="checkbox" title="Mở báo cáo này là tự áp bộ tham số này"><input type="checkbox" checked={macDinh} onChange={(e) => setMacDinh(e.target.checked)} /> Mở báo cáo dùng bộ này</label>}
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
