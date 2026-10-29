/**
 * KHUYẾN MẠI CỦA PHIẾU — như màn khuyến mại ở quầy bán hàng: phần mềm TỰ ÁP mỗi khi bảng hàng đổi, người dùng chỉ xem và bấm
 * xử lý những gì còn lệch.
 *   - KhuyenMaiBar: dải ngay trên bảng hàng ("đã tự áp N · cần xem N · gợi ý N" + thay đổi vừa tự làm) — luôn thấy;
 *   - KhuyenMaiPanel: khung trong Trợ lý bên phải, liệt kê theo 3 nhóm, mỗi dòng có nút xử lý;
 *   - BangKhuyenMai: bảng đầy đủ (modal) — Trạng thái · Loại · Chương trình · Mã · Nội dung · Được / Trên phiếu · Xử lý.
 * Dữ liệu là PromoRow của bộ máy dùng chung (promoBoard) — cùng phép tính với kiểm tra phía máy chủ.
 * Ô tích "Áp": bỏ tích = bỏ chương trình đó trên phiếu này (NCC hết quà, không cho CK lần này…) — CK / quà của nó tự gỡ;
 * tích lại = áp lại. Tự động nhưng linh hoạt.
 */
import { useEffect } from 'react';
import { POLICY_LABEL, type PromoRow, type PromoStatus } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';

const GROUP: Record<PromoStatus, { title: string; cls: string; badge: string }> = {
  fix: { title: 'Cần xem', cls: 'km-fix', badge: 'badge-warn' },
  applied: { title: 'Đã tự áp', cls: 'km-ok', badge: 'badge-ok' },
  hint: { title: 'Mua thêm để được', cls: 'km-hint', badge: 'badge-info' },
  blocked: { title: 'Không áp (đang áp riêng)', cls: 'km-off', badge: 'badge-gray' },
  off: { title: 'Đã bỏ trên phiếu', cls: 'km-off', badge: 'badge-gray' },
};
/** Dòng bỏ tích được: dòng của một chính sách thật (không phải CK ghi tay trên phiếu, không phải gợi ý mua thêm). */
const togglable = (r: PromoRow) => r.policy && r.policy !== 'Trên phiếu' && r.status !== 'hint' && r.kind !== 'manual';
type Toggle = (code: string, on: boolean) => void;
function Tick({ r, onToggle, readOnly }: { r: PromoRow; onToggle?: Toggle; readOnly?: boolean }) {
  if (!togglable(r) || !onToggle) return null;
  // Bị chặn vì mã đang áp riêng chương trình khác: không tích được — bỏ tích chương trình áp riêng trước.
  if (r.status === 'blocked') return <input type="checkbox" checked={false} disabled title="Mã này đang áp riêng chương trình khác — bỏ tích chương trình đó trước" style={{ marginRight: 6 }} />;
  return <input type="checkbox" checked={r.status !== 'off'} disabled={readOnly} title={r.status === 'off' ? 'Tích để áp lại chương trình này cho phiếu' : 'Bỏ tích = không áp chương trình này cho phiếu (CK / quà của nó tự gỡ)'} onChange={(e) => onToggle(r.policy, e.target.checked)} style={{ marginRight: 6 }} />;
}
const KIND: Record<string, string> = { ...POLICY_LABEL, manual: 'CK ghi tay', item_discount: 'CK theo mã', qty_tier: 'Bậc số lượng', trade_discount: 'CK trên đơn', payment_discount: 'CK thanh toán', promo_gift: 'Quà mua X tặng Y' };
const count = (rows: PromoRow[], s: PromoStatus) => rows.filter((r) => r.status === s).length;

export function KhuyenMaiBar({ rows, note, onOpen }: { rows: PromoRow[]; note: string[]; onOpen: () => void }) {
  if (!rows.length && !note.length) return null;
  const fix = count(rows, 'fix');
  return (
    <div className={`km-bar ${fix ? 'has-fix' : ''}`}>
      <b>Khuyến mại</b>
      <span className="badge badge-ok">{count(rows, 'applied')} đã tự áp</span>
      {fix > 0 && <span className="badge badge-warn">{fix} cần xem</span>}
      {count(rows, 'hint') > 0 && <span className="badge badge-info">{count(rows, 'hint')} gợi ý</span>}
      {count(rows, 'off') > 0 && <span className="badge badge-gray">{count(rows, 'off')} đã bỏ</span>}
      {note.length > 0 && <span className="km-note" title={note.join('\n')}>Vừa tự làm: {note.slice(0, 2).join('; ')}{note.length > 2 ? ` (+${note.length - 2})` : ''}</span>}
      <button type="button" className="btn btn-xs" data-view-ok style={{ marginLeft: 'auto' }} onClick={onOpen}>Xem bảng khuyến mại</button>
    </div>
  );
}

function Row({ r, onAction, onToggle, readOnly }: { r: PromoRow; onAction: (r: PromoRow) => void; onToggle?: Toggle; readOnly?: boolean }) {
  return (
    <div className={`km-row ${GROUP[r.status].cls}`}>
      <span className="km-text"><Tick r={r} onToggle={onToggle} readOnly={readOnly} />{r.text}</span>
      <span className="km-pol mono" title={r.name}>{r.policy === 'Trên phiếu' ? 'ghi trên phiếu' : r.policy}</span>
      {r.action && !readOnly && <button type="button" className="btn btn-xs" onClick={() => onAction(r)}>{r.action.label}</button>}
    </div>
  );
}

export function KhuyenMaiPanel({ rows, onAction, onToggle, onOpen, readOnly }: { rows: PromoRow[]; onAction: (r: PromoRow) => void; onToggle?: Toggle; onOpen: () => void; readOnly?: boolean }) {
  return (
    <div className="mh-panel km-panel">
      <h4>Khuyến mại & chiết khấu {rows.length ? <button type="button" className="btn btn-xs" data-view-ok style={{ marginLeft: 'auto' }} onClick={onOpen}>Bảng đầy đủ</button> : null}</h4>
      {!rows.length && <div className="muted" style={{ fontSize: 12 }}>Chưa có chương trình nào khớp phiếu này (theo NCC, nhãn của mặt hàng, mã, chi nhánh, ngày). Thêm hàng là phần mềm tự áp.</div>}
      {(['fix', 'applied', 'hint', 'blocked', 'off'] as PromoStatus[]).map((s) => {
        const list = rows.filter((r) => r.status === s);
        return list.length ? <div key={s} className="km-group"><div className="km-group-title"><span className={`badge ${GROUP[s].badge}`}>{list.length}</span> {GROUP[s].title}</div>{list.map((r) => <Row key={r.key} r={r} onAction={onAction} onToggle={onToggle} readOnly={readOnly} />)}</div> : null;
      })}
    </div>
  );
}

export function BangKhuyenMai({ rows, onAction, onToggle, onClose, readOnly }: { rows: PromoRow[]; onAction: (r: PromoRow) => void; onToggle?: Toggle; onClose: () => void; readOnly?: boolean }) {
  // Hai cột số lượng quà chỉ có nghĩa với quà mua X tặng Y — chiết khấu không có.
  const hasGift = rows.some((r) => r.kind === 'promo_gift');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && !(e.target as HTMLElement).closest('input, textarea, select')) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <Modal wide title="Khuyến mại của phiếu — phần mềm tự áp khi bảng hàng thay đổi" onClose={onClose}
      footer={<><span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>Enter để đóng · quà tự thêm có chữ "tự", sửa số lượng quà (NCC giao thiếu / thừa) thì phần mềm giữ nguyên và báo ở đây</span><button className="btn btn-primary" onClick={onClose}>Đóng</button></>}>
      <div className="full row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="badge badge-ok">{count(rows, 'applied')} đã tự áp</span>
        <span className="badge badge-warn">{count(rows, 'fix')} cần xem</span>
        <span className="badge badge-info">{count(rows, 'hint')} gợi ý mua thêm</span>
        {count(rows, 'blocked') > 0 && <span className="badge badge-gray">{count(rows, 'blocked')} không áp (đang áp riêng)</span>}
        {count(rows, 'off') > 0 && <span className="badge badge-gray">{count(rows, 'off')} đã bỏ trên phiếu</span>}
        <span className="muted" style={{ fontSize: 12 }}>Cột <b>Áp</b>: bỏ tích = không áp chương trình cho phiếu này (NCC hết quà, không cho CK lần này…), tích lại = áp lại</span>
      </div>
      <div className="full ckma-scroll" style={{ maxHeight: 460 }}>
        <table className="mh-mini km-table">
          <thead><tr>{onToggle && <th style={{ width: 40 }} title="Bỏ tích = không áp chương trình này cho phiếu">Áp</th>}<th style={{ width: 110 }}>Trạng thái</th><th style={{ width: 130 }}>Loại</th><th style={{ width: 140 }}>Chương trình</th><th style={{ width: 110 }}>Mã hàng</th><th>Nội dung</th>
            {hasGift && <><th className="num" style={{ width: 110 }} title="Số quà chương trình cho được tặng theo số lượng mua">SL quà được tặng</th><th className="num" style={{ width: 110 }} title="Số quà đang ghi trên phiếu (NCC giao thực tế)">SL quà trên phiếu</th></>}
            {!readOnly && <th style={{ width: 130 }} />}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={GROUP[r.status].cls}>
                {onToggle && <td style={{ textAlign: 'center' }}><Tick r={r} onToggle={onToggle} readOnly={readOnly} /></td>}
                <td><span className={`badge ${GROUP[r.status].badge}`}>{GROUP[r.status].title}</span></td>
                <td>{KIND[r.kind] ?? r.kind}</td>
                <td className="mono" title={r.name}>{r.policy === 'Trên phiếu' ? <span className="muted">ghi trên phiếu</span> : r.policy}</td>
                <td className="mono">{r.sku ?? ''}</td>
                <td>{r.text}</td>
                {hasGift && <><td className="num">{r.expected ?? ''}</td><td className={`num ${r.expected !== undefined && r.got !== r.expected ? 'mh-bad' : ''}`}>{r.got ?? ''}</td></>}
                {!readOnly && <td>{r.action && <button type="button" className="btn btn-xs" onClick={() => onAction(r)}>{r.action.label}</button>}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted">Chưa có chương trình nào khớp phiếu này.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
