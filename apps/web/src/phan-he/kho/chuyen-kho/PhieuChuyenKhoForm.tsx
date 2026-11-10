// [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — form phiếu chuyển kho KHO01: chi nhánh đang làm việc điền sẵn, kho theo chi nhánh, tồn, gợi ý lô (đóng góp)
/**
 * Form một phiếu chuyển kho (KHO01).
 *   Đầu phiếu: chi nhánh xuất (điền sẵn chi nhánh đang làm việc) → kho xuất chỉ các kho của chi nhánh đó (mặc định kho mặc định);
 *   chi nhánh nhập → kho nhập của chi nhánh nhập (cùng chi nhánh thì tự chọn kho khác). Lý do xuất theo lý do gán cho màn chuyển kho.
 *   Dòng hàng: gõ mã / tên / mã vạch rồi Enter để thêm (trùng mã thì cộng số lượng); dán nhiều dòng từ Excel (Mã hàng, Số lượng,
 *   Ghi chú). Cột Tồn = tồn ở chi nhánh + kho xuất tại ngày phiếu (không tính chính phiếu này) — vượt tồn tô đỏ.
 *   Lô: thêm mã là phần mềm gợi ý lô hạn dùng sớm trước ở kho xuất (một dòng nhiều lô thì tách dòng); người lập sửa / xoá lô
 *   tuỳ ý. Để trống lô thì khi ghi phần mềm tự chọn đúng như gợi ý.
 *   Lưu = XUẤT (trừ tồn bên chuyển ngay). Khác chi nhánh: chờ thủ kho nhập xác nhận; cùng chi nhánh: nhận luôn (bỏ tích được).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { BranchPicker, useBranches } from '@/components/filters';
import { ItemPicker } from '@/components/pickers';
import { Modal, NumInput } from '@/components/ui';
import { HelpDrawer } from '@/components/HelpDrawer';
import { PrintButton } from '@/components/print';
import { TRADE_TEMPLATES } from '@/components/phieu-hang/printTemplates';
import { ChonKho, khoCodeOf, useKho } from '@/components/phieu-hang/ChonKho';
import { DocumentGateBanner, useDocumentGate } from '@/components/PostingGate';
import { ckApi, newLineKey, qtyText, statusClass, statusText, toPrintDoc, viDate, type CkDoc, type CkInput, type CkLine } from './api';

interface ItemRow { sku: string; name: string; unit: string }
type Reason = { code: string; name: string; isDefault: boolean };

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function PhieuChuyenKhoForm({ value, saving, error, onSave, onClose, onReceive }: {
  value: CkDoc; saving: boolean; error: unknown;
  onSave: (d: CkInput, close: boolean) => void; onClose: () => void; onReceive?: () => void;
}) {
  const isNew = !value.id;
  const readOnly = value.status === 'cancelled' || value.status === 'rejected';
  const [v, setV] = useState<CkDoc>(value);
  const [receiveNow, setReceiveNow] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState<string | null>(null);
  const [pickKey, setPickKey] = useState(0);
  const gate = useDocumentGate(readOnly ? undefined : v.docDate);
  const khoAll = useKho();
  const branches = useBranches().data ?? [];
  const bname = (c: string) => branches.find((b) => b.code === c)?.name ?? '';
  const set = (p: Partial<CkDoc>) => setV((x) => ({ ...x, ...p }));
  const sameBranch = Boolean(v.fromBranchCode) && v.fromBranchCode === v.toBranchCode;
  const receiving = receiveNow ?? sameBranch;
  const fromWh = khoCodeOf(khoAll, v.fromBranchCode, v.fromWarehouse);
  const toWh = khoCodeOf(khoAll, v.toBranchCode, v.toWarehouse);

  // Lý do xuất: các lý do kế toán gán cho màn chuyển kho (ACC92); chưa gán thì mọi lý do chuyển kho.
  const reasons = useQuery({ queryKey: ['posting-flow', 'screen-reasons', 'transfer'], staleTime: 60_000,
    queryFn: () => api.get<{ assigned: boolean; reasons: Reason[] }>('/api/v1/posting-flow/screens/transfer/reasons') }).data?.reasons ?? [];
  useEffect(() => {
    if (isNew && !v.reasonCode && reasons.length) set({ reasonCode: (reasons.find((r) => r.isDefault) ?? reasons[0])!.code });
  }, [reasons.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tồn ở chi nhánh + kho xuất tại ngày phiếu (không tính chính phiếu này).
  const skus = useMemo(() => [...new Set(v.lines.map((l) => l.sku).filter(Boolean))].sort(), [v.lines]);
  const stockQ = useQuery({
    queryKey: ['kho-transfer-stock', v.fromBranchCode, fromWh, v.docDate, skus.join(','), value.id],
    enabled: Boolean(v.fromBranchCode && v.docDate && skus.length),
    queryFn: () => ckApi.stock({ branchCode: v.fromBranchCode, warehouse: fromWh, date: v.docDate, skus, exceptId: value.id || undefined }),
  });
  const stock = stockQ.data?.stock ?? {};
  const usedBySku = useMemo(() => { const m = new Map<string, number>(); for (const l of v.lines) m.set(l.sku, round4((m.get(l.sku) ?? 0) + (l.qty || 0))); return m; }, [v.lines]);
  const over = skus.filter((s) => stock[s] !== undefined && (usedBySku.get(s) ?? 0) > stock[s]!);

  /**
   * Gợi ý lô cho các dòng chưa ghi lô tay (lô trống hoặc lô phần mềm gợi ý): gộp theo mã, hỏi tồn lô ở kho xuất (hạn sớm trước),
   * mỗi lô một dòng; phần thiếu tồn lô để trống (khi ghi phần mềm tự chọn).
   */
  const suggest = async (lines: CkLine[], only?: Set<string>) => {
    if (!v.fromBranchCode) return lines;
    const target = lines.filter((l) => l.sku && l.qty > 0 && (!l.lotNo || l.lotAuto) && (!only || only.has(l.lineKey)));
    if (!target.length) return lines;
    const items = new Map<string, number>();
    for (const l of target) items.set(l.sku, round4((items.get(l.sku) ?? 0) + l.qty));
    try {
      const res = await ckApi.suggest({ branchCode: v.fromBranchCode, warehouse: fromWh, date: v.docDate, items: [...items].map(([sku, qty]) => ({ sku, qty })), except: value.outDocKey ? [value.outDocKey] : undefined });
      let short = 0, split = 0;
      const out: CkLine[] = [];
      const done = new Set<string>();
      for (const l of lines) {
        if (!target.includes(l)) { out.push(l); continue; }
        if (done.has(l.sku)) continue;
        done.add(l.sku);
        const s = res.find((x) => x.sku === l.sku);
        const first = target.find((x) => x.sku === l.sku)!;
        const takes = (s?.lots ?? []).filter((x) => x.take > 0);
        takes.forEach((x, i) => out.push({ ...first, lineKey: i === 0 ? first.lineKey : newLineKey(), qty: x.take, lotNo: x.lotNo || undefined, expDate: x.expDate ?? undefined, lotAuto: true }));
        if (takes.length > 1) split += 1;
        if (!takes.length || (s?.shortage ?? 0) > 0) {
          short += 1;
          out.push({ ...first, lineKey: takes.length ? newLineKey() : first.lineKey, qty: takes.length ? s!.shortage : items.get(l.sku)!, lotNo: undefined, expDate: undefined, lotAuto: true });
        }
      }
      setMsg(`Đã gợi ý lô hạn dùng sớm trước ở kho xuất ${fromWh || '(mặc định)'}${split ? ` · ${split} mã lấy từ nhiều lô (đã tách dòng)` : ''}${short ? ` · ${short} dòng thiếu tồn lô để trống (khi ghi phần mềm tự chọn)` : ''}. Sửa được trước khi ghi.`);
      return out;
    } catch (e) { setMsg(`Chưa gợi ý được lô: ${errorText(e)}`); return lines; }
  };

  /** Thêm một mã (trùng mã chưa ghi lô tay thì cộng số lượng), rồi gợi ý lô cho mã đó. */
  const addSku = async (sku: string, qty = 1, note?: string, base: CkLine[] = v.lines) => {
    let info: ItemRow | undefined;
    try { info = (await api.get<ItemRow[]>('/api/v1/inventory/items', { search: sku, limit: 5 })).find((x) => x.sku === sku); } catch { /* giữ mã */ }
    const same = base.find((l) => l.sku === sku && (!l.lotNo || l.lotAuto));
    const lines = same
      ? base.map((l) => (l === same ? { ...l, qty: round4(l.qty + qty) } : l))
      : [...base, { lineKey: newLineKey(), sku, name: info?.name ?? '', unit: info?.unit ?? '', qty, note, lotAuto: true }];
    return lines;
  };
  const onPick = async (sku: string) => {
    setPickKey((k) => k + 1);
    if (!sku) return;
    const lines = await addSku(sku);
    set({ lines: await suggest(lines, new Set(lines.filter((l) => l.sku === sku).map((l) => l.lineKey))) });
  };
  const onPaste = async (text: string) => {
    let lines = v.lines;
    const bad: string[] = [];
    for (const row of text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)) {
      const [sku, q, ...rest] = row.split(/\t|;/).map((x) => x.trim());
      const qty = Number(String(q ?? '1').replace(/\./g, '').replace(',', '.'));
      if (!sku || /^m[aã]/i.test(sku) || !(qty > 0)) { if (sku && !/^m[aã]/i.test(sku)) bad.push(row); continue; }
      lines = await addSku(sku, qty, rest.join(' ') || undefined, lines);
    }
    set({ lines: await suggest(lines) });
    setPaste(null);
    if (bad.length) setMsg(`Bỏ qua ${bad.length} dòng không đọc được: ${bad.slice(0, 3).join(' | ')}`);
  };
  const setLine = (i: number, p: Partial<CkLine>) => set({ lines: v.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const reSuggestLine = async (i: number) => { const l = v.lines[i]; if (l && l.lotAuto) set({ lines: await suggest(v.lines, new Set([l.lineKey])) }); };

  const problems = [
    !v.docDate && 'Chưa nhập ngày',
    !v.fromBranchCode && 'Chưa chọn chi nhánh xuất',
    !v.toBranchCode && 'Chưa chọn chi nhánh nhập',
    sameBranch && fromWh === toWh && 'Cùng chi nhánh thì kho xuất và kho nhập phải khác nhau',
    !v.lines.length && 'Chưa có dòng hàng',
    v.lines.some((l) => !l.sku || !(l.qty > 0)) && 'Có dòng thiếu mã hàng hoặc số lượng',
  ].filter(Boolean) as string[];

  const save = (close: boolean) => {
    if (over.length && !window.confirm(`Vượt tồn ở kho xuất: ${over.map((s) => `${s} (cần ${qtyText(usedBySku.get(s))}, tồn ${qtyText(stock[s])})`).join(', ')}.\nVẫn ghi phiếu?`)) return;
    onSave({
      docNo: v.docNo, docDate: v.docDate, fromBranchCode: v.fromBranchCode, fromWarehouse: v.fromWarehouse, toBranchCode: v.toBranchCode, toWarehouse: v.toWarehouse,
      reasonCode: v.reasonCode, note: v.note, lines: v.lines, receiveNow: isNew ? receiving : undefined,
    }, close);
  };
  const totalQty = round4(v.lines.reduce((s, l) => s + (l.qty || 0), 0));
  const totalRec = round4(v.lines.reduce((s, l) => s + (l.receivedQty ?? l.qty ?? 0), 0));
  const showRec = value.status === 'received';
  const title = <>Phiếu chuyển kho {v.docNo || '(mới)'} {!isNew && <span className={`badge ${statusClass(value)}`} style={{ marginLeft: 8 }}>{statusText(value)}</span>}</>;

  return (
    <Modal wide viewFirst={!isNew && !readOnly} title={title} onClose={onClose}
      viewActions={!isNew && value.status === 'shipped' && onReceive ? <button className="btn btn-primary" data-view-ok onClick={onReceive} title="Thủ kho nhập xác nhận đã nhận hàng (cộng tồn bên nhận)">Nhận hàng</button> : undefined}
      footer={<>
        {!isNew && <span data-view-ok style={{ marginRight: 'auto' }}><PrintButton screen="KHO01" templates={TRADE_TEMPLATES.transfer!} title="In phiếu theo nội dung đã ghi (sửa xong bấm Ghi rồi mới in)" getDocs={() => [toPrintDoc(value)]} /></span>}
        {!readOnly && <>
          <button className="btn btn-primary" disabled={saving || problems.length > 0} title={problems.join('; ') || 'Ghi phiếu = xuất kho (Ctrl+S)'} onClick={() => save(false)}>Ghi</button>
          <button className="btn" disabled={saving || problems.length > 0} title={problems.join('; ')} onClick={() => save(true)}>Ghi và Đóng</button>
        </>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {isNew ? 'Ghi phiếu là xuất kho: tồn bên chuyển giảm ngay.' : value.status === 'shipped' ? `Đã xuất ${viDate(value.docDate)}, chờ thủ kho nhập xác nhận.` : value.status === 'received' ? `Đã nhận ${viDate(value.receivedDate)}${value.receivedBy ? ` · ${value.receivedBy}` : ''}${value.receivedNote ? ` · ${value.receivedNote}` : ''}.` : value.receivedNote || ''}
        </span>
        <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
      </div>
      {help && <HelpDrawer guideKey="kho-phieu-chuyen-kho" onClose={() => setHelp(false)} />}
      <DocumentGateBanner advisories={gate.advisories} />
      {msg && <div className="full alert alert-ok ck-msg">{msg}</div>}

      <div className="full ck-head">
        <fieldset className="fgroup ck-box" disabled={readOnly}>
          <legend>Thông tin chuyển kho</legend>
          <div className="ck-grid">
            <label title="Chi nhánh giao hàng — điền sẵn chi nhánh đang làm việc">Chi nhánh xuất</label>
            <BranchPicker value={v.fromBranchCode} activeOnly onChange={(c) => set({ fromBranchCode: c, fromWarehouse: '' })} />
            <label title="Chi nhánh nhận hàng. Chọn đúng chi nhánh xuất để chuyển giữa hai kho trong cùng chi nhánh">Chi nhánh nhập</label>
            <BranchPicker value={v.toBranchCode} activeOnly onChange={(c) => set({ toBranchCode: c, toWarehouse: '' })} />
            <label title="Phân kho xuất — chỉ các kho của chi nhánh xuất; mọi dòng xuất từ kho này">Kho xuất</label>
            <ChonKho branchCode={v.fromBranchCode} value={v.fromWarehouse} disabled={readOnly} onChange={(c) => set({ fromWarehouse: c })} />
            <label title="Phân kho nhập — chỉ các kho của chi nhánh nhập">Kho nhập</label>
            <ChonKho branchCode={v.toBranchCode} value={v.toWarehouse} disabled={readOnly} avoid={sameBranch ? fromWh : undefined} onChange={(c) => set({ toWarehouse: c })} />
            <label>Diễn giải</label>
            <textarea className="input ck-note" rows={2} value={v.note} placeholder={v.toBranchCode ? `Chuyển hàng sang ${v.toBranchCode}${bname(v.toBranchCode) ? ` — ${bname(v.toBranchCode)}` : ''}` : ''} onChange={(e) => set({ note: e.target.value })} />
            <label title="Lý do xuất quyết định tài khoản hạch toán (Nợ hàng đang chuyển / Có kho). Danh sách theo lý do kế toán gán cho màn chuyển kho ở ACC92">Lý do xuất</label>
            <select className="select input" value={v.reasonCode ?? ''} onChange={(e) => set({ reasonCode: e.target.value || undefined })}>
              {!reasons.length && <option value="">mặc định của chuyển kho</option>}
              {reasons.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}
            </select>
          </div>
        </fieldset>
        <fieldset className="fgroup ck-box ck-side" disabled={readOnly}>
          <legend>Phiếu</legend>
          <div className="ck-grid2">
            <label>Số phiếu</label><input className="input mono" value={v.docNo} placeholder="(tự sinh)" onChange={(e) => set({ docNo: e.target.value.trim() })} />
            <label title="Ngày xuất kho">Ngày</label><input className="input" type="date" value={v.docDate} onChange={(e) => set({ docDate: e.target.value })} />
            <label>Trạng thái</label><span className={isNew ? 'ck-new' : ''}>{isNew ? 'Mới' : statusText(value)}</span>
            {isNew && <>
              <label />
              <label className="row" style={{ gap: 6, fontWeight: 400 }} title="Bỏ tích: chờ thủ kho nhập xác nhận (hàng nằm ở hàng đang chuyển). Cùng chi nhánh thì mặc định nhận luôn">
                <input type="checkbox" checked={receiving} onChange={(e) => setReceiveNow(e.target.checked)} /> Nhận luôn khi ghi
              </label>
            </>}
          </div>
        </fieldset>
      </div>

      <div className="full ck-lines-bar">
        <b>Chi tiết phiếu</b>
        {!readOnly && <>
          <div style={{ width: 300 }} title="Gõ mã / tên / mã vạch rồi Enter để thêm dòng; trùng mã thì cộng số lượng">
            <ItemPicker key={pickKey} value="" onChange={(c) => void onPick(c)} placeholder="Mã hàng: gõ mã / tên / mã vạch — Enter" />
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setPaste('')} title="Dán nhiều dòng từ Excel: Mã hàng, Số lượng, Ghi chú">Dán từ Excel</button>
          <button type="button" className="btn btn-sm" disabled={!v.lines.length || !v.fromBranchCode} title="Điền lô hạn dùng sớm trước ở kho xuất cho các dòng chưa ghi lô tay" onClick={async () => set({ lines: await suggest(v.lines.map((l) => (l.lotNo && !l.lotAuto ? l : { ...l, lotAuto: true }))) })}>Gợi ý lô</button>
        </>}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Tồn = tồn ở {v.fromBranchCode || 'chi nhánh xuất'}{fromWh ? ` · ${fromWh}` : ''} ngày {viDate(v.docDate)}. Lô để trống thì phần mềm tự chọn hạn sớm trước.</span>
      </div>
      <div className="full" style={{ overflowX: 'auto' }}>
        <table className="grid-table ck-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: 90 }} title="Phân kho xuất (theo đầu phiếu)">Kho xuất</th>
              <th style={{ width: 90 }} title="Phân kho nhập (theo đầu phiếu)">Kho nhập</th>
              <th style={{ width: 120 }}>Mã hàng</th>
              <th>Tên hàng</th>
              <th style={{ width: 60 }}>ĐVT</th>
              <th style={{ width: 80 }} title="Tồn ở chi nhánh + kho xuất tại ngày phiếu (không tính phiếu này). Đỏ = số chuyển của mã vượt tồn">Tồn</th>
              <th style={{ width: 120 }} title="Số lô của NCC. Phần mềm gợi ý hạn sớm trước; sửa tay thì giữ đúng lô đã gõ">Số lô</th>
              <th style={{ width: 130 }} title="Hạn dùng của lô">Hạn dùng</th>
              <th style={{ width: 90 }} title="Số lượng xuất (đơn vị tính tồn kho)">Số lượng</th>
              <th style={{ width: 90 }} title="Số thủ kho nhập xác nhận đã nhận; trống = chưa nhận">Số lượng nhập</th>
              <th style={{ width: 160 }}>Ghi chú</th>
              <th style={{ width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => {
              const bad = over.includes(l.sku);
              return (
                <tr key={l.lineKey}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td className="mono muted">{fromWh || 'mặc định'}</td>
                  <td className="mono muted">{toWh || 'mặc định'}</td>
                  <td className="mono">{l.sku}</td>
                  <td>{l.name}</td>
                  <td>{l.unit}</td>
                  <td className={`num ${bad ? 'ck-over' : ''}`} title={bad ? `Cả phiếu chuyển ${qtyText(usedBySku.get(l.sku))}, tồn ${qtyText(stock[l.sku])}` : undefined}>{stockQ.isFetching && stock[l.sku] === undefined ? '…' : qtyText(stock[l.sku])}</td>
                  <td><input className={`input mono ${l.lotAuto && l.lotNo ? 'ck-auto' : ''}`} value={l.lotNo ?? ''} disabled={readOnly} placeholder="tự chọn" title={l.lotAuto && l.lotNo ? 'Lô phần mềm gợi ý (hạn sớm trước) — sửa được' : undefined} onChange={(e) => setLine(i, { lotNo: e.target.value.trim() || undefined, lotAuto: false })} /></td>
                  <td><input className="input" type="date" value={l.expDate ?? ''} disabled={readOnly} onChange={(e) => setLine(i, { expDate: e.target.value || undefined, lotAuto: false })} /></td>
                  <td><NumInput value={l.qty} disabled={readOnly} onChange={(n) => setLine(i, { qty: n ?? 0 })} onBlur={() => void reSuggestLine(i)} /></td>
                  <td className="num">{showRec ? qtyText(l.receivedQty ?? l.qty) : ''}</td>
                  <td><input className="input" value={l.note ?? ''} disabled={readOnly} onChange={(e) => setLine(i, { note: e.target.value || undefined })} /></td>
                  <td>{!readOnly && <button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => set({ lines: v.lines.filter((_, j) => j !== i) })}>×</button>}</td>
                </tr>
              );
            })}
            {!v.lines.length && <tr><td colSpan={13} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có dòng hàng — gõ mã hàng ở ô trên rồi Enter, hoặc Dán từ Excel</td></tr>}
          </tbody>
          <tfoot>
            <tr className="ck-total"><td style={{ textAlign: 'center' }}><b>{v.lines.length}</b></td><td colSpan={8} style={{ textAlign: 'right' }}><b>Tổng</b></td><td className="num"><b>{qtyText(totalQty)}</b></td><td className="num"><b>{showRec ? qtyText(totalRec) : ''}</b></td><td colSpan={2} /></tr>
          </tfoot>
        </table>
      </div>
      {problems.length > 0 && !readOnly && <div className="full muted" style={{ fontSize: 12 }}>Chưa ghi được: {problems.join(' · ')}</div>}
      {Boolean(error) && <div className="alert alert-bad full">{errorText(error)}</div>}
      {paste !== null && <DanExcel onCancel={() => setPaste(null)} onOk={(t) => void onPaste(t)} />}
    </Modal>
  );
}

function DanExcel({ onOk, onCancel }: { onOk: (text: string) => void; onCancel: () => void }) {
  const [t, setT] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Modal title="Dán dòng hàng từ Excel" onClose={onCancel} footer={<><button className="btn btn-primary" disabled={!t.trim()} onClick={() => onOk(t)}>Thêm vào phiếu</button><button className="btn" onClick={onCancel}>Thoát</button></>}>
      <div className="full muted" style={{ fontSize: 12 }}>Chép các cột <b>Mã hàng · Số lượng · Ghi chú</b> trong Excel rồi dán vào đây (dòng tiêu đề tự bỏ qua). Trùng mã thì cộng số lượng; lô tự gợi ý hạn sớm trước.</div>
      <textarea ref={ref} className="input full mono" rows={12} value={t} onChange={(e) => setT(e.target.value)} placeholder={'100861009B\t12\n100021004\t6\tHàng trưng bày'} />
    </Modal>
  );
}
