// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — Tài khoản ngầm định kiểu danh sách theo loại chứng từ (như phần mềm kế toán phổ biến): sửa từng định khoản, thêm định khoản theo điều kiện (đóng góp)
/**
 * TÀI KHOẢN NGẦM ĐỊNH (ACC41) — mỗi dòng là một định khoản của một loại chứng từ: TK Nợ / TK Có.
 *   Dòng có sẵn: tài khoản lấy ở bộ khoá ngầm định (posting_defaults). Một khoá có thể dùng ở nhiều dòng (vd Phải thu khách hàng
 *   ở bán hàng, khách trả hàng, thu tiền) — sửa ở dòng nào cũng đổi ở mọi dòng dùng chung, màn ghi rõ.
 *   "Thêm tài khoản ngầm định": định khoản theo điều kiện (loại hàng, hình thức thanh toán, hàng tặng…) cho một loại chứng từ — lưu
 *   thành quy tắc ưu tiên thấp (quy tắc ở Thiết kế hạch toán ACC92 cùng mức điều kiện thắng). Ô trống = giữ tài khoản của dòng có sẵn.
 *   Công tắc lý do hạch toán TẮT (mặc định): doanh thu, trả lại, giá vốn, kho lấy ở đây (không theo nhóm hạch toán / mặt hàng / lý do).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUseReasons } from '@/lib/useReasons';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';

interface DefaultRow { key: string; label: string; accountCode: string | null; onForm: boolean }
type Cell = { key: string } | { text: string } | null;
interface SysRow { group: string; name: string; debit: Cell; credit: Cell; note?: string }
type Part = 'goods' | 'tax' | 'cogs' | 'payment';
type CondKey = 'method' | 'taxCode' | 'itemType' | 'programKind' | 'program' | 'gift' | 'leg' | 'sameUnit';
interface Entry { id: string; business: string; part: Part; partLabel: string; cond: Partial<Record<CondKey, unknown>>; condText: string; debit: string | null; credit: string | null; note: string }
interface Options {
  businesses: { code: string; name: string; parts: { part: Part; label: string; conds: CondKey[] }[] }[];
  condLabels: Record<CondKey, string>;
  methods: { code: string; name: string; isReceivable: boolean }[];
  taxes: { code: string; name: string; rate: number }[];
  itemTypes: { code: string; name: string }[];
  programKinds: { code: string; name: string }[];
  programs: { code: string; name: string }[];
}

const MONEY = { text: 'TK tiền theo hình thức thanh toán' };
const GROUPS = ['Bán hàng', 'Mua hàng', 'Nhập xuất kho', 'Thu chi tiền', 'Khác'] as const;
const GROUP_OF: Record<string, (typeof GROUPS)[number]> = {
  sale: 'Bán hàng', sale_return: 'Bán hàng', purchase: 'Mua hàng', purchase_return: 'Mua hàng', transfer: 'Nhập xuất kho',
  stock_increase: 'Nhập xuất kho', stock_decrease: 'Nhập xuất kho', customer_payment: 'Thu chi tiền', supplier_payment: 'Thu chi tiền',
};
const k = (key: string): Cell => ({ key });
/** Định khoản có sẵn theo đúng bộ định khoản (rules/*.rule.ts). */
const SYSTEM: SysRow[] = [
  { group: 'Bán hàng', name: 'Bán hàng — tiền hàng', debit: k('receivable'), credit: k('revenue') },
  { group: 'Bán hàng', name: 'Bán hàng — thuế GTGT đầu ra', debit: k('receivable'), credit: k('tax_output'), note: 'Loại thuế có tài khoản riêng thì theo loại thuế' },
  { group: 'Bán hàng', name: 'Bán hàng — giá vốn (phiếu giá vốn tháng)', debit: k('cogs'), credit: k('inventory') },
  { group: 'Bán hàng', name: 'Bán hàng thu tiền ngay', debit: MONEY, credit: k('receivable') },
  { group: 'Bán hàng', name: 'Khách trả hàng — tiền hàng', debit: k('sales_return'), credit: k('receivable') },
  { group: 'Bán hàng', name: 'Khách trả hàng — thuế GTGT', debit: k('tax_output'), credit: k('receivable') },
  { group: 'Bán hàng', name: 'Khách trả hàng — nhập lại kho', debit: k('inventory'), credit: k('cogs') },
  { group: 'Mua hàng', name: 'Nhập mua hàng — tiền hàng', debit: k('inventory'), credit: k('payable') },
  { group: 'Mua hàng', name: 'Nhập mua hàng — thuế GTGT đầu vào', debit: k('tax_input'), credit: k('payable'), note: 'Loại thuế có tài khoản riêng thì theo loại thuế' },
  { group: 'Mua hàng', name: 'Trả hàng nhà cung cấp — tiền hàng', debit: k('payable'), credit: k('inventory') },
  { group: 'Mua hàng', name: 'Trả hàng nhà cung cấp — thuế GTGT', debit: k('payable'), credit: k('tax_input') },
  { group: 'Nhập xuất kho', name: 'Chuyển kho cùng đơn vị hạch toán — bên xuất', debit: k('goods_in_transit'), credit: k('inventory') },
  { group: 'Nhập xuất kho', name: 'Chuyển kho cùng đơn vị hạch toán — bên nhận', debit: k('inventory'), credit: k('goods_in_transit') },
  { group: 'Nhập xuất kho', name: 'Chuyển kho khác đơn vị hạch toán — bên xuất', debit: k('internal_receivable_goods'), credit: k('inventory') },
  { group: 'Nhập xuất kho', name: 'Chuyển kho khác đơn vị hạch toán — bên nhận', debit: k('inventory'), credit: k('internal_receivable_goods') },
  { group: 'Nhập xuất kho', name: 'Nhập điều chỉnh kho (kiểm kê thừa, nhập khác)', debit: k('inventory'), credit: k('stock_surplus') },
  { group: 'Nhập xuất kho', name: 'Xuất điều chỉnh kho (kiểm kê thiếu, xuất huỷ, xuất dùng)', debit: k('stock_shortage'), credit: k('inventory') },
  { group: 'Thu chi tiền', name: 'Thu tiền khách hàng', debit: MONEY, credit: k('receivable') },
  { group: 'Thu chi tiền', name: 'Trả tiền nhà cung cấp', debit: k('payable'), credit: MONEY },
  { group: 'Thu chi tiền', name: 'Chuyển tiền chi nhánh cùng đơn vị — nơi chuyển', debit: k('cash_in_transit'), credit: MONEY },
  { group: 'Thu chi tiền', name: 'Chuyển tiền chi nhánh cùng đơn vị — nơi nhận', debit: MONEY, credit: k('cash_in_transit') },
  { group: 'Thu chi tiền', name: 'Chuyển tiền khác đơn vị — nơi chuyển', debit: k('internal_receivable'), credit: MONEY },
  { group: 'Thu chi tiền', name: 'Chuyển tiền khác đơn vị — nơi nhận', debit: MONEY, credit: k('internal_payable') },
  { group: 'Khác', name: 'Tiền mặt mặc định', debit: k('cash'), credit: null },
  { group: 'Khác', name: 'Chi phí hàng khuyến mãi, tặng khách', debit: k('promotion_expense'), credit: null },
  { group: 'Khác', name: 'Giá vốn nội bộ khi bán / chuyển nội bộ', debit: k('internal_cogs'), credit: null },
  { group: 'Khác', name: 'Phải trả nội bộ hàng', debit: null, credit: k('internal_payable_goods') },
  { group: 'Khác', name: 'Ghi nhận hoa hồng', debit: k('commission_debit'), credit: k('commission_credit') },
];
/** Khoá ngầm định chỉ dùng khi công tắc lý do / nhóm hạch toán TẮT. */
const ITEM_KEYS = new Set(['revenue', 'sales_return', 'cogs', 'inventory']);

export function DefaultsPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const useReasons = useUseReasons();
  const q = useQuery({ queryKey: ['posting-defaults'], queryFn: () => api.get<DefaultRow[]>('/api/v1/posting/defaults') });
  const entries = useQuery({ queryKey: ['posting-rules', 'defaults'], queryFn: () => api.get<Entry[]>('/api/v1/posting-rules/defaults') });
  const options = useQuery({ queryKey: ['posting-rules', 'options'], queryFn: () => api.get<Options>('/api/v1/posting-rules/options'), staleTime: 60_000 }).data;
  const [group, setGroup] = useState<string>('');
  const [search, setSearch] = useState('');
  const [editSys, setEditSys] = useState<SysRow | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | 'new' | null>(null);

  const acc = useMemo(() => new Map((q.data ?? []).map((r) => [r.key, r])), [q.data]);
  const bizName = (c: string) => options?.businesses.find((b) => b.code === c)?.name ?? c;
  type Row = { id: string; group: string; name: string; cond: string; debit: string; credit: string; dTip: string; cTip: string; sys?: SysRow; entry?: Entry };
  const cellText = (c: Cell) => (!c ? '' : 'text' in c ? '' : acc.get(c.key)?.accountCode ?? '');
  const cellTip = (c: Cell) => (!c ? '' : 'text' in c ? c.text : `${acc.get(c.key)?.label ?? c.key}${ITEM_KEYS.has(c.key) && useReasons ? ' — đang bật lý do / nhóm hạch toán: lấy theo nhóm hạch toán của mặt hàng' : ''}`);
  const rows: Row[] = [
    ...SYSTEM.map((s, i) => ({ id: `s${i}`, group: s.group, name: s.name, cond: s.note ?? '', debit: cellText(s.debit), credit: cellText(s.credit), dTip: cellTip(s.debit), cTip: cellTip(s.credit), sys: s })),
    ...(entries.data ?? []).map((e) => ({ id: `e${e.id}`, group: GROUP_OF[e.business] ?? 'Khác', name: `${e.note || bizName(e.business)}`, cond: `${bizName(e.business)} · ${e.partLabel} · ${e.condText}`,
      debit: e.debit ?? '', credit: e.credit ?? '', dTip: e.debit ? '' : 'Trống = như định khoản có sẵn', cTip: e.credit ? '' : 'Trống = như định khoản có sẵn', entry: e })),
  ];
  const s = search.trim().toLowerCase();
  const shown = rows.filter((r) => (!group || r.group === group) && (!s || `${r.name} ${r.cond} ${r.debit} ${r.credit}`.toLowerCase().includes(s)))
    .sort((a, b) => GROUPS.indexOf(a.group as never) - GROUPS.indexOf(b.group as never));

  return (
    <>
      <PageHeader title="Tài khoản ngầm định" code="ACC41" subtitle="Định khoản mặc định của từng loại chứng từ — sửa từng dòng, thêm định khoản theo loại hàng, hình thức thanh toán…" helpKey="tai-khoan-ngam-dinh" />
      {useReasons && <div className="alert alert-warn" style={{ marginBottom: 8 }}>Đang <b>bật lý do hạch toán</b>: doanh thu, trả lại, giá vốn, kho lấy theo nhóm hạch toán của mặt hàng; tài khoản trên lý do đè lên các dòng dưới đây.</div>}
      <div className="card">
        <div className="catalog-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>Loại chứng từ
            <select className="select input" style={{ width: 220 }} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Tất cả</option>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <input className="input" style={{ width: 260 }} placeholder="Tìm: tên định khoản, tài khoản" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => { void q.refetch(); void entries.refetch(); }} title="Nạp lại"><RefreshCw size={14} /></button>
          <button className="btn btn-sm btn-primary" disabled={!canWrite} onClick={() => setEditEntry('new')} title="Định khoản riêng cho một loại chứng từ theo điều kiện: loại hàng, hình thức thanh toán, hàng tặng…"><Plus size={14} /> Thêm tài khoản ngầm định</button>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : entries.error ? errorText(entries.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="grid">
            <thead><tr>
              <th title="Loại chứng từ">Loại chứng từ</th><th title="Tên định khoản">Loại</th><th title="Điều kiện áp / ghi chú">Điều kiện</th>
              <th style={{ width: 110 }} title="Tài khoản ghi Nợ">TK Nợ</th><th style={{ width: 110 }} title="Tài khoản ghi Có">TK Có</th><th style={{ width: 70 }}>Chức năng</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.group}</td>
                  <td>{r.name}{r.entry && <span className="badge badge-info" style={{ marginLeft: 6 }} title="Định khoản thêm theo điều kiện">thêm</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.cond}</td>
                  <td className="mono" title={r.dTip}>{r.debit || <span className="muted">{r.sys?.debit && 'text' in r.sys.debit ? 'theo HTTT' : ''}</span>}</td>
                  <td className="mono" title={r.cTip}>{r.credit || <span className="muted">{r.sys?.credit && 'text' in r.sys.credit ? 'theo HTTT' : ''}</span>}</td>
                  <td>{canWrite && <button className="link" onClick={() => (r.sys ? setEditSys(r.sys) : setEditEntry(r.entry!))}>Sửa</button>}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} className="muted">Không có định khoản nào khớp.</td></tr>}
            </tbody>
          </table></div>
        )}
        <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>
          Quy tắc ở <Link to="/cau-hinh/thiet-ke-hach-toan">Thiết kế hạch toán (ACC92)</Link> cùng mức điều kiện thắng các dòng ở đây. TK tiền lấy theo <Link to="/cau-hinh/hinh-thuc-thanh-toan">Hình thức thanh toán</Link>.
        </div>
      </div>
      {editSys && <SuaDongSan row={editSys} defaults={q.data ?? []} onClose={() => setEditSys(null)} />}
      {editEntry && options && <SuaDinhKhoan entry={editEntry === 'new' ? null : editEntry} options={options} onClose={() => setEditEntry(null)} />}
    </>
  );
}

/** Sửa một dòng có sẵn = sửa khoá ngầm định của ô Nợ / Có (dùng chung cho mọi dòng có cùng khoá). */
function SuaDongSan({ row, defaults, onClose }: { row: SysRow; defaults: DefaultRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const keys = [row.debit, row.credit].filter((c): c is { key: string } => Boolean(c && 'key' in c)).map((c) => c.key);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(keys.map((x) => [x, defaults.find((d) => d.key === x)?.accountCode ?? ''])));
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/posting/defaults', Object.fromEntries(Object.entries(v).filter(([, a]) => a))),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-defaults'] }); onClose(); },
  });
  const usedBy = (key: string) => SYSTEM.filter((s) => s !== row && [s.debit, s.credit].some((c) => c && 'key' in c && c.key === key)).map((s) => s.name);
  const field = (c: Cell, side: 'Nợ' | 'Có') => {
    if (!c) return <Field label={`TK ${side}`}><span className="muted">—</span></Field>;
    if ('text' in c) return <Field label={`TK ${side}`}><span className="muted">{c.text}</span></Field>;
    const others = usedBy(c.key);
    return (
      <Field label={`TK ${side}`} hint={others.length ? `Dùng chung với: ${others.join('; ')}` : undefined}>
        <AccountPicker postingOnly value={v[c.key] ?? ''} onChange={(a) => setV((x) => ({ ...x, [c.key]: a }))} />
      </Field>
    );
  };
  return (
    <Modal title={`Sửa tài khoản ngầm định — ${row.name}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !keys.length} onClick={() => save.mutate()}>Cất</button><button className="btn" onClick={onClose}>Huỷ</button></>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      {field(row.debit, 'Nợ')}
      {field(row.credit, 'Có')}
      {row.note && <div className="muted full" style={{ fontSize: 12 }}>{row.note}</div>}
    </Modal>
  );
}

/** Thêm / sửa định khoản theo điều kiện cho một loại chứng từ. */
function SuaDinhKhoan({ entry, options, onClose }: { entry: Entry | null; options: Options; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    business: entry?.business ?? 'sale', part: entry?.part ?? ('goods' as Part), name: entry?.note ?? '',
    cond: (entry?.cond ?? {}) as Partial<Record<CondKey, unknown>>, debit: entry?.debit ?? '', credit: entry?.credit ?? '',
  }));
  const biz = options.businesses.find((b) => b.code === f.business);
  const part = biz?.parts.find((p) => p.part === f.part) ?? biz?.parts[0];
  const conds: CondKey[] = (part?.conds ?? []).filter((c) => c !== 'programKind');
  const setCond = (c: CondKey, val: unknown) => setF((x) => ({ ...x, cond: { ...x.cond, [c]: val === '' || val === undefined ? undefined : val } }));
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/posting-rules/defaults', { id: entry?.id, business: f.business, part: part?.part ?? f.part, name: f.name, cond: Object.fromEntries(Object.entries(f.cond).filter(([key, x]) => x !== undefined && conds.includes(key as CondKey))), debit: f.debit || null, credit: f.credit || null }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); },
  });
  const del = useMutation({ mutationFn: () => api.delete(`/api/v1/posting-rules/defaults/${entry!.id}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); } });
  const sel = (c: CondKey, list: { code: string; name: string }[]) => (
    <select className="select input" value={String(f.cond[c] ?? '')} onChange={(e) => setCond(c, e.target.value)}>
      <option value="">— mọi trường hợp —</option>{list.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
    </select>
  );
  const condInput = (c: CondKey) => {
    if (c === 'gift') return <select className="select input" value={f.cond.gift === undefined ? '' : String(f.cond.gift)} onChange={(e) => setCond('gift', e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">— mọi trường hợp —</option><option value="true">Hàng tặng</option><option value="false">Hàng bán</option></select>;
    if (c === 'sameUnit') return <select className="select input" value={f.cond.sameUnit === undefined ? '' : String(f.cond.sameUnit)} onChange={(e) => setCond('sameUnit', e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">— mọi trường hợp —</option><option value="true">Cùng đơn vị hạch toán</option><option value="false">Khác đơn vị hạch toán</option></select>;
    if (c === 'leg') return <select className="select input" value={String(f.cond.leg ?? '')} onChange={(e) => setCond('leg', e.target.value)}><option value="">— cả hai bên —</option><option value="out">Bên xuất</option><option value="in">Bên nhận</option></select>;
    if (c === 'method') return sel(c, options.methods.filter((m) => !m.isReceivable));
    if (c === 'taxCode') return sel(c, options.taxes.map((t) => ({ code: t.code, name: `${t.name} (${t.rate}%)` })));
    if (c === 'itemType') return sel(c, options.itemTypes);
    return sel(c, options.programs);
  };
  return (
    <Modal title={entry ? `Sửa tài khoản ngầm định — ${entry.note}` : 'Thêm tài khoản ngầm định'} onClose={onClose}
      footer={<>
        {entry && <button className="btn" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => { if (window.confirm('Xoá định khoản này?')) del.mutate(); }}>Xoá</button>}
        <button className="btn btn-primary" disabled={save.isPending || !f.name.trim() || (!f.debit && !f.credit)} title={!f.debit && !f.credit ? 'Chọn ít nhất TK Nợ hoặc TK Có' : ''} onClick={() => save.mutate()}>Cất</button>
        <button className="btn" onClick={onClose}>Huỷ</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : del.error ? errorText(del.error) : null} />
      <Field label="Loại chứng từ (*)">
        <select className="select input" value={f.business} onChange={(e) => { const b = options.businesses.find((x) => x.code === e.target.value); setF((x) => ({ ...x, business: e.target.value, part: b?.parts[0]?.part ?? 'goods', cond: {} })); }}>
          {options.businesses.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Khoản" tip="Phần của bút toán: tiền hàng, thuế, giá vốn, thanh toán">
        <select className="select input" value={part?.part ?? ''} onChange={(e) => setF((x) => ({ ...x, part: e.target.value as Part, cond: {} }))}>
          {(biz?.parts ?? []).map((p) => <option key={p.part} value={p.part}>{p.label}</option>)}
        </select>
      </Field>
      <Field label="Tên định khoản (*)" full><input className="input" value={f.name} placeholder="vd: Bán hàng khuyến mại — doanh thu" onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
      {conds.map((c) => <Field key={c} label={options.condLabels[c] ?? c}>{condInput(c)}</Field>)}
      <Field label="TK Nợ" tip="Trống = như định khoản có sẵn"><AccountPicker postingOnly value={f.debit} onChange={(a) => setF((x) => ({ ...x, debit: a }))} /></Field>
      <Field label="TK Có" tip="Trống = như định khoản có sẵn"><AccountPicker postingOnly value={f.credit} onChange={(a) => setF((x) => ({ ...x, credit: a }))} /></Field>
    </Modal>
  );
}
