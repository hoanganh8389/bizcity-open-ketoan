// [2026-11-12 03:30 PM kiennt] NT-KHO-002 — hộp thoại biên bản kiểm kê: biên bản → xác minh → quyết định xử lý
/**
 * BIÊN BẢN KIỂM KÊ (KHO02) — ba thẻ theo ba chứng từ của phiếu nghiệm thu NT-KHO-002:
 *   - Biên bản kiểm kê: chi nhánh, kho, ngày, kho cách ly, mục đích; "Lấy số tồn" (mặt hàng × lô / HSD theo sổ); nhập số kiểm kê,
 *     kém / mất phẩm chất, HSD thực tế; thành viên; kết luận; đính kèm biên bản ký tay. Ghi = lưu nháp (chưa đụng sổ).
 *     "Ghi nhận chênh lệch" = sinh chứng từ điều chỉnh tồn + chuyển hàng kém phẩm chất sang kho cách ly.
 *   - Xác minh: nguyên nhân từng dòng chênh lệch (một dòng tách được nhiều nguyên nhân, tổng = chênh lệch).
 *   - Quyết định xử lý: số, ngày, người ký, lý do phiếu kế toán cho từng hướng → phiếu kế toán tất toán 1381 / 3381.
 * Huỷ quyết định / Bỏ ghi nhận = huỷ chứng từ đã sinh (bút toán đảo), không xoá biên bản.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errorText } from '@/lib/api';
import { today } from '@/lib/format';
import { BranchPicker } from '@/components/filters';
import { PartnerPicker } from '@/components/pickers';
import { Modal, NumInput } from '@/components/ui';
import { FormTabs } from '@/components/FormBlocks';
import { HelpDrawer } from '@/components/HelpDrawer';
import { ChonKho } from '@/components/phieu-hang/ChonKho';
import { TepChungTu } from '@/components/dinh-kem/TepChungTu';
import { useThaoTac } from '@/lib/manHinh';
import { CAUSE_TEXT, STATUS_CLASS, causesFor, diffOf, kkApi, qty, viDate, type CauseKind, type KkCause, type KkDoc, type KkInput, type KkLine } from './api';

type Tab = 'bb' | 'xm' | 'qd';
const lotKey = (l: Pick<KkLine, 'sku' | 'lotNo'>) => `${l.sku}|${l.lotNo}`;

export function BienBanKiemKe({ value, onClose, onChanged }: { value: KkDoc; onClose: () => void; onChanged: (d: KkDoc) => void }) {
  const tt = useThaoTac('kho.kiem-ke'); // [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: nút theo thao tác đã đăng ký của màn KHO02 (đóng góp)
  const [v, setV] = useState<KkDoc>(value);
  const [tab, setTab] = useState<Tab>(value.status === 'verified' ? 'qd' : value.status === 'recorded' ? 'xm' : 'bb');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [help, setHelp] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const draft = v.status === 'draft';
  const set = (p: Partial<KkDoc>) => setV((o) => ({ ...o, ...p }));
  const setLine = (i: number, p: Partial<KkLine>) => setV((o) => ({ ...o, lines: o.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const input = (): KkInput => ({ docNo: v.docNo, countDate: v.countDate, branchCode: v.branchCode, warehouseCode: v.warehouseCode, quarantineWarehouse: v.quarantineWarehouse, purpose: v.purpose, conclusion: v.conclusion, members: v.members.filter((m) => m.name.trim()), lines: v.lines });
  const run = async (fn: () => Promise<KkDoc & { message?: string }>, ok?: string) => {
    setBusy(true); setErr(''); setMsg('');
    try { const d = await fn(); setV(d); onChanged(d); setMsg(d.message ?? ok ?? ''); return d; } catch (e) { setErr(errorText(e)); return null; } finally { setBusy(false); }
  };
  const save = () => run(() => (v.id ? kkApi.update(v.id, input()) : kkApi.create(input())), 'Đã ghi biên bản (nháp, chưa đụng sổ).');

  /** Lấy số tồn: số theo sổ đến hết ngày kiểm kê; giữ số đã nhập của dòng cùng mã + lô. */
  const layTon = async () => {
    if (!v.branchCode) { setErr('Chọn chi nhánh trước'); return; }
    setBusy(true); setErr('');
    try {
      const b = await kkApi.book({ branchCode: v.branchCode, warehouse: v.warehouseCode, date: v.countDate, ...(v.id ? { exceptId: v.id } : {}) });
      const old = new Map(v.lines.map((l) => [lotKey(l), l]));
      const lines: KkLine[] = b.lines.map((l) => { const o = old.get(lotKey(l)); return { ...l, countedQty: o?.countedQty ?? l.bookQty, poorQty: o?.poorQty ?? 0, lostQty: o?.lostQty ?? 0, actualExpDate: o?.actualExpDate, note: o?.note }; });
      for (const o of v.lines) if (o.newLot && !lines.some((l) => lotKey(l) === lotKey(o))) lines.push(o);
      set({ warehouseCode: b.warehouse, lines });
      setMsg(`Đã lấy ${b.lines.length} dòng theo sổ kho ${b.warehouse || 'mặc định'} đến ${viDate(v.countDate)}.`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  /** Dán từ Excel: Mã hàng | Số lô | Số kiểm kê | Kém PC | Mất PC | HSD thực tế. Lô lạ của mã đã có → dòng lô mới; mã lạ → báo lỗi. */
  const onPaste = (text: string) => {
    const lines = [...v.lines];
    const bad: string[] = [];
    let n = 0;
    for (const raw of text.split(/\r?\n/)) {
      const c = raw.split('\t').map((x) => x.trim());
      if (!c[0] || /^mã/i.test(c[0])) continue;
      const num = (s?: string) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : 0);
      const [sku, lot = '', counted, poor, lost, hsd] = c;
      const i = lines.findIndex((l) => l.sku === sku && l.lotNo === lot);
      const p = { countedQty: num(counted), poorQty: num(poor), lostQty: num(lost), ...(hsd ? { actualExpDate: hsd.includes('/') ? hsd.split('/').reverse().join('-') : hsd } : {}) };
      if (i >= 0) { lines[i] = { ...lines[i]!, ...p }; n++; continue; }
      const same = lines.find((l) => l.sku === sku);
      if (!same) { bad.push(sku); continue; }
      lines.push({ lineKey: `N${Date.now().toString(36)}${n}`, sku, name: same.name, unit: same.unit, lotNo: lot, bookQty: 0, newLot: true, ...p, expDate: p.actualExpDate });
      n++;
    }
    set({ lines });
    setPaste(null);
    setMsg(`Đã nhận ${n} dòng.${bad.length ? ` Mã không có trên biên bản / danh mục: ${[...new Set(bad)].join(', ')} — chưa thêm.` : ''}`);
  };

  const totals = useMemo(() => {
    const t = { book: 0, counted: 0, diff: 0, poor: 0 };
    for (const l of v.lines) { t.book += l.bookQty; t.counted += l.countedQty; t.diff += diffOf(l); t.poor += l.poorQty + l.lostQty; }
    return t;
  }, [v.lines]);
  const diffLines = v.lines.filter((l) => diffOf(l) !== 0);

  const title = <>Biên bản kiểm kê {v.docNo || '(mới)'} <span className={`badge ${STATUS_CLASS[v.status]}`} style={{ marginLeft: 8 }}>{v.statusText ?? 'Nháp'}</span></>;
  return (
    <Modal wide title={title} onClose={onClose}
      footer={<>
        {draft && <>
          {(v.id ? tt.sua : tt.them) && <button className="btn btn-primary" disabled={busy || !v.branchCode} onClick={() => void save()} title="Lưu nháp — chưa đụng sổ">Ghi</button>}
          {tt.ghiNhan && (v.id ? tt.sua : tt.them) && <button className="btn" disabled={busy || !v.lines.length} title="Lưu rồi sinh chứng từ điều chỉnh tồn + chuyển hàng kém phẩm chất sang kho cách ly"
            onClick={async () => { const d = await save(); if (d && window.confirm(`Ghi nhận chênh lệch biên bản ${d.docNo}?\nPhần mềm sẽ ghi chứng từ điều chỉnh tồn${totals.poor ? ' và chuyển hàng kém / mất phẩm chất sang kho cách ly' : ''}.`)) await run(() => kkApi.record(d.id), 'Đã ghi nhận chênh lệch.'); }}>Ghi nhận chênh lệch</button>}
        </>}
        {tt.boGhiNhan && !draft && !(v.status === 'settled' && v.journalDocKey) && <button className="btn" disabled={busy} title="Huỷ chứng từ điều chỉnh / chuyển kho đã sinh (bút toán đảo), biên bản về nháp"
          onClick={() => { const r = window.prompt(`Bỏ ghi nhận chênh lệch biên bản ${v.docNo}? Chứng từ đã sinh sẽ bị huỷ (bút toán đảo).\nLý do:`, ''); if (r !== null) void run(() => kkApi.unrecord(v.id, r), 'Đã bỏ ghi nhận — biên bản về nháp.'); }}>Bỏ ghi nhận</button>}
        {tt.huyQuyetDinh && v.status === 'settled' && v.decisionNo && <button className="btn" disabled={busy} title="Huỷ phiếu kế toán tất toán (bút toán đảo), biên bản về Đã xác minh"
          onClick={() => { const r = window.prompt(`Huỷ quyết định ${v.decisionNo}? Phiếu kế toán tất toán sẽ bị huỷ (bút toán đảo).\nLý do:`, ''); if (r !== null) void run(() => kkApi.undecide(v.id, r), 'Đã huỷ quyết định.'); }}>Huỷ quyết định</button>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {draft ? 'Nháp: chưa đụng sổ. Lấy số tồn → nhập số kiểm kê → Ghi nhận chênh lệch.' : v.status === 'recorded' ? 'Đã ghi nhận chênh lệch (1381 / 3381, chưa vào chi phí) — lập biên bản xác minh.' : v.status === 'verified' ? 'Đã xác minh — ghi quyết định xử lý.' : 'Đã xử lý.'}
        </span>
        <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
      </div>
      {help && <HelpDrawer guideKey="kiem-ke-kho" onClose={() => setHelp(false)} />}
      {err && <div className="full alert alert-bad">{err}</div>}
      {msg && <div className="full alert alert-ok">{msg}</div>}
      <div className="full"><FormTabs<Tab> tabs={[['bb', 'Biên bản kiểm kê'], ['xm', `Xác minh${diffLines.length ? ` (${diffLines.length})` : ''}`], ['qd', 'Quyết định xử lý']]} value={tab} onChange={setTab} /></div>

      {tab === 'bb' && <>
        <fieldset className="full kk-grid" disabled={!draft}>
          <label>Chi nhánh</label><BranchPicker value={v.branchCode} activeOnly onChange={(c) => set({ branchCode: c, warehouseCode: '', quarantineWarehouse: '', lines: [] })} />
          <label title="Phân kho được kiểm; trống = kho mặc định của chi nhánh">Kho kiểm</label><ChonKho branchCode={v.branchCode} value={v.warehouseCode} disabled={!draft} onChange={(c) => set({ warehouseCode: c, lines: [] })} />
          <label title="Số theo sổ tính đến hết ngày này; ngày của chứng từ ghi nhận chênh lệch">Ngày kiểm kê</label><input className="input" type="date" value={v.countDate} onChange={(e) => set({ countDate: e.target.value })} />
          <label title="Hàng kém / mất phẩm chất chuyển sang kho này (cùng chi nhánh), không ghi giảm 156">Kho cách ly</label><ChonKho branchCode={v.branchCode} value={v.quarantineWarehouse} disabled={!draft} avoid={v.warehouseCode} onChange={(c) => set({ quarantineWarehouse: c })} />
          <label>Số biên bản</label><input className="input mono" placeholder="(tự sinh)" value={v.docNo} onChange={(e) => set({ docNo: e.target.value })} />
          <label>Mục đích</label><input className="input" placeholder="Kiểm kê cuối tháng, đột xuất…" value={v.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        </fieldset>
        <div className="full row kk-bar">
          <b>Vật tư, hàng hoá</b>
          {draft && <button type="button" className="btn btn-sm" disabled={busy || !v.branchCode} onClick={() => void layTon()} title="Điền mọi mặt hàng × lô có tồn hoặc có phát sinh trong tháng ở kho kiểm, đến hết ngày kiểm kê">Lấy số tồn</button>}
          {draft && <button type="button" className="btn btn-sm" disabled={!v.lines.length} onClick={() => setPaste('')} title="Dán từ Excel: Mã hàng, Số lô, Số kiểm kê, Kém PC, Mất PC, HSD thực tế">Nhập kết quả từ Excel</button>}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Số lượng theo đơn vị tính tồn kho. Chênh lệch = kiểm kê − sổ.</span>
        </div>
        <div className="full kk-lines">
          <table className="grid-table">
            <thead><tr>
              <th>#</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Số lô</th><th title="HSD ghi trên sổ (lô)">HSD sổ</th><th title="HSD thực tế trên hàng; khác sổ thì đánh dấu (chưa đổi HSD của lô trong sổ)">HSD thực tế</th>
              <th className="num" title="Tồn theo sổ đến hết ngày kiểm kê">Theo sổ</th><th className="num" title="Số đếm thực tế (gồm cả hàng kém / mất phẩm chất)">Theo kiểm kê</th><th className="num" title="Kiểm kê − sổ: âm = thiếu, dương = thừa">Chênh lệch</th>
              <th className="num" title="Còn hàng nhưng kém phẩm chất — chuyển kho cách ly">Kém PC</th><th className="num" title="Mất phẩm chất — chuyển kho cách ly chờ xử lý">Mất PC</th><th>Ghi chú</th>
            </tr></thead>
            <tbody>
              {v.lines.map((l, i) => { const d = diffOf(l); return (
                <tr key={l.lineKey} className={d ? 'kk-diff' : ''}>
                  <td>{i + 1}</td><td className="mono">{l.sku}</td><td>{l.name}{l.newLot && <span className="badge badge-info" style={{ marginLeft: 6 }}>lô mới</span>}</td><td>{l.unit}</td>
                  <td className="mono">{l.lotNo}</td><td>{viDate(l.expDate)}</td>
                  <td><input className={`input ${l.actualExpDate && l.expDate && l.actualExpDate !== l.expDate ? 'kk-warn' : ''}`} type="date" disabled={!draft} value={l.actualExpDate ?? ''} title={l.actualExpDate && l.expDate && l.actualExpDate !== l.expDate ? 'HSD thực tế khác sổ' : undefined} onChange={(e) => setLine(i, { actualExpDate: e.target.value || undefined })} /></td>
                  <td className="num">{qty(l.bookQty)}</td>
                  <td><NumInput value={l.countedQty} blankZero={false} disabled={!draft} onChange={(n) => setLine(i, { countedQty: n ?? 0 })} /></td>
                  <td className={`num ${d < 0 ? 'kk-neg' : d > 0 ? 'kk-pos' : ''}`}>{d > 0 ? '+' : ''}{qty(d)}</td>
                  <td><NumInput value={l.poorQty} disabled={!draft} onChange={(n) => setLine(i, { poorQty: n ?? 0 })} /></td>
                  <td><NumInput value={l.lostQty} disabled={!draft} onChange={(n) => setLine(i, { lostQty: n ?? 0 })} /></td>
                  <td><input className="input" disabled={!draft} value={l.note ?? ''} onChange={(e) => setLine(i, { note: e.target.value || undefined })} /></td>
                </tr>); })}
              {!v.lines.length && <tr><td colSpan={13} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có dòng — chọn chi nhánh, kho, ngày rồi bấm Lấy số tồn</td></tr>}
            </tbody>
            {v.lines.length > 0 && <tfoot><tr className="ck-total"><td colSpan={7} style={{ textAlign: 'right' }}><b>Tổng</b></td><td className="num"><b>{qty(totals.book)}</b></td><td className="num"><b>{qty(totals.counted)}</b></td><td className="num"><b>{totals.diff > 0 ? '+' : ''}{qty(totals.diff)}</b></td><td className="num" colSpan={2}><b>{qty(totals.poor)}</b></td><td /></tr></tfoot>}
          </table>
        </div>
        <div className="full kk-two">
          <div>
            <div className="kk-bar"><b>Thành viên tham gia</b>{draft && <button type="button" className="btn btn-xs" onClick={() => set({ members: [...v.members, { name: '', title: '', represent: '' }] })}>+ Thêm</button>}</div>
            <table className="grid-table"><thead><tr><th>Họ và tên</th><th>Chức danh</th><th>Đại diện</th><th /></tr></thead><tbody>
              {v.members.map((m, i) => (
                <tr key={i}>
                  {(['name', 'title', 'represent'] as const).map((k) => <td key={k}><input className="input" disabled={!draft} value={m[k]} onChange={(e) => set({ members: v.members.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} /></td>)}
                  <td>{draft && <button type="button" className="btn btn-xs" onClick={() => set({ members: v.members.filter((_, j) => j !== i) })}>×</button>}</td>
                </tr>))}
              {!v.members.length && <tr><td colSpan={4} className="muted">Chưa có thành viên.</td></tr>}
            </tbody></table>
          </div>
          <div>
            <div className="kk-bar"><b>Kết luận</b></div>
            <textarea className="input" rows={4} disabled={!draft} value={v.conclusion} onChange={(e) => set({ conclusion: e.target.value })} />
          </div>
        </div>
        <div className="full"><TepChungTu docRef={v.id ? `kho.stock_count:${v.id}` : null} defaultKind="bien_ban" /></div>
      </>}

      {tab === 'xm' && <XacMinh v={v} busy={busy} onSave={(b) => void run(() => kkApi.verify(v.id, b), 'Đã ghi biên bản xác minh.')} />}
      {tab === 'qd' && <QuyetDinh v={v} busy={busy} onSave={(b) => void run(() => kkApi.decide(v.id, b), 'Đã ghi quyết định xử lý.')} />}
      {paste !== null && <DanExcel onCancel={() => setPaste(null)} onOk={onPaste} />}
    </Modal>
  );
}

/** Biên bản xác minh: nguyên nhân từng dòng chênh lệch; mặc định "Chưa rõ" đủ số chênh lệch. */
function XacMinh({ v, busy, onSave }: { v: KkDoc; busy: boolean; onSave: (b: { causes: KkCause[]; note: string }) => void }) {
  const lines = v.lines.filter((l) => diffOf(l) !== 0);
  const [causes, setCauses] = useState<KkCause[]>(() => (v.causes.length ? v.causes : lines.map((l) => ({ lineKey: l.lineKey, cause: 'unknown' as CauseKind, qty: Math.abs(diffOf(l)) }))));
  const [note, setNote] = useState(v.verifyNote);
  const coQuyen = useThaoTac('kho.kiem-ke').xacMinh; // [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: không có quyền xác minh → chỉ xem (đóng góp)
  const open = (v.status === 'recorded' || v.status === 'verified') && coQuyen;
  if (v.status === 'draft') return <div className="full muted">Ghi nhận chênh lệch ở thẻ Biên bản kiểm kê trước khi xác minh.</div>;
  if (!lines.length) return <div className="full muted">Biên bản không có chênh lệch số lượng.</div>;
  const upd = (i: number, p: Partial<KkCause>) => setCauses((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return <>
    <div className="full kk-lines">
      <table className="grid-table">
        <thead><tr><th>Mã hàng</th><th>Số lô</th><th className="num">Chênh lệch</th><th>Nguyên nhân</th><th className="num">Số lượng</th><th title="Người bồi thường (đối tượng công nợ 1388)">Đối tượng bồi thường</th><th title="Số phiếu nhập đã bổ sung">Phiếu nhập bổ sung</th><th>Ghi chú</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => {
            const d = diffOf(l);
            const rows = causes.map((c, i) => ({ c, i })).filter((x) => x.c.lineKey === l.lineKey);
            const sum = rows.reduce((s, x) => s + x.c.qty, 0);
            return rows.map(({ c, i }, k) => (
              <tr key={`${l.lineKey}-${i}`} className={k === 0 && Math.abs(sum - Math.abs(d)) > 1e-9 ? 'kk-diff' : ''}>
                {k === 0 && <><td rowSpan={rows.length} className="mono">{l.sku}</td><td rowSpan={rows.length} className="mono">{l.lotNo}</td>
                  <td rowSpan={rows.length} className={`num ${d < 0 ? 'kk-neg' : 'kk-pos'}`} title={Math.abs(sum - Math.abs(d)) > 1e-9 ? `Tổng nguyên nhân ${qty(sum)} ≠ ${qty(Math.abs(d))}` : undefined}>{d > 0 ? '+' : ''}{qty(d)}</td></>}
                <td><select className="select input" disabled={!open} value={c.cause} onChange={(e) => upd(i, { cause: e.target.value as CauseKind })}>{causesFor(d).map((x) => <option key={x} value={x}>{CAUSE_TEXT[x]}</option>)}</select></td>
                <td><NumInput value={c.qty} disabled={!open} onChange={(n) => upd(i, { qty: n ?? 0 })} /></td>
                <td>{c.cause === 'compensate' ? <PartnerPicker value={c.partnerCode ?? ''} disabled={!open} onChange={(x) => upd(i, { partnerCode: x || undefined })} placeholder="Gõ mã / tên người bồi thường" /> : null}</td>
                <td>{c.cause === 'missing_receipt' ? <input className="input mono" disabled={!open} value={c.receiptDocNo ?? ''} onChange={(e) => upd(i, { receiptDocNo: e.target.value || undefined })} /> : null}</td>
                <td><input className="input" disabled={!open} value={c.note ?? ''} onChange={(e) => upd(i, { note: e.target.value || undefined })} /></td>
                <td>{open && (k === 0
                  ? <button type="button" className="btn btn-xs" title="Tách thêm nguyên nhân cho dòng này" onClick={() => setCauses((cs) => [...cs.slice(0, i + 1), { lineKey: l.lineKey, cause: 'unknown', qty: 0 }, ...cs.slice(i + 1)])}>+</button>
                  : <button type="button" className="btn btn-xs" onClick={() => setCauses((cs) => cs.filter((_, j) => j !== i))}>×</button>)}</td>
              </tr>));
          })}
        </tbody>
      </table>
    </div>
    <div className="full"><label className="muted">Ghi chú xác minh</label><textarea className="input" rows={2} disabled={!open} value={note} onChange={(e) => setNote(e.target.value)} /></div>
    {open && <div className="full"><button className="btn btn-primary" disabled={busy} onClick={() => onSave({ causes: causes.filter((c) => c.qty > 0), note })}>Ghi biên bản xác minh</button></div>}
  </>;
}

/** Quyết định xử lý: số, ngày, người ký, lý do phiếu kế toán cho từng hướng (gợi ý KKBT / KKCP / KKTN nếu đơn vị đã khai). */
function QuyetDinh({ v, busy, onSave }: { v: KkDoc; busy: boolean; onSave: (b: { decisionNo: string; decisionDate: string; signer: string; reasons: KkDoc['decisionReasons'] }) => void }) {
  const reasons = useQuery({ queryKey: ['posting-reasons', 'journal'], queryFn: kkApi.journalReasons, staleTime: 60_000 });
  const journal = (reasons.data ?? []).filter((r) => r.kind === 'journal' && r.isActive !== false);
  const has = (code: string) => journal.some((r) => r.code === code);
  const [no, setNo] = useState(v.decisionNo);
  const [date, setDate] = useState(v.decisionDate ?? today());
  const [signer, setSigner] = useState(v.decisionSigner);
  const [rs, setRs] = useState<KkDoc['decisionReasons']>(v.decisionReasons);
  const pick = (k: 'compensate' | 'expense' | 'owned', fallback: string) => rs[k] ?? (has(fallback) ? fallback : '');
  const need = new Set(v.causes.map((c) => c.cause));
  const coQuyen = useThaoTac('kho.kiem-ke').quyetDinh; // [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: không có quyền quyết định → chỉ xem (đóng góp)
  const open = v.status === 'verified' && coQuyen;
  if (v.status === 'draft' || v.status === 'recorded') return <div className="full muted">Ghi biên bản xác minh trước khi ghi quyết định xử lý.</div>;
  const sel = (k: 'compensate' | 'expense' | 'owned', label: string, fallback: string, hint: string) => need.has(k) && (
    <><label title={hint}>{label}</label>
      <select className="select input" disabled={!open} value={pick(k, fallback)} onChange={(e) => setRs({ ...rs, [k]: e.target.value || undefined })}>
        <option value="">— chọn lý do phiếu kế toán —</option>
        {journal.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} (Nợ {r.debitAccount} / Có {r.creditAccount})</option>)}
      </select></>
  );
  return <>
    <fieldset className="full kk-grid" disabled={!open}>
      <label>Số quyết định</label><input className="input mono" value={no} onChange={(e) => setNo(e.target.value)} />
      <label title="Ngày của phiếu kế toán tất toán">Ngày quyết định</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Người ký</label><input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} />
      {sel('compensate', 'Lý do: bồi thường', 'KKBT', 'Thiếu kiểm kê — cá nhân bồi thường (Nợ 1388 / Có 1381)')}
      {sel('expense', 'Lý do: tính vào chi phí', 'KKCP', 'Thiếu kiểm kê — tính vào chi phí (Nợ 632 / Có 1381)')}
      {sel('owned', 'Lý do: thừa thuộc DN', 'KKTN', 'Thừa kiểm kê — thuộc doanh nghiệp (Nợ 3381 / Có 711)')}
    </fieldset>
    <div className="full muted" style={{ fontSize: 12 }}>
      Giá trị = số lượng × đơn giá bình quân tháng {v.countDate.slice(5, 7)}/{v.countDate.slice(0, 4)} (tính giá vốn tháng trước). "Chưa rõ nguyên nhân" không tất toán — còn trên 1381 / 3381.
      "Do ghi thiếu phiếu nhập": không ghi 711, phần mềm bỏ phần thừa đó khỏi chứng từ điều chỉnh.
    </div>
    {v.status === 'settled' && <div className="full alert alert-ok">Đã ghi quyết định {v.decisionNo} ngày {viDate(v.decisionDate)}{v.journalDocKey ? ' — phiếu kế toán tất toán đã vào sổ.' : ' — không phát sinh bút toán.'}</div>}
    {open && <div className="full"><button className="btn btn-primary" disabled={busy || !no.trim()} onClick={() => onSave({ decisionNo: no.trim(), decisionDate: date, signer, reasons: { compensate: pick('compensate', 'KKBT') || undefined, expense: pick('expense', 'KKCP') || undefined, owned: pick('owned', 'KKTN') || undefined } })}>Ghi quyết định xử lý</button></div>}
  </>;
}

function DanExcel({ onOk, onCancel }: { onOk: (text: string) => void; onCancel: () => void }) {
  const [t, setT] = useState('');
  return (
    <Modal title="Nhập kết quả kiểm kê từ Excel" onClose={onCancel} footer={<><button className="btn btn-primary" disabled={!t.trim()} onClick={() => onOk(t)}>Nhận</button><button className="btn" onClick={onCancel}>Huỷ</button></>}>
      <div className="full muted" style={{ fontSize: 12 }}>Chép các cột theo thứ tự: <b>Mã hàng · Số lô · Số kiểm kê · Kém PC · Mất PC · HSD thực tế</b> (ô trống được). Lô chưa có của mã đã có thì thêm dòng lô mới; mã không có trên biên bản thì báo, không thêm.</div>
      <textarea className="input full" rows={10} autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder={'HANG01\tL01\t80\t2\t0\nHANG01\tL02\t38\t\t\t15/12/2026'} />
    </Modal>
  );
}
