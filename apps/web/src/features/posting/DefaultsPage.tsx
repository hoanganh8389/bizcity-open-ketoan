// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — Tài khoản ngầm định: danh sách định khoản theo loại chứng từ; một hộp Thêm / Sửa đơn giản (dựa trên dòng có sẵn, áp cho loại hàng / biến thể) (đóng góp)
/**
 * TÀI KHOẢN NGẦM ĐỊNH (ACC41) — mỗi dòng là một định khoản: TK Nợ / TK Có.
 *   Dòng có sẵn: tài khoản lấy ở bộ khoá ngầm định (posting_defaults). Một khoá dùng ở nhiều dòng (vd 1311) — sửa một chỗ đổi mọi chỗ.
 *   Thêm: chọn dòng có sẵn làm gốc, áp cho Loại hàng và / hoặc Biến thể, đổi TK Nợ / TK Có (điền sẵn theo dòng gốc). Lưu thành quy tắc
 *   ưu tiên thấp, chỉ ghi bên đã đổi (bên giữ nguyên đi theo dòng gốc). Dòng thêm hiện ngay dưới dòng gốc.
 *   Công tắc lý do hạch toán TẮT (mặc định): doanh thu, trả lại, giá vốn, kho lấy ở đây (không theo nhóm hạch toán / mặt hàng / lý do).
 */
import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUseReasons } from '@/lib/useReasons';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';

interface DefaultRow { key: string; label: string; accountCode: string | null }
type Cell = { key: string } | { text: string } | null;
type Part = 'goods' | 'tax' | 'cogs' | 'payment';
interface Base { business: string; part: Part; cond?: { leg?: 'in' | 'out'; sameUnit?: boolean } }
interface SysRow { id: string; group: string; name: string; debit: Cell; credit: Cell; note?: string; base?: Base }
type Cond = { itemType?: string; variant?: string; leg?: 'in' | 'out'; sameUnit?: boolean };
interface Entry { id: string; business: string; part: Part; cond: Cond; debit: string | null; credit: string | null; note: string }
interface Options { itemTypes: { code: string; name: string }[]; variants?: { code: string; name: string }[] }

const MONEY = { text: 'TK tiền theo hình thức thanh toán' };
const GROUPS = ['Bán hàng', 'Mua hàng', 'Nhập xuất kho', 'Thu chi tiền', 'Khác'] as const;
const k = (key: string): Cell => ({ key });
const b = (business: string, part: Part, cond?: Base['cond']): Base => ({ business, part, cond });
/** Định khoản có sẵn theo đúng bộ định khoản (rules/*.rule.ts). `base`: dòng thêm được theo loại hàng / biến thể. */
const SYSTEM: SysRow[] = [
  { id: 'ban-tien', group: 'Bán hàng', name: 'Bán hàng — tiền hàng', debit: k('receivable'), credit: k('revenue'), base: b('sale', 'goods') },
  { id: 'ban-thue', group: 'Bán hàng', name: 'Bán hàng — thuế GTGT đầu ra', debit: k('receivable'), credit: k('tax_output'), note: 'Loại thuế có tài khoản riêng thì theo loại thuế', base: b('sale', 'tax') },
  { id: 'ban-gv', group: 'Bán hàng', name: 'Bán hàng — giá vốn (phiếu giá vốn tháng)', debit: k('cogs'), credit: k('inventory'), base: b('sale', 'cogs') },
  { id: 'ban-thu', group: 'Bán hàng', name: 'Bán hàng thu tiền ngay', debit: MONEY, credit: k('receivable') },
  { id: 'tra-tien', group: 'Bán hàng', name: 'Khách trả hàng — tiền hàng', debit: k('sales_return'), credit: k('receivable'), base: b('sale_return', 'goods') },
  { id: 'tra-thue', group: 'Bán hàng', name: 'Khách trả hàng — thuế GTGT', debit: k('tax_output'), credit: k('receivable'), base: b('sale_return', 'tax') },
  { id: 'tra-kho', group: 'Bán hàng', name: 'Khách trả hàng — nhập lại kho', debit: k('inventory'), credit: k('cogs'), base: b('sale_return', 'cogs') },
  { id: 'mua-tien', group: 'Mua hàng', name: 'Nhập mua hàng — tiền hàng', debit: k('inventory'), credit: k('payable'), base: b('purchase', 'goods') },
  { id: 'mua-thue', group: 'Mua hàng', name: 'Nhập mua hàng — thuế GTGT đầu vào', debit: k('tax_input'), credit: k('payable'), note: 'Loại thuế có tài khoản riêng thì theo loại thuế', base: b('purchase', 'tax') },
  { id: 'trancc-tien', group: 'Mua hàng', name: 'Trả hàng nhà cung cấp — tiền hàng', debit: k('payable'), credit: k('inventory'), base: b('purchase_return', 'goods') },
  { id: 'trancc-thue', group: 'Mua hàng', name: 'Trả hàng nhà cung cấp — thuế GTGT', debit: k('payable'), credit: k('tax_input'), base: b('purchase_return', 'tax') },
  { id: 'ck-cung-x', group: 'Nhập xuất kho', name: 'Chuyển kho cùng đơn vị hạch toán — bên xuất', debit: k('goods_in_transit'), credit: k('inventory'), base: b('transfer', 'goods', { leg: 'out', sameUnit: true }) },
  { id: 'ck-cung-n', group: 'Nhập xuất kho', name: 'Chuyển kho cùng đơn vị hạch toán — bên nhận', debit: k('inventory'), credit: k('goods_in_transit'), base: b('transfer', 'goods', { leg: 'in', sameUnit: true }) },
  { id: 'ck-khac-x', group: 'Nhập xuất kho', name: 'Chuyển kho khác đơn vị hạch toán — bên xuất', debit: k('internal_receivable_goods'), credit: k('inventory'), base: b('transfer', 'goods', { leg: 'out', sameUnit: false }) },
  { id: 'ck-khac-n', group: 'Nhập xuất kho', name: 'Chuyển kho khác đơn vị hạch toán — bên nhận', debit: k('inventory'), credit: k('internal_receivable_goods'), base: b('transfer', 'goods', { leg: 'in', sameUnit: false }) },
  { id: 'dc-tang', group: 'Nhập xuất kho', name: 'Nhập điều chỉnh kho (kiểm kê thừa, nhập khác)', debit: k('inventory'), credit: k('stock_surplus'), base: b('stock_increase', 'goods') },
  { id: 'dc-giam', group: 'Nhập xuất kho', name: 'Xuất điều chỉnh kho (kiểm kê thiếu, xuất huỷ, xuất dùng)', debit: k('stock_shortage'), credit: k('inventory'), base: b('stock_decrease', 'goods') },
  { id: 'thu-kh', group: 'Thu chi tiền', name: 'Thu tiền khách hàng', debit: MONEY, credit: k('receivable') },
  { id: 'tra-ncc', group: 'Thu chi tiền', name: 'Trả tiền nhà cung cấp', debit: k('payable'), credit: MONEY },
  { id: 'ct-cung-c', group: 'Thu chi tiền', name: 'Chuyển tiền chi nhánh cùng đơn vị — nơi chuyển', debit: k('cash_in_transit'), credit: MONEY },
  { id: 'ct-cung-n', group: 'Thu chi tiền', name: 'Chuyển tiền chi nhánh cùng đơn vị — nơi nhận', debit: MONEY, credit: k('cash_in_transit') },
  { id: 'ct-khac-c', group: 'Thu chi tiền', name: 'Chuyển tiền khác đơn vị — nơi chuyển', debit: k('internal_receivable'), credit: MONEY },
  { id: 'ct-khac-n', group: 'Thu chi tiền', name: 'Chuyển tiền khác đơn vị — nơi nhận', debit: MONEY, credit: k('internal_payable') },
  { id: 'tien-mat', group: 'Khác', name: 'Tiền mặt mặc định', debit: k('cash'), credit: null },
  { id: 'km', group: 'Khác', name: 'Chi phí hàng khuyến mãi, tặng khách', debit: k('promotion_expense'), credit: null },
  { id: 'gv-nb', group: 'Khác', name: 'Giá vốn nội bộ khi bán / chuyển nội bộ', debit: k('internal_cogs'), credit: null },
  { id: 'tra-nb', group: 'Khác', name: 'Phải trả nội bộ hàng', debit: null, credit: k('internal_payable_goods') },
  { id: 'hh', group: 'Khác', name: 'Ghi nhận hoa hồng', debit: k('commission_debit'), credit: k('commission_credit') },
];
const BASES = SYSTEM.filter((s) => s.base);
/** Dòng gốc của một dòng thêm: cùng loại chứng từ, khoản, chiều / đơn vị chuyển kho. */
const baseOf = (e: Entry) => BASES.find((s) => s.base!.business === e.business && s.base!.part === e.part
  && (s.base!.cond?.leg ?? undefined) === (e.cond.leg ?? undefined) && (s.base!.cond?.sameUnit ?? undefined) === (e.cond.sameUnit ?? undefined));

/** "Loại hàng: Quà · Biến thể: Khuyến mại". */
const condText = (c: Cond, o?: Options) => [
  c.itemType && `Loại hàng: ${o?.itemTypes.find((t) => t.code === c.itemType)?.name ?? c.itemType}`,
  c.variant && `Biến thể: ${o?.variants?.find((t) => t.code === c.variant)?.name ?? c.variant}`,
].filter(Boolean).join(' · ');

export function DefaultsPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const useReasons = useUseReasons();
  const q = useQuery({ queryKey: ['posting-defaults'], queryFn: () => api.get<DefaultRow[]>('/api/v1/posting/defaults') });
  const entries = useQuery({ queryKey: ['posting-rules', 'defaults'], queryFn: () => api.get<Entry[]>('/api/v1/posting-rules/defaults') });
  const options = useQuery({ queryKey: ['posting-rules', 'options'], queryFn: () => api.get<Options>('/api/v1/posting-rules/options'), staleTime: 60_000 }).data;
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ row?: SysRow; entry?: Entry } | null>(null);

  const acc = useMemo(() => new Map((q.data ?? []).map((r) => [r.key, r])), [q.data]);
  const cellAcc = (c: Cell) => (!c || 'text' in c ? '' : acc.get(c.key)?.accountCode ?? '');
  const condLabel = (c: Cond) => condText(c, options);
  const s = search.trim().toLowerCase();
  const added = (row: SysRow) => (entries.data ?? []).filter((e) => baseOf(e) === row);
  const hit = (txt: string) => !s || txt.toLowerCase().includes(s);
  const shown = SYSTEM.filter((r) => (!group || r.group === group) && (hit(`${r.name} ${cellAcc(r.debit)} ${cellAcc(r.credit)}`) || added(r).some((e) => hit(`${condLabel(e.cond)} ${e.debit ?? ''} ${e.credit ?? ''}`))));
  const money = (c: Cell) => (c && 'text' in c ? <span className="muted" title={c.text}>theo HTTT</span> : null);

  return (
    <>
      <PageHeader title="Tài khoản ngầm định" code="ACC41" subtitle="Định khoản mặc định của từng loại chứng từ. Trường hợp riêng (theo loại hàng, biến thể): Thêm" helpKey="tai-khoan-ngam-dinh" />
      {useReasons && <div className="alert alert-warn" style={{ marginBottom: 8 }}>Đang <b>bật lý do hạch toán</b>: doanh thu, trả lại, giá vốn, kho lấy theo nhóm hạch toán của mặt hàng; tài khoản trên lý do đè lên các dòng dưới đây.</div>}
      <div className="card">
        <div className="catalog-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>Loại chứng từ
            <select className="select input" style={{ width: 200 }} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Tất cả</option>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <input className="input" style={{ width: 260 }} placeholder="Tìm: tên, tài khoản" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => { void q.refetch(); void entries.refetch(); }} title="Nạp lại"><RefreshCw size={14} /></button>
          <button className="btn btn-sm btn-primary" disabled={!canWrite} onClick={() => setOpen({})} title="Định khoản riêng cho một loại hàng / biến thể"><Plus size={14} /> Thêm tài khoản ngầm định</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : entries.error ? errorText(entries.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="grid">
            <thead><tr>
              <th style={{ width: 120 }}>Loại chứng từ</th><th>Loại</th>
              <th style={{ width: 110 }} title="Tài khoản ghi Nợ">TK Nợ</th><th style={{ width: 110 }} title="Tài khoản ghi Có">TK Có</th><th style={{ width: 70 }}>Chức năng</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="muted">{r.group}</td>
                    <td title={r.note}>{r.name}</td>
                    <td className="mono" title={r.debit && 'key' in r.debit ? acc.get(r.debit.key)?.label : undefined}>{cellAcc(r.debit) || money(r.debit)}</td>
                    <td className="mono" title={r.credit && 'key' in r.credit ? acc.get(r.credit.key)?.label : undefined}>{cellAcc(r.credit) || money(r.credit)}</td>
                    <td>{canWrite && (r.debit && 'key' in r.debit || r.credit && 'key' in r.credit) && <button className="link" onClick={() => setOpen({ row: r })}>Sửa</button>}</td>
                  </tr>
                  {added(r).map((e) => (
                    <tr key={e.id}>
                      <td />
                      <td style={{ paddingLeft: 24 }}>↳ {condLabel(e.cond)}</td>
                      <td className="mono">{e.debit ?? <span className="muted">{cellAcc(r.debit)}</span>}</td>
                      <td className="mono">{e.credit ?? <span className="muted">{cellAcc(r.credit)}</span>}</td>
                      <td>{canWrite && <button className="link" onClick={() => setOpen({ row: r, entry: e })}>Sửa</button>}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!shown.length && <tr><td colSpan={5} className="muted">Không có định khoản nào khớp.</td></tr>}
            </tbody>
          </table></div>
        )}
        <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>
          ↳ là dòng thêm cho một loại hàng / biến thể; ô mờ = như dòng gốc. TK tiền theo <Link to="/cau-hinh/hinh-thuc-thanh-toan">Hình thức thanh toán</Link>.
        </div>
      </div>
      {open && <HopDinhKhoan row={open.row} entry={open.entry} defaults={q.data ?? []} options={options} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Một hộp cho Thêm và Sửa, chỉ hiện ô sửa được; luôn điền sẵn. Dòng đã có mở ở chế độ xem (Sửa → Ghi); tên dòng ở tiêu đề.
 *   Sửa dòng có sẵn: chỉ TK Nợ / TK Có (tài khoản dùng chung thì ghi số dòng cùng đổi).
 *   Sửa dòng thêm: loại hàng, biến thể, TK Nợ / TK Có. Thêm: thêm ô Dựa trên dòng; TK Nợ / Có điền theo dòng gốc.
 */
function HopDinhKhoan({ row, entry, defaults, options, onClose }: { row?: SysRow; entry?: Entry; defaults: DefaultRow[]; options?: Options; onClose: () => void }) {
  const qc = useQueryClient();
  const isSystem = Boolean(row && !entry);
  const [baseId, setBaseId] = useState(row?.id ?? BASES[0]!.id);
  const base = SYSTEM.find((x) => x.id === baseId)!;
  const accOf = (c: Cell) => (!c || 'text' in c ? '' : defaults.find((d) => d.key === c.key)?.accountCode ?? '');
  const [cond, setCond] = useState<Cond>({ itemType: entry?.cond.itemType, variant: entry?.cond.variant });
  const [debit, setDebit] = useState(entry ? entry.debit ?? accOf(base.debit) : accOf(base.debit));
  const [credit, setCredit] = useState(entry ? entry.credit ?? accOf(base.credit) : accOf(base.credit));
  const pickBase = (id: string) => { const nb = SYSTEM.find((x) => x.id === id)!; setBaseId(id); setDebit(accOf(nb.debit)); setCredit(accOf(nb.credit)); };
  const keyOf = (c: Cell) => (c && 'key' in c ? c.key : null);
  const usedBy = (key: string | null) => (key ? SYSTEM.filter((s) => s !== base && [s.debit, s.credit].some((c) => keyOf(c) === key)).map((s) => s.name) : []);
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['posting-defaults'] }); void qc.invalidateQueries({ queryKey: ['posting-rules'] }); };

  const changedD = debit && debit !== accOf(base.debit) ? debit : null;
  const changedC = credit && credit !== accOf(base.credit) ? credit : null;
  const problem = isSystem ? '' : !cond.itemType && !cond.variant ? 'Chọn Loại hàng hoặc Biến thể' : !changedD && !changedC ? 'Đổi ít nhất một tài khoản khác dòng gốc' : '';
  const save = useMutation({
    mutationFn: () => {
      if (isSystem) {
        const body: Record<string, string> = {};
        const dk = keyOf(base.debit); const ck = keyOf(base.credit);
        if (dk && debit) body[dk] = debit;
        if (ck && credit) body[ck] = credit;
        return api.put('/api/v1/posting/defaults', body);
      }
      const label = [cond.itemType && (options?.itemTypes.find((t) => t.code === cond.itemType)?.name ?? cond.itemType), cond.variant && (options?.variants?.find((t) => t.code === cond.variant)?.name ?? cond.variant)].filter(Boolean).join(', ');
      return api.post('/api/v1/posting-rules/defaults', {
        id: entry?.id, business: base.base!.business, part: base.base!.part, name: `${base.name} — ${label}`,
        cond: { ...base.base!.cond, ...(cond.itemType ? { itemType: cond.itemType } : {}), ...(cond.variant ? { variant: cond.variant } : {}) },
        debit: changedD, credit: changedC,
      });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const del = useMutation({ mutationFn: () => api.delete(`/api/v1/posting-rules/defaults/${entry!.id}`), onSuccess: () => { invalidate(); onClose(); } });

  const accField = (side: 'Nợ' | 'Có', c: Cell, v: string, set: (x: string) => void) => {
    if (!c) return <Field label={`TK ${side}`}><span className="muted">—</span></Field>;
    if ('text' in c) return <Field label={`TK ${side}`}><span className="muted">{c.text}</span></Field>;
    const others = isSystem ? usedBy(c.key) : [];
    const note = isSystem ? (others.length ? `Dùng chung ở ${others.length} dòng khác — đổi ở đây là đổi cả các dòng đó` : undefined) : v && v !== accOf(c) ? `Dòng gốc: ${accOf(c)}` : 'Như dòng gốc';
    return <Field label={`TK ${side}`} hint={note} tip={others.length ? `Cùng đổi: ${others.join('; ')}` : undefined}><AccountPicker postingOnly value={v} onChange={set} /></Field>;
  };
  return (
    <Modal title={row ? `${base.name}${entry ? ` — ${condText(entry.cond, options)}` : ''}` : 'Thêm tài khoản ngầm định'} viewFirst={Boolean(row)} onClose={onClose}
      footer={<>
        {entry && <button className="btn" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => { if (window.confirm('Xoá dòng này? Hàng đó sẽ ghi như dòng gốc.')) del.mutate(); }}>Xoá</button>}
        <button className="btn btn-primary" disabled={save.isPending || Boolean(problem)} title={problem} onClick={() => save.mutate()}>Ghi</button>
        <button className="btn" onClick={onClose}>Huỷ</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : del.error ? errorText(del.error) : null} />
      {!row && (
        <Field label="Dựa trên dòng" full>
          <select className="select input" value={baseId} onChange={(e) => pickBase(e.target.value)}>
            {GROUPS.map((g) => BASES.some((x) => x.group === g) && (
              <optgroup key={g} label={g}>{BASES.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
            ))}
          </select>
        </Field>
      )}
      {!isSystem && <>
      <Field label="Áp cho loại hàng">
        <select className="select input" value={cond.itemType ?? ''} onChange={(e) => setCond((c) => ({ ...c, itemType: e.target.value || undefined }))}>
          <option value="">— mọi loại hàng —</option>{(options?.itemTypes ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Áp cho biến thể">
        <select className="select input" value={cond.variant ?? ''} onChange={(e) => setCond((c) => ({ ...c, variant: e.target.value || undefined }))}>
          <option value="">— mọi biến thể —</option>{(options?.variants ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
      </Field>
      </>}
      {accField('Nợ', base.debit, debit, setDebit)}
      {accField('Có', base.credit, credit, setCredit)}
      {base.note && <div className="muted full" style={{ fontSize: 12 }}>{base.note}</div>}
      {problem && <div className="muted full" style={{ fontSize: 12 }}>{problem}</div>}
    </Modal>
  );
}
