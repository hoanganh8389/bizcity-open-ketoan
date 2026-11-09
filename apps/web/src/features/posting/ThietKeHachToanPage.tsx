// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền định khoản, đổi nhóm hạch toán hàng loạt (đóng góp)
/**
 * THIẾT KẾ HẠCH TOÁN (ACC92) — một chỗ nhìn và sửa toàn bộ dây chuyền định khoản.
 *
 *  Trái : các màn nghiệp vụ (Bán hàng, Khách trả hàng, Nhập mua, Trả NCC, Chuyển kho, Điều chỉnh kho, Phiếu thu, Phiếu chi),
 *         mỗi màn gán vài lý do. Màn nhập liệu chỉ hiện các lý do này.
 *  Phải : sơ đồ dây chuyền của lý do đang chọn:
 *           Chứng từ  →  Nguồn tài khoản (lý do, nhóm hạch toán, thuế, hình thức thanh toán, ngầm định)  →  Bút toán  →  Sổ cái
 *         Đường liền chạy = tài khoản đang được dùng; nét đứt mờ = nguồn dự phòng (bỏ trống ở trên thì lấy ở đây).
 *         Bấm một ô tài khoản để sửa ngay — cả dây chuyền tính lại, luôn kiểm Nợ = Có.
 *  Thẻ 2: đổi nhóm hạch toán hàng loạt theo nhóm hàng (xem trước số mặt hàng rồi mới đổi).
 *
 * Dữ liệu: GET /api/v1/posting-flow/flow (bản đọc theo đúng thứ tự tra tài khoản của bộ định khoản). Sửa đi qua API cấu hình
 * có sẵn (/api/v1/posting/reasons|groups|defaults|payment-methods, /api/v1/tax-codes) — bộ định khoản đọc đúng những bảng đó.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRightLeft, BookOpen, CheckCircle2, CircleAlert, FileText, Layers, Plus, Receipt, Star, Tag, Wallet, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker, ListPicker } from '@/components/pickers';
import { CayNhomHang, useNhomHang } from '@/components/CayNhomHang';
import './thiet-ke-hach-toan.css';

// ------------------------------------------------------------------------------------------------ kiểu dữ liệu
type SourceKind = 'reason' | 'payReason' | 'group' | 'defaults' | 'tax' | 'payment';
interface SourceField { key: string; label: string; value: string | null; name?: string | null }
interface FlowSource { id: SourceKind; label: string; code: string | null; title: string; fields: SourceField[]; edit: string }
interface ChainStep { source: SourceKind; field: string; label: string; value: string | null }
interface FlowSide { account: string | null; accountName: string | null; from: ChainStep | null; chain: ChainStep[] }
interface FlowEntry { key: string; label: string; note?: string; amount: number; debit: FlowSide; credit: FlowSide }
interface Flow {
  screen: { key: string; label: string; area: string };
  reason: { code: string; name: string; kind: string };
  sample: { amount: number; taxRate: number; tax: number; cost: number; groupCode: string; taxCode: string | null; methodCode: string | null; gift: boolean };
  options: { groups: { code: string; name: string; isDefault: boolean }[]; taxes: { code: string; name: string; rate: number }[]; methods: { code: string; name: string; isReceivable: boolean }[] };
  sources: FlowSource[]; entries: FlowEntry[]; totals: { debit: number; credit: number; balanced: boolean }; missing: string[];
  impact: { groupProducts: number; reasonScreens: string[]; reasonEntries: number };
}
interface ScreenRow { key: string; label: string; area: string; kinds: string[]; defaultFlag: string; note: string; reasons: { code: string; name: string; isDefault: boolean; isActive: boolean; missing: boolean }[] }
interface Reason { code: string; name: string; kind: string; counterAccount: string | null; revenueAccount: string | null; expenseAccount: string | null; cashflowCode: string | null; flags: Record<string, unknown>; isActive: boolean }
interface Group { code: string; name: string; inventoryAccount: string; cogsAccount: string; revenueAccount: string; discountAccount: string | null; salesReturnAccount: string; isDefault: boolean }
interface Method { code: string; name: string; accountCode: string; bankAccountCode: string | null; isReceivable: boolean; isActive: boolean; note: string; sortOrder: number | null; discountRate: number | null; partnerCode: string | null }

const money = (n: number) => n.toLocaleString('vi-VN');
const KIND_TEXT: Record<string, string> = { out: 'xuất', in: 'nhập', receipt: 'thu', payment: 'chi' };
const SRC_ICON: Record<SourceKind, typeof Tag> = { reason: Tag, payReason: Receipt, group: Layers, defaults: BookOpen, tax: FileText, payment: Wallet };
const SRC_HINT: Record<SourceKind, string> = {
  reason: 'Lý do chứng từ: khai tài khoản thì đè lên tài khoản của mặt hàng',
  payReason: 'Lý do mặc định của bút toán thu / trả tiền đi kèm',
  group: 'Nhóm hạch toán gán cho mặt hàng: tài khoản theo hàng',
  defaults: 'Dùng khi các nguồn trên bỏ trống',
  tax: 'Loại thuế của dòng hàng',
  payment: 'Hình thức thanh toán: tài khoản tiền',
};
const DEBIT = '#2563eb';
const CREDIT = '#ea580c';

// ------------------------------------------------------------------------------------------------ nút sơ đồ
type DocData = { flow: Flow };
type SrcData = { src: FlowSource; used: Set<string>; onEdit: (src: FlowSource, f: SourceField) => void };
type EntryData = { entry: FlowEntry };
type LedgerData = { flow: Flow };

function DocNode({ data }: NodeProps<Node<DocData>>) {
  const f = data.flow;
  return (
    <div className="tkht-node tkht-doc">
      <div className="tkht-head"><FileText size={14} /> Chứng từ</div>
      <div className="tkht-doc-body">
        <b>{f.screen.label}</b>
        <span className="tkht-chip">{f.reason.code}</span>
        <span className="muted" title={f.reason.name}>{f.reason.name}</span>
        <div className="tkht-doc-sample" title="Số mẫu để xem dây chuyền chạy ra sao">
          <span>Tiền hàng <b>{money(f.sample.amount)}</b></span>
          {f.sample.taxRate ? <span>Thuế {f.sample.taxRate}% <b>{money(f.sample.tax)}</b></span> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function SourceNode({ data }: NodeProps<Node<SrcData>>) {
  const { src, used, onEdit } = data;
  const Icon = SRC_ICON[src.id];
  return (
    <div className={`tkht-node tkht-src tkht-src-${src.id}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="tkht-head" title={SRC_HINT[src.id]}><Icon size={14} /> {src.label}</div>
      <div className="tkht-src-title" title={src.title}>{src.title}</div>
      {src.fields.map((f) => (
        <button key={f.key} type="button" className={`tkht-field nodrag ${used.has(f.key) ? 'is-used' : ''} ${f.value ? '' : 'is-empty'}`}
          title={`${f.label}: ${f.value ? `${f.value} ${f.name ?? ''}` : 'bỏ trống'} — bấm để sửa`} onClick={() => onEdit(src, f)}>
          <span className="tkht-field-label">{f.label}</span>
          <span className="tkht-acc">{f.value ?? '—'}</span>
          <Handle type="source" position={Position.Right} id={f.key} />
        </button>
      ))}
    </div>
  );
}

function EntryNode({ data }: NodeProps<Node<EntryData>>) {
  const e = data.entry;
  const side = (s: FlowSide, label: 'Nợ' | 'Có', id: 'debit' | 'credit') => (
    <div className={`tkht-side tkht-side-${id} ${s.account ? '' : 'is-missing'}`} title={s.from ? `Lấy từ: ${s.from.label}` : 'Chưa có tài khoản ở mọi nguồn'}>
      <Handle type="target" position={Position.Left} id={id} />
      <span className="tkht-side-tag">{label}</span>
      <span className="tkht-acc">{s.account ?? 'thiếu'}</span>
      <span className="tkht-side-name">{s.accountName ?? (s.account ? '' : 'chưa khai')}</span>
    </div>
  );
  return (
    <div className="tkht-node tkht-entry">
      <div className="tkht-head" title={e.note}><ArrowRightLeft size={14} /> {e.label}<span className="tkht-amt">{money(e.amount)}</span></div>
      {side(e.debit, 'Nợ', 'debit')}
      {side(e.credit, 'Có', 'credit')}
      {e.note && <div className="tkht-note">{e.note}</div>}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function LedgerNode({ data }: NodeProps<Node<LedgerData>>) {
  const f = data.flow;
  const ok = f.totals.balanced;
  return (
    <div className={`tkht-node tkht-ledger ${ok ? 'is-ok' : 'is-bad'}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="tkht-head"><BookOpen size={14} /> Sổ cái</div>
      <div className="tkht-ledger-body">
        <div><span>Tổng Nợ</span><b>{money(f.totals.debit)}</b></div>
        <div><span>Tổng Có</span><b>{money(f.totals.credit)}</b></div>
        <div className="tkht-ledger-state">{ok ? <><CheckCircle2 size={15} /> Nợ = Có</> : <><CircleAlert size={15} /> {f.missing.length ? `${f.missing.length} chỗ cần sửa` : 'Lệch'}</>}</div>
      </div>
    </div>
  );
}

const nodeTypes = { doc: DocNode, src: SourceNode, entry: EntryNode, ledger: LedgerNode };
/** Bề ngang sơ đồ: cột Sổ cái bắt đầu ở x = 1050, rộng 210. */
const GRAPH_W = 1330;

/** Dựng nút, đường của sơ đồ: 4 cột Chứng từ → Nguồn → Bút toán → Sổ cái. */
function buildGraph(flow: Flow, showFallback: boolean, onEdit: SrcData['onEdit']) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const srcH = (s: FlowSource) => 64 + s.fields.length * 30;
  const totalSrc = flow.sources.reduce((a, s) => a + srcH(s) + 22, 0);
  const entryH = (e: FlowEntry) => (e.note ? 118 : 96);
  const totalEntry = flow.entries.reduce((a, e) => a + entryH(e) + 22, 0);
  const H = Math.max(totalSrc, totalEntry, 260);
  nodes.push({ id: 'doc', type: 'doc', position: { x: 0, y: H / 2 - 70 }, data: { flow }, draggable: true });

  const usedBy = new Map<string, Set<string>>();
  for (const e of flow.entries) for (const s of [e.debit, e.credit]) if (s.from) {
    if (!usedBy.has(s.from.source)) usedBy.set(s.from.source, new Set());
    usedBy.get(s.from.source)!.add(s.from.field);
  }
  let y = (H - totalSrc) / 2;
  for (const s of flow.sources) {
    nodes.push({ id: `src-${s.id}`, type: 'src', position: { x: 290, y }, data: { src: s, used: usedBy.get(s.id) ?? new Set(), onEdit } });
    edges.push({ id: `doc-${s.id}`, source: 'doc', sourceHandle: 'out', target: `src-${s.id}`, targetHandle: 'in', type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeDasharray: '5 5' } });
    y += srcH(s) + 22;
  }
  y = (H - totalEntry) / 2;
  for (const e of flow.entries) {
    nodes.push({ id: `entry-${e.key}`, type: 'entry', position: { x: 680, y }, data: { entry: e } });
    edges.push({ id: `led-${e.key}`, source: `entry-${e.key}`, sourceHandle: 'out', target: 'ledger', targetHandle: 'in', type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeDasharray: '5 5' } });
    for (const [sideKey, s] of [['debit', e.debit], ['credit', e.credit]] as const) {
      const usedIdx = s.chain.findIndex((c) => s.from && c.source === s.from.source && c.field === s.from.field);
      s.chain.forEach((c, i) => {
        const used = i === usedIdx;
        const skipped = usedIdx < 0 || i < usedIdx;
        if (!used && !skipped && !showFallback) return;
        if (!flow.sources.some((x) => x.id === c.source)) return;
        const color = sideKey === 'debit' ? DEBIT : CREDIT;
        edges.push({
          id: `${e.key}-${sideKey}-${i}`, source: `src-${c.source}`, sourceHandle: c.field, target: `entry-${e.key}`, targetHandle: sideKey, type: 'smoothstep',
          // Nguồn đang dùng: nét liền đậm; nguồn trống / dự phòng: nét đứt mờ (không chạy) — nhìn là phân biệt được.
          animated: false,
          style: used ? { stroke: color, strokeWidth: 2.4 } : { stroke: '#cbd5e1', strokeDasharray: '4 6', strokeWidth: 1.2 },
          markerEnd: used ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
          label: used ? undefined : skipped ? 'trống' : 'dự phòng',
          labelStyle: { fontSize: 10, fill: '#94a3b8' }, labelBgStyle: { fill: 'transparent' },
        });
      });
    }
    y += entryH(e) + 22;
  }
  nodes.push({ id: 'ledger', type: 'ledger', position: { x: 1050, y: H / 2 - 60 }, data: { flow } });
  return { nodes, edges };
}

// ------------------------------------------------------------------------------------------------ sửa một ô tài khoản
function EditAccount({ src, field, flow, onClose }: { src: FlowSource; field: SourceField; flow: Flow; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(field.value ?? '');
  const required = src.id === 'group' || src.id === 'defaults' || src.id === 'payment';
  const save = useMutation({
    mutationFn: async () => {
      const v = value.trim();
      if (src.id === 'reason' || src.id === 'payReason') {
        const all = await api.get<Reason[]>('/api/v1/posting/reasons');
        const r = all.find((x) => x.code === src.code);
        if (!r) throw new Error(`Không tìm thấy lý do ${src.code}`);
        const body = { name: r.name, kind: r.kind, counterAccount: r.counterAccount ?? '', revenueAccount: r.revenueAccount ?? '', expenseAccount: r.expenseAccount ?? '', cashflowCode: r.cashflowCode ?? '', flags: r.flags ?? {}, isActive: r.isActive, [field.key]: v };
        return api.put(`/api/v1/posting/reasons/${encodeURIComponent(r.code)}`, body);
      }
      if (src.id === 'group') {
        const g = (await api.get<Group[]>('/api/v1/posting/groups')).find((x) => x.code === src.code);
        if (!g) throw new Error(`Không tìm thấy nhóm ${src.code}`);
        return api.put(`/api/v1/posting/groups/${encodeURIComponent(g.code)}`, { name: g.name, inventoryAccount: g.inventoryAccount, cogsAccount: g.cogsAccount, revenueAccount: g.revenueAccount, discountAccount: g.discountAccount ?? '', salesReturnAccount: g.salesReturnAccount, isDefault: g.isDefault, [field.key]: v });
      }
      if (src.id === 'defaults') return api.put('/api/v1/posting/defaults', { [field.key]: v });
      if (src.id === 'tax') return api.patch(`/api/v1/tax-codes/${encodeURIComponent(src.code!)}`, { accountCode: v });
      const m = (await api.get<Method[]>('/api/v1/posting/payment-methods')).find((x) => x.code === src.code);
      if (!m) throw new Error(`Không tìm thấy hình thức ${src.code}`);
      return api.put(`/api/v1/posting/payment-methods/${encodeURIComponent(m.code)}`, { ...m, accountCode: v });
    },
    onSuccess: () => {
      for (const k of ['posting-flow', 'reasons', 'posting-groups', 'posting-defaults', 'tax-codes', 'payment-methods']) void qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });
  const impact = src.id === 'group' ? `${money(flow.impact.groupProducts)} mặt hàng đang dùng nhóm ${src.code} đổi theo.`
    : src.id === 'reason' ? `Lý do ${src.code} dùng ở: ${flow.impact.reasonScreens.join(', ') || 'chưa gán màn nào'}. ${money(flow.impact.reasonEntries)} bút toán đã ghi giữ nguyên; chứng từ định khoản từ nay theo tài khoản mới.`
    : src.id === 'defaults' ? 'Áp cho mọi chứng từ mà lý do, nhóm hạch toán không khai tài khoản này.'
    : 'Áp cho mọi chứng từ dùng mục này.';
  return (
    <Modal title={`${src.label}: ${field.label}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || (required && !value.trim())} onClick={() => save.mutate()}>{save.isPending ? 'Đang lưu…' : 'Lưu và tính lại'}</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <div className="muted full" style={{ marginBottom: 8 }}>{src.title}</div>
      <Field label={field.label} full tip={required ? 'Bắt buộc có tài khoản' : 'Bỏ trống: lấy theo nguồn kế tiếp trong dây chuyền'}>
        <AccountPicker value={value} onChange={(c) => setValue(c ?? '')} postingOnly />
      </Field>
      {!required && value && <div className="full"><button type="button" className="btn btn-sm" style={{ width: 'auto' }} onClick={() => setValue('')} title="Bỏ trống để dây chuyền lấy nguồn kế tiếp">Bỏ trống</button></div>}
      <div className="alert alert-info full" style={{ marginTop: 10 }}>{impact}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ cột trái: màn và lý do
function ScreenList({ screens, sel, onPick, reasons }: { screens: ScreenRow[]; sel: { screen: string; reason?: string }; onPick: (screen: string, reason?: string) => void; reasons: Reason[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ key, list }: { key: string; list: { code: string; isDefault?: boolean }[] }) => api.put(`/api/v1/posting-flow/screens/${key}/reasons`, { reasons: list }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-flow'] }); },
  });
  const areas = [...new Set(screens.map((s) => s.area))];
  return (
    <div className="tkht-screens">
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      {areas.map((a) => (
        <div key={a} className="tkht-area">
          <div className="tkht-area-title">{a}</div>
          {screens.filter((s) => s.area === a).map((s) => {
            const list = s.reasons;
            const fallback = !list.length ? reasons.find((r) => r.flags?.default === s.defaultFlag) : undefined;
            const set = (next: { code: string; isDefault?: boolean }[]) => save.mutate({ key: s.key, list: next });
            const options = reasons.filter((r) => s.kinds.includes(r.kind) && r.isActive && !list.some((x) => x.code === r.code));
            return (
              <div key={s.key} className={`tkht-screen ${sel.screen === s.key ? 'is-active' : ''}`}>
                <button type="button" className="tkht-screen-name" onClick={() => onPick(s.key)} title={s.note}>{s.label}</button>
                <div className="tkht-reasons">
                  {list.map((r) => (
                    <span key={r.code} className={`tkht-reason ${sel.screen === s.key && sel.reason === r.code ? 'is-active' : ''} ${r.missing || !r.isActive ? 'is-off' : ''}`} title={r.name}>
                      <button type="button" onClick={() => onPick(s.key, r.code)}>{r.isDefault && <Star size={11} className="tkht-star" />}{r.code}</button>
                      {!r.isDefault && <button type="button" className="tkht-mini" title="Chọn sẵn lý do này khi lập phiếu" onClick={() => set(list.map((x) => ({ code: x.code, isDefault: x.code === r.code })))}><Star size={11} /></button>}
                      <button type="button" className="tkht-mini" title="Bỏ lý do khỏi màn" onClick={() => set(list.filter((x) => x.code !== r.code).map((x) => ({ code: x.code, isDefault: x.isDefault })))}><X size={11} /></button>
                    </span>
                  ))}
                  {!list.length && fallback && (
                    <span className={`tkht-reason is-auto ${sel.screen === s.key ? 'is-active' : ''}`} title={`Chưa gán lý do: màn đang dùng mọi lý do loại ${s.kinds.map((k) => KIND_TEXT[k] ?? k).join(', ')}, mặc định ${fallback.code}`}>
                      <button type="button" onClick={() => onPick(s.key, fallback.code)}>{fallback.code} · mặc định</button>
                    </span>
                  )}
                  {adding === s.key ? (
                    <div className="tkht-add">
                      <ListPicker items={options.map((r) => ({ code: r.code, name: r.name }))} value="" autoFocus nameFirst
                        onChange={(c) => { if (c) set([...list.map((x) => ({ code: x.code, isDefault: x.isDefault })), { code: c, isDefault: !list.length }]); setAdding(null); }} placeholder="Gõ tìm lý do" />
                      <button type="button" className="btn btn-xs" onClick={() => setAdding(null)}>Huỷ</button>
                    </div>
                  ) : (
                    <button type="button" className="tkht-reason tkht-plus" title={`Thêm lý do loại ${s.kinds.map((k) => KIND_TEXT[k] ?? k).join(', ')} cho màn ${s.label}`} onClick={() => setAdding(s.key)}><Plus size={12} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ thẻ 1: dây chuyền
function DayChuyen() {
  const [sel, setSel] = useState<{ screen: string; reason?: string }>({ screen: 'sale' });
  const [sample, setSample] = useState<{ group?: string; taxCode?: string; method?: string; amount: number; gift: boolean }>({ amount: 1_000_000, gift: false });
  const [showFallback, setShowFallback] = useState(false);
  const [view, setView] = useState<'so-do' | 'bang'>('so-do');
  const [editing, setEditing] = useState<{ src: FlowSource; field: SourceField } | null>(null);
  const screens = useQuery({ queryKey: ['posting-flow', 'screens'], queryFn: () => api.get<ScreenRow[]>('/api/v1/posting-flow/screens') });
  const reasons = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 30_000 }).data ?? [];
  const params = new URLSearchParams({ screen: sel.screen, amount: String(sample.amount), ...(sel.reason ? { reason: sel.reason } : {}), ...(sample.group ? { group: sample.group } : {}),
    ...(sample.taxCode ? { taxCode: sample.taxCode } : {}), ...(sample.method ? { method: sample.method } : {}), ...(sample.gift ? { gift: '1' } : {}) });
  const flow = useQuery({ queryKey: ['posting-flow', 'flow', params.toString()], queryFn: () => api.get<Flow>(`/api/v1/posting-flow/flow?${params}`) });
  // Đổi màn: bỏ chọn thuế / hình thức của màn trước (thuế mua khác thuế bán).
  useEffect(() => { setSample((x) => ({ ...x, taxCode: undefined, method: undefined, gift: false })); }, [sel.screen]);
  const graph = useMemo(() => (flow.data ? buildGraph(flow.data, showFallback, (src, field) => setEditing({ src, field })) : null), [flow.data, showFallback]);
  const f = flow.data;

  return (
    <div className="tkht-layout">
      <aside className="tkht-left">
        <div className="tkht-left-title" title="Mỗi màn chỉ dùng các lý do gán ở đây; màn nhập liệu chỉ hiện các lý do này">Màn nghiệp vụ và lý do</div>
        {screens.isLoading ? <Loading /> : <ScreenList screens={screens.data ?? []} sel={sel} onPick={(screen, reason) => setSel({ screen, reason })} reasons={reasons} />}
      </aside>
      <section className="tkht-main">
        <ErrorBox error={flow.error ? errorText(flow.error) : screens.error ? errorText(screens.error) : null} />
        {f && (
          <div className="tkht-toolbar">
            <div className="tkht-title"><b>{f.screen.label}</b> · <span className="tkht-chip">{f.reason.code}</span> {f.reason.name}</div>
            <label title="Nhóm hạch toán của mặt hàng mẫu">Nhóm hạch toán
              <select className="select input" value={f.sample.groupCode} onChange={(e) => setSample((x) => ({ ...x, group: e.target.value }))}>
                {f.options.groups.map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
              </select>
            </label>
            {f.options.taxes.length > 0 && f.sources.some((s) => s.id === 'tax') && (
              <label title="Loại thuế của dòng hàng mẫu">Loại thuế
                <select className="select input" value={f.sample.taxCode ?? ''} onChange={(e) => setSample((x) => ({ ...x, taxCode: e.target.value }))}>
                  {f.options.taxes.map((t) => <option key={t.code} value={t.code}>{t.code} ({t.rate}%)</option>)}
                </select>
              </label>
            )}
            {f.sources.some((s) => s.id === 'payment') && (
              <label title="Hình thức thanh toán của bút toán tiền">Hình thức
                <select className="select input" value={f.sample.methodCode ?? ''} onChange={(e) => setSample((x) => ({ ...x, method: e.target.value }))}>
                  {f.options.methods.filter((m) => !m.isReceivable).map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
                </select>
              </label>
            )}
            <label title="Số tiền hàng mẫu (trước thuế)">Tiền hàng
              <input className="input num" style={{ width: 110 }} value={money(sample.amount)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n > 0) setSample((x) => ({ ...x, amount: n })); }} />
            </label>
            {(f.screen.key === 'sale' || f.screen.key === 'sale_return') && (
              <label className="checkbox" title="Dòng hàng tặng: giá vốn có thể vào chi phí khuyến mãi theo cờ của lý do"><input type="checkbox" checked={sample.gift} onChange={(e) => setSample((x) => ({ ...x, gift: e.target.checked }))} /> Hàng tặng</label>
            )}
            <span className="spacer" />
            <label className="checkbox" title="Hiện cả nguồn dự phòng (bỏ trống nguồn đang dùng thì lấy ở đây)"><input type="checkbox" checked={showFallback} onChange={(e) => setShowFallback(e.target.checked)} /> Đường dự phòng</label>
            <div className="tabs tkht-view">
              <button type="button" className={`tab ${view === 'so-do' ? 'active' : ''}`} onClick={() => setView('so-do')}>Sơ đồ</button>
              <button type="button" className={`tab ${view === 'bang' ? 'active' : ''}`} onClick={() => setView('bang')}>Bút toán</button>
            </div>
          </div>
        )}
        {flow.isLoading && <Loading />}
        {f && graph && view === 'so-do' && (
          <div className="tkht-canvas">
            <ReactFlow key={`${f.screen.key}-${f.reason.code}`} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} minZoom={0.3} maxZoom={1.6}
              // Vừa khít bề ngang, bắt đầu từ mép trên trái: chữ đủ to để đọc, cuộn xuống xem phần dưới.
              onInit={(inst) => { const w = (document.querySelector('.tkht-canvas') as HTMLElement | null)?.clientWidth ?? 1200; inst.setViewport({ x: 12, y: 12, zoom: Math.min(1, Math.max(0.55, (w - 24) / GRAPH_W)) }); }}
              proOptions={{ hideAttribution: true }} nodesConnectable={false} elementsSelectable={false}>
              <Background gap={18} size={1} color="#dbe3ee" />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="tkht-legend">
              <span><i style={{ background: DEBIT }} /> lấy cho bên Nợ</span>
              <span><i style={{ background: CREDIT }} /> lấy cho bên Có</span>
              <span><i className="dash" /> nguồn trống / dự phòng</span>
              <span className="muted">Bấm ô tài khoản để sửa</span>
            </div>
          </div>
        )}
        {f && view === 'bang' && (
          <div className="table-wrap"><table className="grid">
            <thead><tr><th title="Phần của bút toán">Diễn giải</th><th title="Tài khoản ghi Nợ">Nợ</th><th title="Lấy tài khoản Nợ ở đâu">Nợ lấy từ</th><th title="Tài khoản ghi Có">Có</th><th title="Lấy tài khoản Có ở đâu">Có lấy từ</th><th className="num" title="Số tiền mẫu">Số tiền</th></tr></thead>
            <tbody>{f.entries.map((e) => (
              <tr key={e.key}><td title={e.note}>{e.label}</td>
                <td className={e.debit.account ? 'mono' : 'neg'}>{e.debit.account ?? 'thiếu'} <span className="muted">{e.debit.accountName}</span></td><td className="muted">{e.debit.from?.label ?? '—'}</td>
                <td className={e.credit.account ? 'mono' : 'neg'}>{e.credit.account ?? 'thiếu'} <span className="muted">{e.credit.accountName}</span></td><td className="muted">{e.credit.from?.label ?? '—'}</td>
                <td className="num">{money(e.amount)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={5}><b>Tổng Nợ {money(f.totals.debit)} · Tổng Có {money(f.totals.credit)}</b></td><td className="num">{f.totals.balanced ? '✓ cân' : '✗ lệch'}</td></tr></tfoot>
          </table></div>
        )}
        {f && f.missing.length > 0 && (
          <div className="alert alert-warn" style={{ marginTop: 8 }}>
            <b>Cần sửa để định khoản được:</b>
            <ul style={{ margin: '4px 0 0 18px' }}>{f.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
      </section>
      {editing && f && <EditAccount src={editing.src} field={editing.field} flow={f} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ thẻ 2: đổi nhóm hạch toán hàng loạt
interface BulkResult { target: string; targetName: string; matched: number; toChange: number; changed: number; byCurrent: { code: string | null; count: number }[]; sample: { sku: string; name: string; current: string | null }[] }

function DoiNhomHangLoat() {
  const qc = useQueryClient();
  const nhom = useNhomHang();
  const groups = useQuery({ queryKey: ['posting-groups'], queryFn: () => api.get<Group[]>('/api/v1/posting/groups') }).data ?? [];
  const [classCode, setClassCode] = useState('');
  const [fromGroup, setFromGroup] = useState<string>('*');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const body = (dryRun: boolean) => ({ targetGroup: target, ...(classCode ? { classCode } : {}), ...(fromGroup !== '*' ? { fromGroup } : {}), ...(search.trim() ? { search: search.trim() } : {}), dryRun });
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<BulkResult>('/api/v1/posting-flow/products/posting-group', body(dryRun)),
    onSuccess: (r, dryRun) => { setPreview(r); if (!dryRun) { void qc.invalidateQueries({ queryKey: ['products'] }); void qc.invalidateQueries({ queryKey: ['posting-flow'] }); } },
  });
  useEffect(() => { setPreview(null); }, [classCode, fromGroup, search, target]);
  const canFilter = Boolean(classCode || fromGroup !== '*' || search.trim());
  const gName = (c: string | null) => (c ? `${c} — ${groups.find((g) => g.code === c)?.name ?? ''}` : 'Chưa gán (dùng nhóm mặc định)');
  return (
    <div className="tkht-bulk">
      <aside className="tkht-left">
        <div className="tkht-left-title" title="Chọn một nhóm hàng: gồm cả các nhóm con">Nhóm hàng</div>
        <button type="button" className={`btn btn-sm ${classCode ? '' : 'btn-primary'}`} style={{ marginBottom: 6 }} onClick={() => setClassCode('')}>Mọi nhóm hàng</button>
        <CayNhomHang list={nhom.data} selected={classCode} onSelect={(c) => setClassCode(c ?? '')} height={520} hideInactive />
      </aside>
      <section className="tkht-main">
        <div className="tkht-bulk-form">
          <Field label="Nhóm hạch toán hiện tại" tip="Chỉ đổi các mặt hàng đang thuộc nhóm này">
            <select className="select input" value={fromGroup} onChange={(e) => setFromGroup(e.target.value)}>
              <option value="*">Mọi nhóm</option><option value="">Chưa gán</option>
              {groups.map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
            </select>
          </Field>
          <Field label="Mã / tên chứa" tip="Lọc thêm theo một phần mã hoặc tên hàng"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="vd: sữa bột" /></Field>
          <Field label="Đổi sang nhóm (*)" tip="Nhóm hạch toán mới: định khoản từ nay theo tài khoản của nhóm này; bút toán đã ghi không đổi">
            <select className="select input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— chọn nhóm —</option>
              {groups.map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
            </select>
          </Field>
          <div className="tkht-bulk-actions">
            <button className="btn" disabled={!target || !canFilter || run.isPending} onClick={() => run.mutate(true)} title={canFilter ? 'Đếm mặt hàng sẽ đổi, chưa ghi gì' : 'Chọn nhóm hàng, nhóm hạch toán hiện tại hoặc gõ mã / tên'}>Xem trước</button>
            <button className="btn btn-primary" disabled={!preview || preview.changed > 0 || !preview.toChange || run.isPending}
              onClick={() => { if (window.confirm(`Đổi ${preview!.toChange} mặt hàng sang nhóm ${preview!.target}?`)) run.mutate(false); }}>
              {preview && !preview.changed ? `Đổi ${money(preview.toChange)} mặt hàng` : 'Đổi'}
            </button>
          </div>
        </div>
        <ErrorBox error={run.error ? errorText(run.error) : null} />
        {preview && (
          <>
            <div className={`alert ${preview.changed ? 'alert-ok' : 'alert-info'}`}>
              {preview.changed ? <>Đã đổi <b>{money(preview.changed)}</b> mặt hàng sang <b>{gName(preview.target)}</b>.</>
                : <>Khớp <b>{money(preview.matched)}</b> mặt hàng, sẽ đổi <b>{money(preview.toChange)}</b> sang <b>{gName(preview.target)}</b>.</>}
            </div>
            <div className="tkht-bulk-grid">
              <div className="table-wrap"><table className="grid">
                <thead><tr><th title="Nhóm hạch toán các mặt hàng đang dùng">Đang thuộc nhóm</th><th className="num" title="Số mặt hàng">Số mặt hàng</th></tr></thead>
                <tbody>{preview.byCurrent.map((x) => <tr key={x.code ?? '-'}><td>{gName(x.code)}</td><td className="num">{money(x.count)}</td></tr>)}</tbody>
              </table></div>
              <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}><table className="grid">
                <thead><tr><th title="Mã hàng">Mã</th><th title="Tên hàng">Tên</th><th title="Nhóm hạch toán hiện tại">Nhóm hiện tại</th></tr></thead>
                <tbody>{preview.sample.map((x) => <tr key={x.sku}><td className="mono">{x.sku}</td><td>{x.name}</td><td>{x.current ?? 'chưa gán'}</td></tr>)}</tbody>
              </table>{preview.matched > preview.sample.length && <div className="muted" style={{ padding: 6 }}>Hiện {preview.sample.length} / {money(preview.matched)} mặt hàng đầu tiên</div>}</div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function ThietKeHachToanPage() {
  const [tab, setTab] = useState<'day-chuyen' | 'hang-loat'>('day-chuyen');
  return (
    <div className="page tkht-page">
      <PageHeader title="Thiết kế hạch toán" code="ACC92" helpKey="thiet-ke-hach-toan"
        subtitle="Mỗi màn chọn vài lý do; bấm lý do để xem và sửa cả dây chuyền định khoản" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'day-chuyen' ? 'active' : ''}`} onClick={() => setTab('day-chuyen')}>Dây chuyền định khoản</button>
        <button role="tab" className={`tab ${tab === 'hang-loat' ? 'active' : ''}`} onClick={() => setTab('hang-loat')} title="Đổi nhóm hạch toán cho cả nhóm hàng một lần">Đổi nhóm hạch toán hàng loạt</button>
      </div>
      <div className="tkht-links" title="ACC92 đọc và sửa chính các bảng này; mở bảng khi cần sửa nhiều dòng một lúc">
        Bảng chi tiết:
        <Link to="/cau-hinh/ly-do" title="Sửa nhiều lý do một lúc (ACC18)">Lý do</Link>
        <Link to="/cau-hinh/nhom-hach-toan" title="Nhóm hạch toán và tài khoản theo từng mặt hàng (ACC17)">Nhóm hạch toán, mặt hàng</Link>
        <Link to="/cau-hinh/tai-khoan-ngam-dinh" title="Tài khoản dùng khi lý do, nhóm hạch toán bỏ trống (ACC41)">Tài khoản ngầm định</Link>
        <Link to="/danh-muc/loai-thue" title="Loại thuế và tài khoản thuế (ACC43)">Loại thuế</Link>
        <Link to="/cau-hinh/hinh-thuc-thanh-toan" title="Hình thức thanh toán và tài khoản tiền (DM05)">Hình thức thanh toán</Link>
      </div>
      {tab === 'day-chuyen' ? <DayChuyen /> : <DoiNhomHangLoat />}
    </div>
  );
}
