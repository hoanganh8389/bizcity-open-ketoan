// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền định khoản, đổi nhóm hạch toán hàng loạt (đóng góp)
// [2026-11-10 04:00 PM Nguyễn Văn Thủy] PHASE-026 — làm lại theo bảng quy tắc định khoản: nghiệp vụ → điều kiện → quy tắc → bút toán; đề xuất / duyệt; bỏ nhóm hạch toán, lý do khỏi màn (đóng góp)
/**
 * THIẾT KẾ HẠCH TOÁN (ACC92) — bảng quy tắc định khoản (docs/nghiep-vu/15-quy-tac-dinh-khoan.md).
 *
 *  Thẻ "Sơ đồ định khoản":
 *    Trái : nghiệp vụ (Bán hàng, Khách trả hàng, Nhập mua, Chuyển kho…) và nghiệp vụ kế toán tự tạo; số quy tắc đang áp / chờ duyệt.
 *    Phải : một phiếu mẫu của nghiệp vụ chạy qua CHÍNH bộ định khoản:
 *             Chứng từ → Điều kiện của phiếu → Quy tắc khớp (quy tắc thắng nét liền) → Bút toán → Sổ cái
 *           Khoản không có quy tắc nào khớp đi theo "Tài khoản tự tra" (tài khoản ngầm định). Đổi điều kiện mẫu ở thanh trên
 *           (loại hàng, thuế, hình thức, chương trình, hàng tặng…) để xem quy tắc nào bắt.
 *           Bấm một bút toán → thêm quy tắc cho khoản đó; bấm một quy tắc → xem / đề xuất sửa.
 *  Thẻ "Quy tắc": danh sách, lọc theo nghiệp vụ / trạng thái; đề xuất, duyệt, từ chối, ngừng áp.
 *  Thẻ "Lịch sử thay đổi".
 *
 * Mọi thay đổi là ĐỀ XUẤT; người có quyền cấu hình (kế toán trưởng, chủ đơn vị) duyệt thì mới áp, từ ngày hiệu lực.
 * Chứng từ trước ngày đó giữ bút toán cũ.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRightLeft, BookOpen, Check, CheckCircle2, CircleAlert, Cog, FileText, Filter, PauseCircle, Pencil, Plus, Scale, Sparkles, Trash2, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker } from '@/components/pickers';
import './thiet-ke-hach-toan.css';

// ------------------------------------------------------------------------------------------------ kiểu dữ liệu
type Part = 'goods' | 'tax' | 'cogs' | 'payment';
type CondKey = 'method' | 'taxCode' | 'itemType' | 'programKind' | 'program' | 'gift' | 'leg' | 'sameUnit';
type Cond = Partial<{ method: string; taxCode: string; itemType: string; programKind: string; program: string; gift: boolean; leg: 'in' | 'out'; sameUnit: boolean }>;
interface BizPart { part: Part; label: string; conds: CondKey[] }
interface Business { code: string; name: string; area: string; baseCode: string | null; reasonCode: string | null; reasonName: string | null; isSystem: boolean; isActive: boolean; note: string; parts: BizPart[]; activeRules: number; draftRules: number }
type RuleState = 'draft' | 'active' | 'scheduled' | 'closed' | 'rejected';
interface Rule {
  id: string; business: string; part: Part; partLabel: string; book: 'all' | 'internal' | 'tax'; cond: Cond; condText: string; debit: string | null; debitName: string | null;
  credit: string | null; creditName: string | null; priority: number; from: string; to: string | null; status: string; state: RuleState; replacesId: string | null;
  note: string; changeReason: string; createdBy: string; createdAt: string; approvedBy: string | null; approvedAt: string | null; rejectedNote: string | null;
}
interface Options {
  businesses: { code: string; name: string; area: string; parts: BizPart[] }[];
  condLabels: Record<CondKey, string>; partLabels: Record<Part, string>;
  methods: { code: string; name: string; account: string; isReceivable: boolean }[];
  taxes: { code: string; name: string; rate: number; direction: string }[];
  itemTypes: { code: string; name: string }[];
  programKinds: { code: string; name: string; side: string; note: string }[];
  programs: { code: string; name: string; kind: string | null; side: string }[];
}
interface SimSide { auto: string; account: string; name: string | null; autoName: string | null }
interface SimEntry { key: string; group: string; part: Part; partLabel: string; label: string; amount: number; debit: SimSide; credit: SimSide; ruleId: string | null; candidates: string[]; ties: string[]; note?: string }
interface Sim {
  business: { code: string; name: string; base: string; reasonCode: string | null };
  sample: { sku: string; name: string; itemType: string | null; taxCode: string; taxRate: number; method: string | null; gift: boolean; program: string | null; amount: number; tax: number; cost: number; sameUnit: boolean; date: string; branchCode: string };
  context: Record<string, unknown>;
  entries: SimEntry[]; rules: Rule[]; totals: { debit: number; credit: number; balanced: boolean }; errors: string[];
}
interface Sample { itemType?: string; taxCode?: string; method?: string; program?: string; gift: boolean; sameUnit: boolean; amount: number; date?: string }

const money = (n: number) => n.toLocaleString('vi-VN');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const viDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
const STATE_TEXT: Record<RuleState, string> = { draft: 'Chờ duyệt', active: 'Đang áp', scheduled: 'Sắp áp', closed: 'Đã đóng', rejected: 'Từ chối' };
const STATE_TIP: Record<RuleState, string> = {
  draft: 'Đề xuất chưa duyệt: chưa áp vào chứng từ nào',
  active: 'Đã duyệt, đang áp cho chứng từ từ ngày hiệu lực',
  scheduled: 'Đã duyệt, áp từ ngày hiệu lực (chưa tới)',
  closed: 'Đã đóng (bị thay hoặc ngừng): chứng từ trong khoảng hiệu lực cũ vẫn theo quy tắc này',
  rejected: 'Bị từ chối — xem lý do, sửa rồi đề xuất lại',
};
const COLOR = { win: '#16a34a', lose: '#cbd5e1', auto: '#64748b', debit: '#2563eb', credit: '#ea580c' };

/** Phía chương trình của nghiệp vụ: bán hàng chỉ chọn chương trình bán (BH12), mua hàng chỉ chọn chính sách NCC. */
function sideOf(biz: Business | undefined): 'sale' | 'purchase' | null {
  const base = biz?.baseCode ?? biz?.code;
  if (base === 'sale' || base === 'sale_return') return 'sale';
  if (base === 'purchase' || base === 'purchase_return') return 'purchase';
  return null;
}
const forSide = <T extends { side: string }>(list: T[] | undefined, side: 'sale' | 'purchase' | null) => (list ?? []).filter((x) => !side || x.side === side || x.side === 'both');

function useOptions() {
  return useQuery({ queryKey: ['posting-rules', 'options'], queryFn: () => api.get<Options>('/api/v1/posting-rules/options'), staleTime: 60_000 });
}

/** Chữ hiện cho một giá trị điều kiện. */
function condValueText(k: CondKey, v: unknown, o?: Options): string {
  if (v === undefined || v === null || v === '') return '—';
  if (k === 'gift') return v ? 'Hàng tặng' : 'Hàng bán';
  if (k === 'sameUnit') return v ? 'Cùng đơn vị hạch toán' : 'Khác đơn vị hạch toán';
  if (k === 'leg') return v === 'out' ? 'Bên xuất' : 'Bên nhận';
  const s = String(v);
  const name = k === 'method' ? o?.methods.find((m) => m.code === s)?.name : k === 'itemType' ? o?.itemTypes.find((t) => t.code === s)?.name
    : k === 'programKind' ? o?.programKinds.find((t) => t.code === s)?.name : k === 'program' ? o?.programs.find((p) => p.code === s)?.name
    : k === 'taxCode' ? o?.taxes.find((t) => t.code === s)?.name : undefined;
  return name ? `${s} — ${name}` : s;
}

// ------------------------------------------------------------------------------------------------ nút sơ đồ
type DocData = { sim: Sim };
type CondData = { sim: Sim; options?: Options; conds: CondKey[] };
type RuleData = { rule: Rule | null; won: number; lost: number; onOpen: (r: Rule) => void };
type EntryData = { entry: SimEntry; onAdd: (e: SimEntry) => void };
type LedgerData = { sim: Sim };

function DocNode({ data }: NodeProps<Node<DocData>>) {
  const s = data.sim;
  return (
    <div className="tkht-node tkht-doc">
      <div className="tkht-head"><FileText size={14} /> Chứng từ mẫu</div>
      <div className="tkht-doc-body">
        <b>{s.business.name}</b>
        {s.business.reasonCode && <span className="tkht-chip" title="Lý do chứng từ dẫn vào nghiệp vụ tự tạo">{s.business.reasonCode}</span>}
        <span className="muted" title={`${s.sample.sku} — ${s.sample.name}`}>{s.sample.name}</span>
        <div className="tkht-doc-sample" title="Số mẫu để xem bút toán chạy ra sao">
          <span>Tiền hàng <b>{money(s.sample.amount)}</b></span>
          {s.sample.taxRate ? <span>Thuế {s.sample.taxRate}% <b>{money(s.sample.tax)}</b></span> : null}
          <span>Ngày {viDate(s.sample.date)} · {s.sample.branchCode}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function CondNode({ data }: NodeProps<Node<CondData>>) {
  const { sim, options, conds } = data;
  return (
    <div className="tkht-node tkht-cond">
      <Handle type="target" position={Position.Left} id="in" />
      <div className="tkht-head" title="Giá trị điều kiện của phiếu mẫu — quy tắc khớp mọi ô điều kiện đã điền thì được xét"><Filter size={14} /> Điều kiện của phiếu</div>
      {conds.map((k) => (
        <div key={k} className="tkht-cond-row">
          <span className="tkht-field-label">{options?.condLabels[k] ?? k}</span>
          <span className="tkht-cond-val" title={condValueText(k, sim.context[k], options)}>{condValueText(k, sim.context[k], options)}</span>
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function RuleNode({ data }: NodeProps<Node<RuleData>>) {
  const { rule, won, lost, onOpen } = data;
  if (!rule) {
    return (
      <div className="tkht-node tkht-rule tkht-rule-auto" title="Khoản không có quy tắc nào khớp (hoặc quy tắc bỏ trống một bên) dùng tài khoản bộ định khoản tự tra: tài khoản ngầm định, loại thuế, hình thức thanh toán">
        <Handle type="target" position={Position.Left} id="in" />
        <div className="tkht-head"><Cog size={14} /> Tài khoản tự tra</div>
        <div className="tkht-rule-body"><span className="muted">Ngầm định · loại thuế · hình thức thanh toán</span></div>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    );
  }
  return (
    <button type="button" className={`tkht-node tkht-rule nodrag is-${rule.state} ${won ? 'is-won' : 'is-lost'}`} onClick={() => onOpen(rule)}
      title={`${rule.condText}\n${won ? `Thắng ở ${won} khoản` : 'Khớp nhưng có quy tắc cụ thể hơn thắng'}${lost && won ? `, thua ở ${lost} khoản` : ''} — bấm để xem / đề xuất sửa`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="tkht-head"><Scale size={14} /> {rule.id === 'thu' ? 'Đang thử' : `Quy tắc #${rule.id}`} · {rule.partLabel}
        <span className={`tkht-badge is-${rule.state}`}>{STATE_TEXT[rule.state]}</span>
      </div>
      <div className="tkht-rule-body">
        <div className="tkht-rule-cond">{rule.condText}</div>
        <div className="tkht-rule-acc"><span className="tkht-side-tag">Nợ</span><span className="tkht-acc">{rule.debit ?? 'tự tra'}</span><span className="tkht-side-tag">Có</span><span className="tkht-acc">{rule.credit ?? 'tự tra'}</span></div>
        {rule.note && <div className="tkht-note-inline">{rule.note}</div>}
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </button>
  );
}

function EntryNode({ data }: NodeProps<Node<EntryData>>) {
  const e = data.entry;
  const side = (s: SimSide, label: 'Nợ' | 'Có', id: 'debit' | 'credit') => {
    const changed = s.account !== s.auto;
    return (
      <div className={`tkht-side tkht-side-${id}`} title={changed ? `Theo quy tắc #${e.ruleId}: ${s.account} (tự tra là ${s.auto})` : `Tài khoản tự tra: ${s.account}`}>
        <Handle type="target" position={Position.Left} id={id} />
        <span className="tkht-side-tag">{label}</span>
        <span className={`tkht-acc ${changed ? 'is-ruled' : ''}`}>{s.account || 'thiếu'}</span>
        {changed && <span className="tkht-before">{s.auto}</span>}
        <span className="tkht-side-name">{s.name ?? ''}</span>
      </div>
    );
  };
  return (
    <button type="button" className="tkht-node tkht-entry nodrag" onClick={() => data.onAdd(e)} title="Bấm để thêm quy tắc cho khoản này">
      <div className="tkht-head"><ArrowRightLeft size={14} /> {e.partLabel}<span className="muted tkht-entry-group">{e.group}</span><span className="tkht-amt">{money(e.amount)}</span></div>
      {side(e.debit, 'Nợ', 'debit')}
      {side(e.credit, 'Có', 'credit')}
      {(e.note || e.ties.length > 0) && <div className="tkht-note">{e.ties.length ? <span className="neg">Quy tắc #{e.ruleId} và #{e.ties.join(', #')} ngang nhau — sửa ưu tiên</span> : e.note}</div>}
      <Handle type="source" position={Position.Right} id="out" />
    </button>
  );
}

function LedgerNode({ data }: NodeProps<Node<LedgerData>>) {
  const s = data.sim;
  const ok = s.totals.balanced && !s.errors.length;
  return (
    <div className={`tkht-node tkht-ledger ${ok ? 'is-ok' : 'is-bad'}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="tkht-head"><BookOpen size={14} /> Sổ cái</div>
      <div className="tkht-ledger-body">
        <div><span>Tổng Nợ</span><b>{money(s.totals.debit)}</b></div>
        <div><span>Tổng Có</span><b>{money(s.totals.credit)}</b></div>
        <div className="tkht-ledger-state">{ok ? <><CheckCircle2 size={15} /> Nợ = Có</> : <><CircleAlert size={15} /> {s.errors.length} chỗ cần sửa</>}</div>
      </div>
    </div>
  );
}

const nodeTypes = { doc: DocNode, cond: CondNode, rule: RuleNode, entry: EntryNode, ledger: LedgerNode };

function buildGraph(sim: Sim, options: Options | undefined, conds: CondKey[], onOpen: RuleData['onOpen'], onAdd: EntryData['onAdd']) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const entryH = (e: SimEntry) => (e.note || e.ties.length ? 116 : 96);
  const totalEntry = sim.entries.reduce((a, e) => a + entryH(e) + 18, 0);
  const ruleIds = [...new Set(sim.entries.flatMap((e) => e.candidates))];
  const rules = ruleIds.map((id) => sim.rules.find((r) => r.id === id)).filter((r): r is Rule => Boolean(r));
  const needAuto = sim.entries.some((e) => !e.ruleId || e.debit.account === e.debit.auto || e.credit.account === e.credit.auto);
  const ruleH = 96;
  const totalRule = (rules.length + (needAuto ? 1 : 0)) * (ruleH + 18);
  const condH = 50 + conds.length * 26;
  const H = Math.max(totalEntry, totalRule, condH, 280);

  nodes.push({ id: 'doc', type: 'doc', position: { x: 0, y: H / 2 - 80 }, data: { sim } });
  nodes.push({ id: 'cond', type: 'cond', position: { x: 270, y: H / 2 - condH / 2 }, data: { sim, options, conds } });
  edges.push({ id: 'doc-cond', source: 'doc', sourceHandle: 'out', target: 'cond', targetHandle: 'in', type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeDasharray: '5 5' } });

  let y = (H - totalRule) / 2;
  for (const r of rules) {
    const won = sim.entries.filter((e) => e.ruleId === r.id).length;
    const lost = sim.entries.filter((e) => e.candidates.includes(r.id) && e.ruleId !== r.id).length;
    nodes.push({ id: `rule-${r.id}`, type: 'rule', position: { x: 560, y }, data: { rule: r, won, lost, onOpen } });
    edges.push({ id: `cond-${r.id}`, source: 'cond', sourceHandle: 'out', target: `rule-${r.id}`, targetHandle: 'in', type: 'smoothstep', style: { stroke: won ? COLOR.win : COLOR.lose, strokeDasharray: won ? undefined : '4 6' } });
    y += ruleH + 18;
  }
  if (needAuto) {
    nodes.push({ id: 'rule-auto', type: 'rule', position: { x: 560, y }, data: { rule: null, won: 0, lost: 0, onOpen } });
    edges.push({ id: 'cond-auto', source: 'cond', sourceHandle: 'out', target: 'rule-auto', targetHandle: 'in', type: 'smoothstep', style: { stroke: COLOR.auto, strokeDasharray: '5 5' } });
  }

  y = (H - totalEntry) / 2;
  for (const e of sim.entries) {
    nodes.push({ id: `entry-${e.key}`, type: 'entry', position: { x: 900, y }, data: { entry: e, onAdd } });
    edges.push({ id: `led-${e.key}`, source: `entry-${e.key}`, sourceHandle: 'out', target: 'ledger', targetHandle: 'in', type: 'smoothstep', animated: true, style: { stroke: '#94a3b8', strokeDasharray: '5 5' } });
    for (const sideKey of ['debit', 'credit'] as const) {
      const s = e[sideKey];
      const byRule = e.ruleId && s.account !== s.auto;
      const color = sideKey === 'debit' ? COLOR.debit : COLOR.credit;
      edges.push({
        id: `${e.key}-${sideKey}`, source: byRule ? `rule-${e.ruleId}` : 'rule-auto', sourceHandle: 'out', target: `entry-${e.key}`, targetHandle: sideKey, type: 'smoothstep',
        style: byRule ? { stroke: color, strokeWidth: 2.4 } : { stroke: color, strokeWidth: 1.2, strokeDasharray: '5 5', opacity: 0.6 },
        markerEnd: byRule ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
      });
    }
    // Quy tắc khớp nhưng thua (ít cụ thể hơn): nét đứt mờ.
    for (const id of e.candidates.filter((c) => c !== e.ruleId)) {
      edges.push({ id: `${e.key}-lost-${id}`, source: `rule-${id}`, sourceHandle: 'out', target: `entry-${e.key}`, targetHandle: 'debit', type: 'smoothstep', label: 'ít cụ thể hơn',
        labelStyle: { fontSize: 10, fill: '#94a3b8' }, labelBgStyle: { fill: 'transparent' }, style: { stroke: COLOR.lose, strokeDasharray: '3 6', strokeWidth: 1 } });
    }
    y += entryH(e) + 18;
  }
  nodes.push({ id: 'ledger', type: 'ledger', position: { x: 1260, y: H / 2 - 60 }, data: { sim } });
  return { nodes, edges };
}

// ------------------------------------------------------------------------------------------------ hộp khai quy tắc
interface RuleDraft { business: string; part: Part; cond: Cond; debit: string; credit: string; priority: number; from: string; book: 'all' | 'internal' | 'tax'; note: string; changeReason: string }
type EditorMode = { kind: 'new'; draft: RuleDraft } | { kind: 'draft'; rule: Rule } | { kind: 'replace'; rule: Rule } | { kind: 'view'; rule: Rule };

function RuleEditor({ mode, businesses, onClose, onReplace }: { mode: EditorMode; businesses: Business[]; onClose: () => void; onReplace?: (r: Rule) => void }) {
  const qc = useQueryClient();
  const options = useOptions().data;
  const init: RuleDraft = mode.kind === 'new' ? mode.draft : {
    business: mode.rule.business, part: mode.rule.part, cond: mode.rule.cond, debit: mode.rule.debit ?? '', credit: mode.rule.credit ?? '', priority: mode.rule.priority,
    from: mode.kind === 'replace' ? addDays(today(), 1) : mode.rule.from, book: mode.rule.book, note: mode.rule.note, changeReason: mode.kind === 'replace' ? '' : mode.rule.changeReason,
  };
  const [d, setD] = useState<RuleDraft>(init);
  const [editing, setEditing] = useState(mode.kind !== 'view');
  const readOnly = !editing;
  const biz = businesses.find((b) => b.code === d.business);
  const part = biz?.parts.find((p) => p.part === d.part);
  const conds = part?.conds ?? [];
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setCond = (k: CondKey, v: unknown) => setD((x) => {
    const c = { ...x.cond } as Record<string, unknown>;
    if (v === undefined || v === '' || v === null) delete c[k]; else c[k] = v;
    return { ...x, cond: c as Cond };
  });
  // Đổi nghiệp vụ / khoản: bỏ điều kiện không dùng được.
  useEffect(() => {
    if (!biz) return;
    if (!biz.parts.some((p) => p.part === d.part)) setD((x) => ({ ...x, part: biz.parts[0]?.part ?? 'goods', cond: {} }));
  }, [biz, d.part]);
  useEffect(() => { setD((x) => ({ ...x, cond: Object.fromEntries(Object.entries(x.cond).filter(([k]) => conds.includes(k as CondKey))) as Cond })); }, [conds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = { business: d.business, part: d.part, cond: d.cond, debit: d.debit || null, credit: d.credit || null, priority: d.priority, from: d.from, book: d.book, note: d.note, changeReason: d.changeReason };
  const [preview, setPreview] = useState<Sim | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  useEffect(() => {
    if (!d.business || (!d.debit && !d.credit)) { setPreview(null); return; }
    const t = setTimeout(() => {
      const sample: Record<string, unknown> = { business: d.business, gift: Boolean(d.cond.gift) };
      if (d.cond.itemType) sample.itemType = d.cond.itemType;
      if (d.cond.taxCode) sample.taxCode = d.cond.taxCode;
      if (d.cond.method) sample.method = d.cond.method;
      if (d.cond.program) sample.program = d.cond.program;
      if (d.cond.sameUnit !== undefined) sample.sameUnit = d.cond.sameUnit;
      if (mode.kind === 'view' || (mode.kind === 'draft' && !editing)) sample.draftId = mode.rule.id; else sample.draft = { ...body, from: today() };
      api.post<Sim>('/api/v1/posting-rules/simulate', sample).then((r) => { setPreview(r); setPreviewErr(null); }).catch((e) => { setPreview(null); setPreviewErr(errorText(e)); });
    }, 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(body), editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => mode.kind === 'draft' ? api.put(`/api/v1/posting-rules/${mode.rule.id}`, body)
      : api.post('/api/v1/posting-rules', { ...body, ...(mode.kind === 'replace' ? { replacesId: mode.rule.id } : {}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); },
  });
  const act = useMutation({
    mutationFn: async (a: 'approve' | 'reject' | 'delete') => {
      if (mode.kind === 'new') return;
      const id = mode.rule.id;
      if (a === 'approve') return api.post(`/api/v1/posting-rules/${id}/approve`, {});
      if (a === 'delete') return api.delete(`/api/v1/posting-rules/${id}`);
      const note = window.prompt('Lý do từ chối (người đề xuất sẽ thấy):');
      if (!note?.trim()) throw new Error('Chưa ghi lý do từ chối');
      return api.post(`/api/v1/posting-rules/${id}/reject`, { note });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); },
  });
  const rule = mode.kind === 'new' ? null : mode.rule;
  const title = mode.kind === 'new' ? 'Thêm quy tắc định khoản' : mode.kind === 'replace' ? `Đề xuất sửa quy tắc #${rule!.id}` : `Quy tắc #${rule!.id}`;
  const addable = conds.filter((k) => !(k in d.cond));
  const canSend = Boolean(d.business && (d.debit || d.credit) && d.from);

  return (
    <Modal title={title} onClose={onClose} wide
      footer={<>
        {editing && <button className="btn btn-primary" disabled={!canSend || save.isPending} onClick={() => save.mutate()} title="Gửi đề xuất: cấp trên duyệt thì mới áp vào chứng từ">{save.isPending ? 'Đang gửi…' : mode.kind === 'draft' ? 'Lưu đề xuất' : 'Gửi đề xuất'}</button>}
        {!editing && rule?.state === 'draft' && <button className="btn btn-primary" disabled={act.isPending} onClick={() => { if (window.confirm(`Duyệt quy tắc #${rule.id}? Chứng từ từ ${viDate(rule.from)} định khoản theo quy tắc này.`)) act.mutate('approve'); }} title="Quyền cấu hình (kế toán trưởng / chủ đơn vị)"><Check size={14} /> Duyệt</button>}
        {!editing && rule?.state === 'draft' && <button className="btn" disabled={act.isPending} onClick={() => act.mutate('reject')}>Từ chối</button>}
        {!editing && rule?.state === 'draft' && <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Sửa</button>}
        {!editing && rule && (rule.state === 'active' || rule.state === 'scheduled') && onReplace && <button className="btn btn-primary" onClick={() => onReplace(rule)} title="Quy tắc đang áp không sửa thẳng: đề xuất bản sửa có ngày hiệu lực mới"><Pencil size={14} /> Đề xuất sửa</button>}
        {!editing && (rule?.state === 'draft' || rule?.state === 'rejected') && <button className="btn" disabled={act.isPending} onClick={() => { if (window.confirm('Xoá đề xuất này?')) act.mutate('delete'); }}><Trash2 size={14} /> Xoá</button>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : act.error ? errorText(act.error) : null} />
      {rule && (
        <div className="tkht-rule-meta full">
          <span className={`tkht-badge is-${rule.state}`} title={STATE_TIP[rule.state]}>{STATE_TEXT[rule.state]}</span>
          <span>Đề xuất: <b>{rule.createdBy}</b> {rule.createdAt ? new Date(rule.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
          {rule.approvedBy && <span>{rule.state === 'rejected' ? 'Từ chối' : 'Duyệt'}: <b>{rule.approvedBy}</b></span>}
          <span>Hiệu lực: {viDate(rule.from)}{rule.to ? ` → trước ${viDate(rule.to)}` : ' trở đi'}</span>
          {rule.replacesId && <span>Thay quy tắc #{rule.replacesId}</span>}
          {rule.rejectedNote && <span className="neg">Lý do từ chối: {rule.rejectedNote}</span>}
        </div>
      )}
      {mode.kind === 'replace' && <div className="alert alert-info full">Quy tắc đang áp không sửa thẳng. Bản sửa áp từ ngày hiệu lực mới; chứng từ trước ngày đó vẫn theo bản cũ.</div>}

      <div className="tkht-sentence full">
        <span>Khi</span>
        <select className="select input" disabled={readOnly || mode.kind !== 'new'} value={d.business} onChange={(e) => set('business', e.target.value)} title="Nghiệp vụ của chứng từ">
          {businesses.filter((b) => b.isActive).map((b) => <option key={b.code} value={b.code}>{b.isSystem ? '' : '↳ '}{b.name}</option>)}
        </select>
        <span>có</span>
        {Object.keys(d.cond).length === 0 && <span className="tkht-cond-chip is-all" title="Không điều kiện: áp cho mọi chứng từ của nghiệp vụ">mọi trường hợp</span>}
        {(Object.keys(d.cond) as CondKey[]).map((k) => (
          <span key={k} className="tkht-cond-chip">
            <span className="muted">{options?.condLabels[k]}</span>
            <CondInput k={k} value={(d.cond as Record<string, unknown>)[k]} onChange={(v) => setCond(k, v)} options={options} disabled={readOnly} side={sideOf(biz)} />
            {!readOnly && <button type="button" className="tkht-mini" title="Bỏ điều kiện" onClick={() => setCond(k, undefined)}><X size={11} /></button>}
          </span>
        ))}
        {!readOnly && addable.length > 0 && (
          <select className="select input tkht-add-cond" value="" onChange={(e) => { const k = e.target.value as CondKey; if (!k) return; setCond(k, k === 'gift' || k === 'sameUnit' ? true : k === 'leg' ? 'out' : ''); }} title="Thêm điều kiện cho quy tắc cụ thể hơn">
            <option value="">+ điều kiện</option>
            {addable.map((k) => <option key={k} value={k}>{options?.condLabels[k]}</option>)}
          </select>
        )}
        <span>thì khoản</span>
        <select className="select input" disabled={readOnly || mode.kind === 'replace'} value={d.part} onChange={(e) => set('part', e.target.value as Part)} title="Khoản tiền của bút toán">
          {(biz?.parts ?? []).map((p) => <option key={p.part} value={p.part}>{p.label}</option>)}
        </select>
        <span>ghi</span>
      </div>
      <Field label="Nợ" tip="Bỏ trống: giữ tài khoản bộ định khoản tự tra (ngầm định)"><AccountPicker value={d.debit} onChange={(v) => set('debit', v ?? '')} postingOnly disabled={readOnly} placeholder="tự tra" /></Field>
      <Field label="Có" tip="Bỏ trống: giữ tài khoản bộ định khoản tự tra (ngầm định)"><AccountPicker value={d.credit} onChange={(v) => set('credit', v ?? '')} postingOnly disabled={readOnly} placeholder="tự tra" /></Field>
      <Field label="Áp từ ngày" tip="Chứng từ có ngày từ đây trở đi định khoản theo quy tắc (sau khi duyệt)"><input type="date" className="input" disabled={readOnly} value={d.from} onChange={(e) => set('from', e.target.value)} /></Field>
      <Field label="Ưu tiên" tip="Chỉ dùng khi hai quy tắc khớp ngang nhau (cùng số điều kiện): số lớn thắng"><input type="number" className="input num" disabled={readOnly} value={d.priority} onChange={(e) => set('priority', Number(e.target.value) || 0)} /></Field>
      <Field label="Sổ" tip="Áp cho sổ nào: cả hai / chỉ sổ nội bộ / chỉ sổ thuế">
        <select className="select input" disabled={readOnly} value={d.book} onChange={(e) => set('book', e.target.value as RuleDraft['book'])}>
          <option value="all">Cả sổ nội bộ và sổ thuế</option><option value="internal">Chỉ sổ nội bộ</option><option value="tax">Chỉ sổ thuế</option>
        </select>
      </Field>
      <Field label="Diễn giải" full tip="Ghi ngắn quy tắc dùng cho trường hợp nào"><input className="input" disabled={readOnly} value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="vd: Quà công ty tặng khách vào chi phí bán hàng" /></Field>
      <Field label="Lý do đề xuất" full tip="Người duyệt đọc để quyết"><input className="input" disabled={readOnly} value={d.changeReason} onChange={(e) => set('changeReason', e.target.value)} placeholder="vd: Theo quyết định của kế toán trưởng ngày…" /></Field>

      <div className="tkht-preview full">
        <div className="tkht-preview-title"><Sparkles size={14} /> Chạy thử trên phiếu mẫu {preview ? `· ${preview.sample.name}` : ''}</div>
        {previewErr && <div className="neg">{previewErr}</div>}
        {!preview && !previewErr && <div className="muted">Chọn tài khoản Nợ hoặc Có để xem bút toán.</div>}
        {preview && (
          <table className="grid">
            <thead><tr><th title="Khoản của bút toán">Khoản</th><th title="Tài khoản Nợ: tự tra → sau quy tắc">Nợ</th><th title="Tài khoản Có: tự tra → sau quy tắc">Có</th><th className="num" title="Số tiền mẫu">Số tiền</th><th title="Quy tắc thắng ở khoản này">Theo</th></tr></thead>
            <tbody>{preview.entries.map((e) => (
              <tr key={e.key} className={e.part === d.part ? 'is-focus' : ''}>
                <td>{e.partLabel}{e.group !== preview.business.name ? <span className="muted"> · {e.group}</span> : null}</td>
                <td className="mono">{e.debit.account !== e.debit.auto ? <><span className="tkht-before">{e.debit.auto}</span> → <span className="tkht-after">{e.debit.account}</span></> : e.debit.account}</td>
                <td className="mono">{e.credit.account !== e.credit.auto ? <><span className="tkht-before">{e.credit.auto}</span> → <span className="tkht-after">{e.credit.account}</span></> : e.credit.account}</td>
                <td className="num">{money(e.amount)}</td>
                <td>{e.ruleId ? (e.ruleId === 'thu' ? 'quy tắc này' : `#${e.ruleId}`) : <span className="muted">tự tra</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {preview?.errors.map((x) => <div key={x} className="neg">{x}</div>)}
      </div>
    </Modal>
  );
}

function CondInput({ k, value, onChange, options, disabled, side }: { k: CondKey; value: unknown; onChange: (v: unknown) => void; options?: Options; disabled?: boolean; side: 'sale' | 'purchase' | null }) {
  const sel = (items: { code: string; name: string }[]) => (
    <select className="select input" disabled={disabled} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
      <option value="">— chọn —</option>
      {items.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
    </select>
  );
  if (k === 'gift') return <select className="select input" disabled={disabled} value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}><option value="1">Hàng tặng</option><option value="0">Hàng bán (không tặng)</option></select>;
  if (k === 'sameUnit') return <select className="select input" disabled={disabled} value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}><option value="1">Cùng đơn vị hạch toán</option><option value="0">Khác đơn vị hạch toán</option></select>;
  if (k === 'leg') return <select className="select input" disabled={disabled} value={String(value ?? 'out')} onChange={(e) => onChange(e.target.value)}><option value="out">Bên xuất</option><option value="in">Bên nhận</option></select>;
  if (k === 'method') return sel((options?.methods ?? []).map((m) => ({ code: m.code, name: m.name })));
  if (k === 'taxCode') return sel((options?.taxes ?? []).map((t) => ({ code: t.code, name: `${t.name} (${t.rate}%)` })));
  if (k === 'itemType') return sel(options?.itemTypes ?? []);
  if (k === 'programKind') return sel(forSide(options?.programKinds, side));
  return sel(forSide(options?.programs, side).map((p) => ({ code: p.code, name: `${p.name}${p.kind ? ` · ${p.kind}` : ''}` })));
}

// ------------------------------------------------------------------------------------------------ nghiệp vụ tự tạo
function BusinessEditor({ biz, onClose }: { biz: Business | null; onClose: () => void }) {
  const qc = useQueryClient();
  const options = useOptions().data;
  const [f, setF] = useState({ name: biz?.name ?? '', baseCode: biz?.baseCode ?? biz?.code ?? 'sale', reasonCode: biz?.reasonCode ?? '', note: biz?.note ?? '', isActive: biz?.isActive ?? true });
  const save = useMutation({
    mutationFn: () => (biz ? api.put(`/api/v1/posting-rules/businesses/${biz.code}`, { ...f, reasonCode: f.reasonCode || biz.code }) : api.post('/api/v1/posting-rules/businesses', f)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); },
  });
  const system = biz?.isSystem;
  return (
    <Modal title={biz ? `Nghiệp vụ: ${biz.name}` : 'Thêm nghiệp vụ'} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!f.name.trim() || (!system && !f.reasonCode.trim()) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      {!system && <div className="alert alert-info full">Nghiệp vụ tự tạo dựa trên một nghiệp vụ có sẵn: nhận mọi quy tắc của nghiệp vụ đó, quy tắc riêng của nó thắng. Chứng từ mang mã này (vd phiếu website gửi kèm mã) thì đi theo quy tắc của nghiệp vụ này.</div>}
      <Field label="Tên nghiệp vụ" full><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="vd: Xuất quà tặng của nhà cung cấp" autoFocus /></Field>
      {!system && <>
        <Field label="Dựa trên" tip="Nghiệp vụ có sẵn mà phiếu thuộc về (bán hàng, xuất điều chỉnh kho…)">
          <select className="select input" value={f.baseCode} onChange={(e) => setF({ ...f, baseCode: e.target.value })} disabled={Boolean(biz)}>
            {(options?.businesses ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Mã nghiệp vụ" tip="Mã chứng từ gửi kèm (reasonCode) để đi vào nghiệp vụ này — vd phiếu website gửi XHH01 cho hàng hỏng. Chưa có mã thì phần mềm tự thêm"><input className="input mono" value={f.reasonCode} disabled={Boolean(biz)} onChange={(e) => setF({ ...f, reasonCode: e.target.value.toUpperCase() })} placeholder="vd: XQNCC" /></Field>
        <label className="checkbox full"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang dùng</label>
      </>}
      <Field label="Ghi chú" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ thẻ 1: sơ đồ
function BusinessList({ list, sel, onPick, onAdd, onEdit }: { list: Business[]; sel: string; onPick: (code: string) => void; onAdd: () => void; onEdit: (b: Business) => void }) {
  const areas = [...new Set(list.map((b) => b.area))];
  return (
    <div className="tkht-screens">
      {areas.map((a) => (
        <div key={a} className="tkht-area">
          <div className="tkht-area-title">{a}</div>
          {list.filter((b) => b.area === a).map((b) => (
            <div key={b.code} role="button" tabIndex={0} className={`tkht-screen tkht-pick ${sel === b.code ? 'is-active' : ''} ${b.isSystem ? '' : 'is-custom'} ${b.isActive ? '' : 'is-off'}`}
              onClick={() => onPick(b.code)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(b.code); } }} title={b.note || b.name}>
              <span className="tkht-screen-name">{b.isSystem ? '' : '↳ '}{b.name}</span>
              <div className="tkht-reasons">
                {!b.isSystem && <span className="tkht-chip" title={`Lý do chứng từ: ${b.reasonName ?? b.reasonCode}`}>{b.reasonCode}</span>}
                <span className="tkht-count" title="Quy tắc đang áp / sắp áp">{b.activeRules} quy tắc</span>
                {b.draftRules > 0 && <span className="tkht-count is-draft" title="Đề xuất chờ duyệt">{b.draftRules} chờ duyệt</span>}
                <button type="button" className="tkht-mini tkht-edit" title="Sửa tên, ghi chú" onClick={(e) => { e.stopPropagation(); onEdit(b); }}><Pencil size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={onAdd} title="Nghiệp vụ riêng của đơn vị (xuất quà NCC, bán nội bộ…), dựa trên một nghiệp vụ có sẵn"><Plus size={13} /> Thêm nghiệp vụ</button>
    </div>
  );
}

function SoDo({ businesses, onEditRule, onNewRule }: { businesses: Business[]; onEditRule: (r: Rule) => void; onNewRule: (d: RuleDraft) => void }) {
  const options = useOptions().data;
  const [sel, setSel] = useState('sale');
  const [sample, setSample] = useState<Sample>({ gift: false, sameUnit: true, amount: 1_000_000 });
  const [view, setView] = useState<'so-do' | 'bang'>('so-do');
  const [bizEdit, setBizEdit] = useState<Business | null | undefined>(undefined);
  const biz = businesses.find((b) => b.code === sel);
  const conds = useMemo(() => [...new Set((biz?.parts ?? []).flatMap((p) => p.conds))].filter((k) => k !== 'programKind') as CondKey[], [biz]);
  const body = { business: sel, ...sample, ...(sample.program ? {} : { program: undefined }) };
  const sim = useQuery({ queryKey: ['posting-rules', 'simulate', JSON.stringify(body)], queryFn: () => api.post<Sim>('/api/v1/posting-rules/simulate', body), enabled: Boolean(biz) });
  useEffect(() => { setSample((x) => ({ ...x, taxCode: undefined, method: undefined, program: undefined, gift: false })); }, [sel]);
  const s = sim.data;
  const condsShown = [...conds, ...(s?.context.programKind ? ['programKind' as CondKey] : [])];
  const graph = useMemo(() => (s ? buildGraph(s, options, condsShown, onEditRule, (e) => onNewRule({
    business: sel, part: e.part, cond: sample.gift && biz?.parts.find((p) => p.part === e.part)?.conds.includes('gift') ? { gift: true } : {}, debit: '', credit: '', priority: 0, from: today(), book: 'all', note: '', changeReason: '',
  })) : null), [s, options, condsShown.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const isInput = biz && ['purchase', 'purchase_return'].includes(biz.baseCode ?? biz.code);

  return (
    <div className="tkht-layout">
      <aside className="tkht-left">
        <div className="tkht-left-title" title="Mỗi nghiệp vụ có bộ quy tắc riêng; nghiệp vụ tự tạo nhận quy tắc của nghiệp vụ gốc">Nghiệp vụ</div>
        <BusinessList list={businesses} sel={sel} onPick={setSel} onAdd={() => setBizEdit(null)} onEdit={(b) => setBizEdit(b)} />
      </aside>
      <section className="tkht-main">
        <div className="tkht-toolbar">
          <div className="tkht-title"><b>{biz?.name}</b>{biz?.note ? <span className="muted"> · {biz.note}</span> : null}
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onNewRule({ business: sel, part: biz?.parts[0]?.part ?? 'goods', cond: {}, debit: '', credit: '', priority: 0, from: today(), book: 'all', note: '', changeReason: '' })}><Plus size={13} /> Thêm quy tắc</button>
          </div>
          {conds.includes('itemType') && (
            <label title="Loại hàng của mặt hàng mẫu">Loại hàng
              <select className="select input" value={sample.itemType ?? ''} onChange={(e) => setSample((x) => ({ ...x, itemType: e.target.value || undefined }))}>
                <option value="">Hàng bán (mặc định)</option>
                {(options?.itemTypes ?? []).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
          )}
          {conds.includes('taxCode') && (
            <label title="Loại thuế của dòng mẫu">Loại thuế
              <select className="select input" value={sample.taxCode ?? s?.sample.taxCode ?? ''} onChange={(e) => setSample((x) => ({ ...x, taxCode: e.target.value }))}>
                {(options?.taxes ?? []).filter((t) => t.direction === (isInput ? 'input' : 'output')).map((t) => <option key={t.code} value={t.code}>{t.code} ({t.rate}%)</option>)}
              </select>
            </label>
          )}
          {conds.includes('method') && (
            <label title="Hình thức thanh toán của phiếu mẫu">Hình thức
              <select className="select input" value={sample.method ?? s?.sample.method ?? ''} onChange={(e) => setSample((x) => ({ ...x, method: e.target.value }))}>
                {(options?.methods ?? []).filter((m) => !m.isReceivable).map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
              </select>
            </label>
          )}
          {conds.includes('program') && (
            <label title={sideOf(biz) === 'purchase' ? 'Dòng hàng thuộc chính sách nhà cung cấp nào' : 'Dòng hàng thuộc chương trình bán nào (BH12)'}>{sideOf(biz) === 'purchase' ? 'Chính sách NCC' : 'Chương trình bán'}
              <select className="select input" value={sample.program ?? ''} onChange={(e) => setSample((x) => ({ ...x, program: e.target.value || undefined }))}>
                <option value="">Không chương trình</option>
                {forSide(options?.programs, sideOf(biz)).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}{p.kind ? ` (${p.kind})` : ''}</option>)}
              </select>
            </label>
          )}
          {conds.includes('gift') && <label className="checkbox" title="Dòng hàng tặng (tiền hàng 0)"><input type="checkbox" checked={sample.gift} onChange={(e) => setSample((x) => ({ ...x, gift: e.target.checked }))} /> Hàng tặng</label>}
          {conds.includes('sameUnit') && <label className="checkbox" title="Hai chi nhánh cùng đơn vị hạch toán"><input type="checkbox" checked={sample.sameUnit} onChange={(e) => setSample((x) => ({ ...x, sameUnit: e.target.checked }))} /> Cùng đơn vị hạch toán</label>}
          <label title="Số tiền hàng mẫu (trước thuế)">Tiền hàng
            <input className="input num" style={{ width: 110 }} value={money(sample.amount)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n > 0) setSample((x) => ({ ...x, amount: n })); }} />
          </label>
          <label title="Ngày chứng từ mẫu: quy tắc chọn theo hiệu lực tại ngày này">Ngày
            <input type="date" className="input" value={sample.date ?? s?.sample.date ?? today()} onChange={(e) => setSample((x) => ({ ...x, date: e.target.value || undefined }))} />
          </label>
          <span className="spacer" />
          <div className="tabs tkht-view">
            <button type="button" className={`tab ${view === 'so-do' ? 'active' : ''}`} onClick={() => setView('so-do')}>Sơ đồ</button>
            <button type="button" className={`tab ${view === 'bang' ? 'active' : ''}`} onClick={() => setView('bang')}>Bút toán</button>
          </div>
        </div>
        <ErrorBox error={sim.error ? errorText(sim.error) : null} />
        {sim.isLoading && <Loading />}
        {s && graph && view === 'so-do' && (
          <div className="tkht-canvas">
            <ReactFlow key={`${sel}-${s.entries.length}`} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} minZoom={0.3} maxZoom={1.6}
              // Vừa khung mỗi lần đổi nghiệp vụ: cả 5 cột luôn thấy hết, không lệch sang trái.
              fitView fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }} nodesConnectable={false} elementsSelectable={false}>
              <Background gap={18} size={1} color="#dbe3ee" />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="tkht-legend">
              <span><i style={{ background: COLOR.win }} /> quy tắc thắng</span>
              <span><i style={{ background: COLOR.debit }} /> bên Nợ</span>
              <span><i style={{ background: COLOR.credit }} /> bên Có</span>
              <span><i className="dash" /> tự tra / thua</span>
              <span className="muted">Bấm bút toán để thêm quy tắc, bấm quy tắc để xem</span>
            </div>
          </div>
        )}
        {s && view === 'bang' && (
          <div className="table-wrap"><table className="grid">
            <thead><tr><th title="Bút toán của phiếu mẫu">Phần</th><th title="Khoản tiền">Khoản</th><th title="Tài khoản Nợ (gạch = tài khoản tự tra bị quy tắc đè)">Nợ</th><th title="Tài khoản Có">Có</th><th className="num" title="Số tiền mẫu">Số tiền</th><th title="Quy tắc thắng; trống = tự tra">Theo quy tắc</th><th /></tr></thead>
            <tbody>{s.entries.map((e) => (
              <tr key={e.key}><td>{e.group}</td><td>{e.partLabel}</td>
                <td className="mono">{e.debit.account !== e.debit.auto && <span className="tkht-before">{e.debit.auto}</span>} {e.debit.account} <span className="muted">{e.debit.name}</span></td>
                <td className="mono">{e.credit.account !== e.credit.auto && <span className="tkht-before">{e.credit.auto}</span>} {e.credit.account} <span className="muted">{e.credit.name}</span></td>
                <td className="num">{money(e.amount)}</td>
                <td>{e.ruleId ? <button className="link" onClick={() => { const r = s.rules.find((x) => x.id === e.ruleId); if (r) onEditRule(r); }}>#{e.ruleId}</button> : <span className="muted">tự tra</span>}</td>
                <td><button className="btn btn-xs" title={`Thêm quy tắc cho khoản ${e.partLabel} của ${biz?.name ?? ''}${sample.gift ? ' (hàng tặng)' : ''}`}
                  onClick={() => onNewRule({ business: sel, part: e.part, cond: sample.gift && biz?.parts.find((p) => p.part === e.part)?.conds.includes('gift') ? { gift: true } : {}, debit: '', credit: '', priority: 0, from: today(), book: 'all', note: '', changeReason: '' })}><Plus size={12} /> Quy tắc</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
        {s && s.errors.length > 0 && (
          <div className="alert alert-warn" style={{ marginTop: 8 }}><b>Cần sửa:</b><ul style={{ margin: '4px 0 0 18px' }}>{s.errors.map((m) => <li key={m}>{m}</li>)}</ul></div>
        )}
      </section>
      {bizEdit !== undefined && <BusinessEditor biz={bizEdit} onClose={() => setBizEdit(undefined)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ thẻ 2: danh sách quy tắc
function DanhSachQuyTac({ businesses, onEditRule, onNewRule }: { businesses: Business[]; onEditRule: (m: EditorMode) => void; onNewRule: (d: RuleDraft) => void }) {
  const qc = useQueryClient();
  const [business, setBusiness] = useState('');
  const [state, setState] = useState<string>('');
  const [stopping, setStopping] = useState<Rule | null>(null);
  const q = useQuery({ queryKey: ['posting-rules', 'list', business], queryFn: () => api.get<Rule[]>('/api/v1/posting-rules', business ? { business } : {}) });
  const rows = (q.data ?? []).filter((r) => !state || r.state === state);
  const bizName = (c: string) => businesses.find((b) => b.code === c)?.name ?? c;
  const approve = useMutation({ mutationFn: (id: string) => api.post(`/api/v1/posting-rules/${id}/approve`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['posting-rules'] }) });
  const counts = (q.data ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.state]: (a[r.state] ?? 0) + 1 }), {});
  return (
    <div>
      <div className="tkht-toolbar">
        <label>Nghiệp vụ
          <select className="select input" value={business} onChange={(e) => setBusiness(e.target.value)}>
            <option value="">Tất cả</option>
            {businesses.map((b) => <option key={b.code} value={b.code}>{b.isSystem ? '' : '↳ '}{b.name}</option>)}
          </select>
        </label>
        <div className="tabs tkht-view" style={{ alignSelf: 'flex-end' }}>
          {(['', 'draft', 'active', 'scheduled', 'closed', 'rejected'] as const).map((k) => (
            <button key={k} type="button" className={`tab ${state === k ? 'active' : ''}`} onClick={() => setState(k)} title={k ? STATE_TIP[k] : 'Mọi trạng thái'}>
              {k ? STATE_TEXT[k] : 'Tất cả'}{k && counts[k] ? ` (${counts[k]})` : ''}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => { const b = businesses.find((x) => x.code === (business || 'sale')); onNewRule({ business: business || 'sale', part: b?.parts[0]?.part ?? 'goods', cond: {}, debit: '', credit: '', priority: 0, from: today(), book: 'all', note: '', changeReason: '' }); }}><Plus size={13} /> Thêm quy tắc</button>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : approve.error ? errorText(approve.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>
            <th title="Số quy tắc">#</th><th title="Nghiệp vụ của chứng từ">Nghiệp vụ</th><th title="Khoản tiền của bút toán">Khoản</th><th title="Điều kiện; trống = mọi trường hợp">Điều kiện</th>
            <th title="Tài khoản Nợ; tự tra = giữ tài khoản ngầm định">Nợ</th><th title="Tài khoản Có">Có</th><th className="num" title="Ưu tiên khi ngang nhau">Ưu tiên</th>
            <th title="Khoảng ngày chứng từ áp quy tắc">Hiệu lực</th><th title="Trạng thái duyệt">Trạng thái</th><th title="Người đề xuất / duyệt">Người</th><th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.state === 'draft' ? 'is-warn' : r.state === 'closed' || r.state === 'rejected' ? 'is-muted' : ''}>
                <td className="mono">{r.id}</td>
                <td>{bizName(r.business)}</td>
                <td>{r.partLabel}</td>
                <td title={r.condText}>{r.condText}</td>
                <td className="mono" title={r.debitName ?? 'tự tra'}>{r.debit ?? <span className="muted">tự tra</span>}</td>
                <td className="mono" title={r.creditName ?? 'tự tra'}>{r.credit ?? <span className="muted">tự tra</span>}</td>
                <td className="num">{r.priority || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{viDate(r.from)}{r.to ? ` → ${viDate(r.to)}` : ' →'}</td>
                <td><span className={`tkht-badge is-${r.state}`} title={r.state === 'rejected' && r.rejectedNote ? `Từ chối: ${r.rejectedNote}` : STATE_TIP[r.state]}>{STATE_TEXT[r.state]}</span></td>
                <td title={`Đề xuất: ${r.createdBy}${r.approvedBy ? ` · Duyệt / từ chối: ${r.approvedBy}` : ''}`}>{r.createdBy}{r.approvedBy ? ` / ${r.approvedBy}` : ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-xs" onClick={() => onEditRule({ kind: 'view', rule: r })}>Xem</button>
                  {r.state === 'draft' && <button className="btn btn-xs btn-primary" disabled={approve.isPending} onClick={() => { if (window.confirm(`Duyệt quy tắc #${r.id}?`)) approve.mutate(r.id); }} title="Quyền cấu hình (kế toán trưởng / chủ đơn vị)">Duyệt</button>}
                  {(r.state === 'active' || r.state === 'scheduled') && <button className="btn btn-xs" onClick={() => onEditRule({ kind: 'replace', rule: r })} title="Đề xuất bản sửa có ngày hiệu lực mới">Đề xuất sửa</button>}
                  {(r.state === 'active' || r.state === 'scheduled') && <button className="btn btn-xs" onClick={() => setStopping(r)} title="Ngừng áp từ một ngày"><PauseCircle size={12} /></button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className="muted">Chưa có quy tắc nào. Chưa có quy tắc thì bút toán dùng tài khoản tự tra (ngầm định) như cũ.</td></tr>}
          </tbody>
        </table></div>
      )}
      {stopping && <StopRule rule={stopping} onClose={() => setStopping(null)} />}
    </div>
  );
}

function StopRule({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(addDays(today(), 1));
  const [reason, setReason] = useState('');
  const stop = useMutation({ mutationFn: () => api.post(`/api/v1/posting-rules/${rule.id}/stop`, { from, reason }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-rules'] }); onClose(); } });
  return (
    <Modal title={`Ngừng áp quy tắc #${rule.id}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!reason.trim() || stop.isPending} onClick={() => stop.mutate()}>Ngừng áp</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={stop.error ? errorText(stop.error) : null} />
      <div className="muted full">{rule.condText} · {rule.partLabel} · Nợ {rule.debit ?? 'tự tra'} / Có {rule.credit ?? 'tự tra'}</div>
      <Field label="Ngừng từ ngày" tip="Chứng từ từ ngày này về sau không theo quy tắc; chứng từ trước đó giữ nguyên"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Lý do" full><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ thẻ 3: lịch sử thay đổi
// [2026-11-11 08:00 AM Nguyễn Văn Thủy] PHASE-026 — lịch sử sửa cấu hình hạch toán (đóng góp)
interface HistoryRow { id: string; at: string; actor: string; kind: string; label: string; object: string; action: 'save' | 'delete' | 'bulk'; changes: { field: string; label: string; before: string | null; after: string | null }[]; note?: string }
const HISTORY_KINDS: [string, string][] = [['', 'Tất cả'], ['rule', 'Quy tắc định khoản'], ['business', 'Nghiệp vụ'], ['defaults', 'Tài khoản ngầm định'], ['tax', 'Loại thuế'], ['payment', 'Hình thức thanh toán'], ['reason', 'Lý do'], ['group', 'Nhóm hạch toán']];

function LichSu() {
  const [kind, setKind] = useState('');
  const q = useQuery({ queryKey: ['posting-flow', 'history', kind], queryFn: () => api.get<HistoryRow[]>(`/api/v1/posting-flow/history${kind ? `?kind=${kind}` : ''}`) });
  const rows = q.data ?? [];
  const when = (s: string) => new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div>
      <div className="tkht-toolbar" style={{ alignItems: 'center' }}>
        <label title="Lọc theo loại cấu hình">Loại
          <select className="select input" value={kind} onChange={(e) => setKind(e.target.value)}>{HISTORY_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <span className="muted" style={{ fontSize: 12 }}>Mỗi lần lưu, đề xuất, duyệt một dòng.</span>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th title="Lúc lưu">Thời gian</th><th title="Người thao tác">Người</th><th title="Loại cấu hình">Mục</th><th title="Mã đối tượng">Đối tượng</th><th title="Ô đã đổi: trước → sau">Thay đổi</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{when(r.at)}</td>
                <td>{r.actor}</td>
                <td>{r.label}</td>
                <td className="mono">{r.object || '—'}</td>
                <td>
                  {r.action === 'delete' ? <span className="neg">Đã xoá</span> : r.changes.map((c) => (
                    <div key={c.field} className="tkht-diff">
                      <span className="muted">{c.label}:</span>{' '}
                      {r.action === 'bulk' || c.before === null ? null : <><span className="tkht-before">{c.before ?? '—'}</span> → </>}
                      <span className="tkht-after">{c.after ?? '(bỏ trống)'}</span>
                    </div>
                  ))}
                  {r.note && <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="muted">Chưa có thay đổi nào.</td></tr>}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ trang
export function ThietKeHachToanPage() {
  const [tab, setTab] = useState<'so-do' | 'quy-tac' | 'lich-su'>('so-do');
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const biz = useQuery({ queryKey: ['posting-rules', 'businesses'], queryFn: () => api.get<Business[]>('/api/v1/posting-rules/businesses') });
  const businesses = biz.data ?? [];
  const drafts = businesses.reduce((a, b) => a + b.draftRules, 0);
  return (
    <div className="page tkht-page">
      <PageHeader title="Thiết kế hạch toán" code="ACC92" helpKey="thiet-ke-hach-toan"
        subtitle="Nghiệp vụ → điều kiện → quy tắc → bút toán. Thêm / sửa quy tắc là đề xuất; người có quyền cấu hình duyệt thì mới áp từ ngày hiệu lực" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'so-do' ? 'active' : ''}`} onClick={() => setTab('so-do')}>Sơ đồ định khoản</button>
        <button role="tab" className={`tab ${tab === 'quy-tac' ? 'active' : ''}`} onClick={() => setTab('quy-tac')} title="Danh sách quy tắc, đề xuất, duyệt">Quy tắc{drafts ? <span className="tkht-count is-draft" style={{ marginLeft: 6 }}>{drafts} chờ duyệt</span> : null}</button>
        <button role="tab" className={`tab ${tab === 'lich-su' ? 'active' : ''}`} onClick={() => setTab('lich-su')} title="Ai đề xuất, ai duyệt, lúc nào">Lịch sử thay đổi</button>
      </div>
      <div className="tkht-links" title="Nguồn của tài khoản tự tra và của điều kiện">
        Liên quan:
        <Link to="/cau-hinh/tai-khoan-ngam-dinh" title="Tài khoản tự tra khi không có quy tắc (ACC41)">Tài khoản ngầm định</Link>
        <Link to="/danh-muc/loai-thue" title="Loại thuế và tài khoản thuế (ACC43)">Loại thuế</Link>
        <Link to="/cau-hinh/hinh-thuc-thanh-toan" title="Hình thức thanh toán và tài khoản tiền (DM05)">Hình thức thanh toán</Link>
        <Link to="/ban-hang/chuong-trinh" title="Chương trình bán có hạn mức (BH12)">Chương trình bán</Link>
        <Link to="/danh-muc/phan-loai-hang" title="Loại hàng của mặt hàng (DM11)">Loại hàng</Link>
      </div>
      <ErrorBox error={biz.error ? errorText(biz.error) : null} />
      {biz.isLoading ? <Loading /> : tab === 'so-do' ? <SoDo businesses={businesses} onEditRule={(r) => setEditor({ kind: 'view', rule: r })} onNewRule={(d) => setEditor({ kind: 'new', draft: d })} />
        : tab === 'quy-tac' ? <DanhSachQuyTac businesses={businesses} onEditRule={setEditor} onNewRule={(d) => setEditor({ kind: 'new', draft: d })} /> : <LichSu />}
      {editor && <RuleEditor key={`${editor.kind}${editor.kind === 'new' ? '' : editor.rule.id}`} mode={editor} businesses={businesses} onClose={() => setEditor(null)} onReplace={(r) => setEditor({ kind: 'replace', rule: r })} />}
    </div>
  );
}
