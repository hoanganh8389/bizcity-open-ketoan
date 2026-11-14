/**
 * Hộp thêm / sửa chương trình có hạn mức theo cửa hàng (thẻ *Có hạn mức* của BH18, phiếu NT-BH-018 — chuyển từ màn BH12): mặt hàng chính,
 * tặng hàng hoặc giảm giá, thời gian, hạn mức từng cửa hàng (không hạ dưới số đã dùng). Lưu = POST / PUT /api/v1/sale-programs (giữ nguyên API).
 */
// [2026-11-15 09:40 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: form chương trình có hạn mức trong module pos (đóng góp)
import { useState, type ReactNode } from 'react';
import { ErrorBox, Field, ItemPicker, Modal, errorText, useApi, useMutation, useQuery } from '@bizcity/ui-kit';
import { QUOTA_KINDS, emptyProgramForm, fromProgram, toProgramBody, type Program, type ProgramForm, type ProgramKind } from './han-muc';

type Branch = { code: string; name: string; isActive?: boolean };
const Row = ({ children }: { children: ReactNode }) => <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>;
const n = (s: string) => { const x = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const money = (x: number) => x.toLocaleString('vi-VN');

export function HanMucForm({ program, mode, today, writable, onClose, onDone }: {
  program: Program | null; mode: 'gift' | 'discount'; today: string; writable: boolean; onClose: () => void; onDone: (code: string) => void;
}) {
  const api = useApi();
  const kinds = (useQuery({ queryKey: ['km', 'program-kinds'], queryFn: () => api.get<ProgramKind[]>('/api/v1/program-kinds'), staleTime: 60_000 }).data ?? [])
    .filter((k) => k.side !== 'purchase' && k.isActive);
  const branches = (useQuery({ queryKey: ['km', 'branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 60_000 }).data ?? [])
    .filter((b) => b.isActive !== false);
  const [f, setF] = useState<ProgramForm>(() => (program ? fromProgram(program) : emptyProgramForm(mode, today)));
  const [editing, setEditing] = useState(!program);
  const [bulk, setBulk] = useState('0');
  const set = (p: Partial<ProgramForm>) => setF((x) => ({ ...x, ...p }));
  const used = new Map((program?.quotas ?? []).filter((q) => q.usedQty > 0).map((q) => [q.branchCode, q.usedQty] as const));
  const total = Object.values(f.quotas).reduce((a, b) => a + (b || 0), 0);
  const { body, problems } = toProgramBody(f, used);
  const save = useMutation({
    mutationFn: () => (program ? api.put(`/api/v1/sale-programs/${encodeURIComponent(program.id)}`, body) : api.post('/api/v1/sale-programs', body)),
    onSuccess: () => onDone(f.code),
  });
  const ro = !editing;
  const kindNote = kinds.find((k) => k.code === f.programKind)?.note;
  const numIn = (v: number, on: (x: number) => void, w = 100, title?: string) => (
    <input className="input num" style={{ width: w }} disabled={ro} title={title} value={v ? money(v) : ''} onChange={(e) => on(n(e.target.value))} />
  );

  return (
    <Modal wide title={program ? `Chương trình ${program.code}` : `Thêm — ${QUOTA_KINDS[f.mode].label}`} onClose={onClose} footer={(
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {editing && problems.length > 0 && <span className="muted" style={{ maxWidth: 520 }}>{problems.join(' · ')}</span>}
        {editing
          ? <button type="button" className="btn btn-primary" disabled={!writable || save.isPending || problems.length > 0} title={!writable ? 'Cần quyền ghi danh mục (catalog:write)' : problems.join('; ')} onClick={() => save.mutate()}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</button>
          : <button type="button" className="btn btn-primary" disabled={!writable} title={writable ? '' : 'Cần quyền ghi danh mục (catalog:write)'} onClick={() => setEditing(true)}>Sửa</button>}
        <button type="button" className="btn" onClick={onClose}>Đóng</button>
      </div>
    )}>
      <div style={{ display: 'grid', gap: 10, gridColumn: '1 / -1' }}>
        {save.error && <ErrorBox error={errorText(save.error)} />}
        <p className="muted" style={{ margin: 0 }}>Hàng tặng / giảm giá vẫn là <b>mặt hàng chính, không sinh mã mới</b>. Cửa hàng chỉ bán theo chương trình khi còn hạn và còn hạn mức; phiếu bán ghi sổ thì hạn mức tự trừ, huỷ thì tự trả.</p>
        <Row>
          <Field label="Mã chương trình (*)" hint="Dòng bán gắn mã này; không đổi được sau khi lưu"><input className="input mono" disabled={ro || Boolean(program)} value={f.code} placeholder="vd KM-T11-LY" onChange={(e) => set({ code: e.target.value.toUpperCase().trim() })} /></Field>
          <Field label="Tên chương trình (*)"><input className="input" style={{ width: 320 }} disabled={ro} value={f.name} placeholder="vd Mua sữa tặng ly tháng 11" onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Loại chương trình" hint={kindNote || 'Nhóm chương trình để báo cáo'}>
            <select className="select input" disabled={ro} value={f.programKind} onChange={(e) => set({ programKind: e.target.value })}>
              {kinds.length === 0 && <option value={f.programKind}>{f.programKind}</option>}
              {kinds.map((k) => <option key={k.code} value={k.code}>{k.code} — {k.name}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Mặt hàng chính (*)"><ItemPicker value={f.sku} disabled={ro} onChange={(v) => set({ sku: v ?? '' })} /></Field>
          <Field label="Kiểu ưu đãi">
            <select className="select input" disabled={ro} value={f.mode} onChange={(e) => set({ mode: e.target.value as ProgramForm['mode'] })}>
              <option value="gift">Tặng hàng</option><option value="discount">Giảm giá (kể cả cận date)</option>
            </select>
          </Field>
          {f.mode === 'gift' ? <>
            <Field label="Mua (số lượng)" hint="ĐVT nhỏ nhất">{numIn(f.buyQty, (x) => set({ buyQty: x }), 80)}</Field>
            <Field label="Tặng (số lượng)">{numIn(f.giftQty, (x) => set({ giftQty: x }), 80)}</Field>
            <Field label="Hàng tặng" hint="Trống = tặng chính mặt hàng chính"><ItemPicker value={f.giftSku} disabled={ro} placeholder="chính mặt hàng chính" onChange={(v) => set({ giftSku: v ?? '' })} /></Field>
          </> : <>
            <Field label="Cách giảm">
              <select className="select input" disabled={ro} value={f.discountWay} onChange={(e) => set({ discountWay: e.target.value as ProgramForm['discountWay'] })}>
                <option value="pct">Giảm phần trăm</option><option value="amount">Giảm số tiền / đơn vị</option><option value="price">Giá bán chương trình / đơn vị</option>
              </select>
            </Field>
            <Field label={f.discountWay === 'pct' ? 'Phần trăm giảm' : f.discountWay === 'amount' ? 'Số tiền giảm (đ)' : 'Giá bán (đ)'}>
              <input className="input num" style={{ width: 120 }} disabled={ro} value={f.discountValue ? String(f.discountValue).replace('.', ',') : ''} onChange={(e) => set({ discountValue: n(e.target.value) })} />
            </Field>
          </>}
        </Row>
        <Row>
          <Field label="Từ ngày (*)"><input type="date" className="input" disabled={ro} value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
          <Field label="Đến ngày (*)" hint="Gồm cả ngày này"><input type="date" className="input" disabled={ro} value={f.validTo} onChange={(e) => set({ validTo: e.target.value })} /></Field>
          <label className="checkbox" title="Bỏ tích để ngừng sớm"><input type="checkbox" disabled={ro} checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang áp dụng</label>
          <Field label="Ghi chú"><input className="input" style={{ width: 320 }} disabled={ro} value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        </Row>

        <fieldset style={{ border: '1px solid var(--line, #ddd)', borderRadius: 6, padding: '8px 10px', display: 'grid', gap: 8 }}>
          <legend style={{ padding: '0 4px' }}><b>Hạn mức theo cửa hàng</b></legend>
          <Row>
            <span className="muted" title="Số quà được tặng / số được bán giá giảm ở mỗi cửa hàng">Tổng {money(total)} {f.mode === 'gift' ? 'quà' : 'đơn vị'}</span>
            {!ro && <>
              <span className="muted" style={{ marginLeft: 'auto' }}>Đặt mọi cửa hàng</span>
              <input className="input num" style={{ width: 80 }} value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <button type="button" className="btn btn-xs" title="Đặt cùng hạn mức cho mọi cửa hàng (không hạ dưới số đã dùng)"
                onClick={() => set({ quotas: Object.fromEntries(branches.map((b) => [b.code, Math.max(n(bulk), used.get(b.code) ?? 0)])) })}>Áp</button>
            </>}
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6, maxHeight: 300, overflow: 'auto' }}>
            {branches.map((b) => {
              const u = used.get(b.code) ?? 0;
              const q = f.quotas[b.code] ?? 0;
              return (
                <label key={b.code} title={`${b.name}${u ? ` · đã dùng ${u}` : ''}`}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 8, fontSize: 12,
                    border: `1px solid ${q ? '#86efac' : 'var(--line, #e5e7eb)'}`, background: q ? '#f0fdf4' : undefined }}>
                  <span className="mono" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.code}<span className="muted"> {b.name}</span></span>
                  <input className="input num" disabled={ro} value={q ? money(q) : ''} onChange={(e) => setF((x) => ({ ...x, quotas: { ...x.quotas, [b.code]: n(e.target.value) } }))} />
                  {u > 0 && <span style={{ gridColumn: '1 / -1', fontSize: 10.5, color: '#9a3412' }} title="Đã dùng — hạn mức không hạ dưới số này">dùng {u}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
