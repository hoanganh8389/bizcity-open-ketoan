/**
 * Add-in Trợ lý (TI12), tầng 1 — tra cứu, không dùng AI:
 *   - Luồng bút toán: chọn loại chứng từ, lý do, chi nhánh, mặt hàng, số tiền, thuế, hình thức → bút toán Nợ / Có thật
 *     (máy chủ cho bộ định khoản chạy thử trên phiếu mẫu rồi huỷ, không ghi sổ). "Tóm tắt mọi luồng" chạy hết các luồng.
 *   - Tìm tính năng: tìm theo tên / mã màn trong menu và nội dung hướng dẫn sử dụng; bấm để mở màn / đọc hướng dẫn.
 *   - Hỏi đáp: câu hỏi thường gặp từ docs/tro-ly/*.md (thêm câu hỏi = viết thêm mục "## …").
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, Bot, GraduationCap, ListTree, MessageCircleQuestion, Play, Search } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { HelpDrawer } from '@/components/HelpDrawer';
import { useBranches } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';
import { getGuide, listGuides } from '@/help/guides';
import { CORE_MENU, flattenMenu, mergeAddInMenu, type AddInManifestDto } from '@/layout/menu';
import { FLOWS, PART_TEXT, type Flow } from './flows';
import { FAQ, fold, safeMarkdown, trainedFaq, useTraining } from './knowledge';
import { TrainingTab } from './TrainingTab';

interface Reason { code: string; name: string; kind: string; counterAccount: string | null; isActive: boolean; flags?: Record<string, unknown> | null }
interface TaxCode { code: string; name: string; rate: number; direction: string; isActive: boolean }
interface Method { code: string; name: string; isActive: boolean }
interface SimLine { pairNo: number; part: string; accountCode: string; accountName: string; debit: number; credit: number; description: string; taxCode: string | null }
interface SimResult { ok: boolean; error?: string; entries?: { docType: string; reasonCode: string | null; lines: SimLine[] }[]; movements?: { branchCode: string; kind: string; qty: number }[] }

const MOVE_TEXT: Record<string, string> = { sale: 'Xuất bán', sale_return: 'Nhập hàng trả lại', purchase: 'Nhập mua', purchase_return: 'Xuất trả NCC', transfer_out: 'Xuất chuyển kho', transfer_in: 'Nhập chuyển kho', adjust_in: 'Điều chỉnh tăng', adjust_out: 'Điều chỉnh giảm' };

/** Ghép dòng Nợ / Có cùng cặp thành một dòng bút toán: Phần · Nợ TK · Có TK · Số tiền. */
function pairsOf(lines: SimLine[]) {
  const byPair = new Map<number, SimLine[]>();
  for (const l of lines) byPair.set(l.pairNo, [...(byPair.get(l.pairNo) ?? []), l]);
  return [...byPair.values()].map((ls) => {
    const d = ls.find((l) => l.debit) ?? ls[0]!;
    const c = ls.find((l) => l.credit) ?? ls[1] ?? ls[0]!;
    return { part: d.part, debit: d, credit: c, amount: d.debit || c.credit, description: d.description || c.description };
  });
}

function EntryTable({ result }: { result: SimResult }) {
  if (!result.ok) return <div className="alert alert-bad">{result.error}</div>;
  const entries = result.entries ?? [];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {entries.length === 0 && <div className="alert alert-warn">Phiếu này không sinh bút toán tiền (chỉ ghi thẻ kho). Giá trị ghi sổ khi chạy Tính giá vốn (ACC49).</div>}
      {entries.map((e, i) => (
        <div key={i} className="card">
          <div className="card-body" style={{ padding: '6px 10px' }}><b>Bút toán {i + 1}</b>{e.reasonCode && <span className="muted"> · lý do {e.reasonCode}</span>}</div>
          <table className="grid">
            <thead><tr><th>Phần</th><th>Nợ tài khoản</th><th>Có tài khoản</th><th className="num">Số tiền</th><th>Diễn giải</th></tr></thead>
            <tbody>
              {pairsOf(e.lines).map((p, j) => (
                <tr key={j}>
                  <td>{PART_TEXT[p.part] ?? p.part}{p.debit.taxCode ? <span className="muted"> ({p.debit.taxCode})</span> : null}</td>
                  <td><b className="mono">{p.debit.accountCode}</b> <span className="muted">{p.debit.accountName}</span></td>
                  <td><b className="mono">{p.credit.accountCode}</b> <span className="muted">{p.credit.accountName}</span></td>
                  <td className="num">{money(p.amount)}</td>
                  <td className="muted">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {(result.movements ?? []).length > 0 && (
        <div className="muted" style={{ fontSize: 12 }}>
          Thẻ kho: {result.movements!.map((m) => `${MOVE_TEXT[m.kind] ?? m.kind} ${m.qty > 0 ? '+' : ''}${m.qty} tại ${m.branchCode}`).join('; ')}.
        </div>
      )}
    </div>
  );
}

function FlowTab() {
  const branches = useBranches().data ?? [];
  const reasons = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 }).data ?? [];
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<Method[]>('/api/v1/posting/payment-methods'), staleTime: 60_000 }).data ?? [];
  const [flowKey, setFlowKey] = useState(FLOWS[0]!.key);
  const flow = FLOWS.find((f) => f.key === flowKey)!;
  const [q, setQ] = useState({ branchCode: '', reasonCode: '', sku: '', amount: 1_000_000, taxCode: '', methodCode: 'TM', toBranchCode: '' });
  const set = (patch: Partial<typeof q>) => setQ((x) => ({ ...x, ...patch }));
  const branch = q.branchCode || branches[0]?.code || '';
  const reasonOpts = reasons.filter((r) => r.kind === flow.reasonKind && r.isActive !== false);
  const taxOpts = taxes.filter((t) => t.isActive !== false && (flow.tax === 'input' ? t.direction === 'input' : t.direction === 'output'));
  const taxCode = flow.tax ? (taxOpts.some((t) => t.code === q.taxCode) ? q.taxCode : (taxOpts.find((t) => t.code === (flow.tax === 'input' ? 'V08' : 'R08')) ?? taxOpts[0])?.code ?? '') : '';
  const body = (f: Flow, over: Partial<typeof q> = {}) => ({
    flow: f.key, branchCode: branch, amount: Number(over.amount ?? q.amount) || 1_000_000,
    ...(over.reasonCode ?? q.reasonCode ? { reasonCode: over.reasonCode ?? q.reasonCode } : {}),
    ...(q.sku ? { sku: q.sku } : {}),
    ...(f.tax ? { taxCode: over.taxCode ?? taxCode } : {}),
    ...(f.method ? { methodCode: q.methodCode || 'TM' } : {}),
    ...(f.other && q.toBranchCode ? { toBranchCode: q.toBranchCode } : {}),
  });
  const run = useMutation({ mutationFn: () => api.post<SimResult>('/api/v1/addins/tro-ly/simulate', body(flow)) });
  // Tóm tắt mọi luồng: lý do mặc định, thuế R08 / V08, tiền mặt.
  const all = useMutation({
    mutationFn: async () => {
      const out: { flow: Flow; result: SimResult }[] = [];
      for (const f of FLOWS) {
        const tax = f.tax ? (taxes.find((t) => t.code === (f.tax === 'input' ? 'V08' : 'R08'))?.code ?? taxes.find((t) => t.direction === (f.tax === 'input' ? 'input' : 'output'))?.code ?? '') : '';
        out.push({ flow: f, result: await api.post<SimResult>('/api/v1/addins/tro-ly/simulate', { ...body(f, { reasonCode: '', taxCode: tax }), reasonCode: undefined }) });
      }
      return out;
    },
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }} className="troly-flow">
      <div className="card"><div className="card-body" style={{ display: 'grid', gap: 8 }}>
        <label className="field"><span className="muted">Loại chứng từ</span>
          <select className="select input" value={flowKey} onChange={(e) => { setFlowKey(e.target.value); set({ reasonCode: '' }); run.reset(); }}>
            {[...new Set(FLOWS.map((f) => f.group))].map((g) => (
              <optgroup key={g} label={g}>{FLOWS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label className="field"><span className="muted">Lý do</span>
          <select className="select input" value={q.reasonCode} onChange={(e) => set({ reasonCode: e.target.value })}>
            <option value="">Lý do mặc định của loại chứng từ</option>
            {reasonOpts.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name}{r.counterAccount ? ` (TK ${r.counterAccount})` : ''}</option>)}
          </select>
        </label>
        <label className="field"><span className="muted">Chi nhánh</span>
          <select className="select input" value={branch} onChange={(e) => set({ branchCode: e.target.value })}>
            {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
          </select>
        </label>
        {flow.other && (
          <label className="field"><span className="muted">{flow.other} (không bắt buộc)</span>
            <select className="select input" value={q.toBranchCode} onChange={(e) => set({ toBranchCode: e.target.value })}>
              <option value="">{flow.key === 'cash_transfer' ? 'Cùng chi nhánh (quỹ → ngân hàng)' : 'Không rõ'}</option>
              {branches.filter((b) => b.code !== branch).map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </label>
        )}
        {flow.key !== 'receipt' && flow.key !== 'refund' && flow.key !== 'supplier_payment' && flow.key !== 'supplier_refund' && flow.key !== 'cash_transfer' && (
          <label className="field"><span className="muted">Mã hàng (để lấy nhóm hạch toán; trống = nhóm mặc định)</span>
            <input className="input" value={q.sku} onChange={(e) => set({ sku: e.target.value.trim() })} placeholder="Ví dụ 100861007" />
          </label>
        )}
        <label className="field"><span className="muted">Số tiền {flow.tax ? '(trước thuế)' : ''}</span>
          <input className="input num" type="number" min={1} value={q.amount} onChange={(e) => set({ amount: Number(e.target.value) })} />
        </label>
        {flow.tax && (
          <label className="field"><span className="muted">Loại thuế ({flow.tax === 'input' ? 'đầu vào' : 'đầu ra'})</span>
            <select className="select input" value={taxCode} onChange={(e) => set({ taxCode: e.target.value })}>
              {taxOpts.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
            </select>
          </label>
        )}
        {flow.method && (
          <label className="field"><span className="muted">Hình thức thanh toán</span>
            <select className="select input" value={q.methodCode} onChange={(e) => set({ methodCode: e.target.value })}>
              {methods.filter((m) => m.isActive !== false).map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-primary" disabled={!branch || run.isPending} onClick={() => run.mutate()}><Play size={14} /> Xem luồng bút toán</button>
        <button className="btn" disabled={!branch || all.isPending} onClick={() => { run.reset(); all.mutate(); }}><ListTree size={14} /> Tóm tắt mọi luồng</button>
        <div className="muted" style={{ fontSize: 12 }}>Chạy thử đúng bộ định khoản thật trên phiếu mẫu rồi huỷ — không ghi sổ, không đổi danh mục.</div>
      </div></div>

      <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <div className="alert alert-info"><b>{flow.label}.</b> {flow.note}</div>
        <ErrorBox error={run.error ? errorText(run.error) : all.error ? errorText(all.error) : null} />
        {run.isPending && <Loading text="Đang mô phỏng…" />}
        {run.data && <EntryTable result={run.data} />}
        {all.isPending && <Loading text="Đang chạy mọi luồng…" />}
        {all.data && !run.data && (
          <div className="card">
            <table className="grid">
              <thead><tr><th>Luồng chứng từ</th><th>Bút toán (lý do mặc định, thuế 8%, tiền mặt)</th></tr></thead>
              <tbody>
                {all.data.map(({ flow: f, result }) => (
                  <tr key={f.key} className="clickable" onClick={() => { setFlowKey(f.key); set({ reasonCode: '' }); }}>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{f.label}</b><div className="muted" style={{ fontSize: 11 }}>{f.group}</div></td>
                    <td>
                      {!result.ok ? <span className="text-bad">{result.error}</span>
                        : (result.entries ?? []).length === 0 ? <span className="muted">Chỉ ghi thẻ kho (giá trị ghi khi tính giá vốn)</span>
                        : (result.entries ?? []).flatMap((e) => pairsOf(e.lines)).map((p, i) => (
                          <div key={i}><span className="muted" style={{ display: 'inline-block', minWidth: 76 }}>{PART_TEXT[p.part] ?? p.part}</span> Nợ <b className="mono">{p.debit.accountCode}</b> / Có <b className="mono">{p.credit.accountCode}</b></div>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchTab() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [guide, setGuide] = useState<string | null>(null);
  const addins = useQuery({ queryKey: ['addins'], queryFn: () => api.get<AddInManifestDto[]>('/api/v1/system/addins'), staleTime: 300_000 }).data ?? [];
  const screens = useMemo(() => flattenMenu(mergeAddInMenu(CORE_MENU, addins)), [addins]);
  const guides = useMemo(() => listGuides().map((g) => ({ ...g, body: getGuide(g.key) ?? '' })), []);
  const qf = fold(text.trim());
  const hitScreens = qf ? screens.filter((s) => fold(`${s.label} ${s.code ?? ''} ${s.group}`).includes(qf)).slice(0, 40) : [];
  const hitGuides = qf ? guides.filter((g) => fold(g.title + ' ' + g.body).includes(qf)).slice(0, 20) : [];
  const snippet = (body: string) => {
    const plain = body.replace(/[#*`>|_-]+/g, ' ').replace(/\s+/g, ' ');
    const i = fold(plain).indexOf(qf);
    return i < 0 ? plain.slice(0, 140) : `${i > 50 ? '…' : ''}${plain.slice(Math.max(0, i - 50), i + 110)}…`;
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <Search size={16} className="muted" />
        <input className="input" style={{ flex: 1, maxWidth: 520 }} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Gõ việc cần làm, tên hoặc mã màn: giá vốn, đối trừ, ACC89, chuyển kho…" />
      </div>
      {!qf && <div className="muted">Tìm theo tên màn, mã màn (ACC14, BH02…) hoặc nội dung trong hướng dẫn sử dụng.</div>}
      {qf && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
          <div className="card">
            <div className="card-body" style={{ padding: '6px 10px' }}><b>Màn chức năng ({hitScreens.length})</b></div>
            {hitScreens.length === 0 ? <div className="empty" style={{ padding: 16 }}>Không thấy màn nào.</div> : (
              <table className="grid"><tbody>
                {hitScreens.map((s) => (
                  <tr key={s.path} className="clickable" onClick={() => navigate(s.path)} title="Bấm để mở màn">
                    <td className="mono" style={{ width: 70 }}><b>{s.code}</b></td><td>{s.label}</td><td className="muted">{s.group}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div className="card">
            <div className="card-body" style={{ padding: '6px 10px' }}><b>Hướng dẫn sử dụng ({hitGuides.length})</b></div>
            {hitGuides.length === 0 ? <div className="empty" style={{ padding: 16 }}>Không có hướng dẫn nào nhắc tới.</div> : (
              <table className="grid"><tbody>
                {hitGuides.map((g) => (
                  <tr key={g.key} className="clickable" onClick={() => setGuide(g.key)} title="Bấm để đọc hướng dẫn">
                    <td><b>{g.title}</b><div className="muted" style={{ fontSize: 12, whiteSpace: 'normal' }}>{snippet(g.body)}</div></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      )}
      {guide && <HelpDrawer guideKey={guide} onClose={() => setGuide(null)} />}
    </div>
  );
}

function FaqTab() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  const qf = fold(text.trim());
  const trained = trainedFaq(useTraining().data);
  const list = [...trained, ...FAQ].map((x, i) => ({ ...x, i })).filter((x) => !qf || fold(`${x.q} ${x.a} ${(x.keywords ?? []).join(' ')}`).includes(qf));
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 980 }}>
      <div className="row" style={{ gap: 8 }}>
        <Search size={16} className="muted" />
        <input className="input" style={{ flex: 1, maxWidth: 520 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm câu hỏi: chờ huỷ, đảo bút toán, giá vốn, chiết khấu…" />
        <span className="muted">{list.length} câu hỏi</span>
      </div>
      {list.map((x) => (
        <div key={x.i} className="card">
          <button type="button" className="troly-faq-q" onClick={() => setOpen(open === x.i ? null : x.i)}>{open === x.i ? '▾' : '▸'} {x.q}{x.id && <span className="badge badge-ok" style={{ marginLeft: 8, fontWeight: 400 }}>huấn luyện</span>}</button>
          {/* safeMarkdown: chặn HTML thô, chỉ nhận liên kết / ảnh an toàn (mục huấn luyện do người dùng nhập). */}
          {open === x.i && <div className="doc card-body" style={{ paddingTop: 0 }} dangerouslySetInnerHTML={{ __html: safeMarkdown(x.a) }} />}
        </div>
      ))}
      {list.length === 0 && <div className="empty">Chưa có câu hỏi phù hợp. Thêm câu hỏi ở thẻ "Dữ liệu huấn luyện".</div>}
    </div>
  );
}

export function TroLyPage() {
  const [tab, setTab] = useState<'flow' | 'search' | 'faq' | 'train'>('flow');
  return (
    <>
      <PageHeader title="Trợ lý" code="TI12" subtitle="Luồng bút toán theo cấu hình hiện tại, tìm tính năng, hỏi đáp thường gặp, dữ liệu huấn luyện robot"
        actions={<button className="btn" onClick={() => window.dispatchEvent(new Event('troly:open'))} title="Robot trợ lý ở góc phải dưới màn hình"><Bot size={15} /> Mở robot trợ lý</button>} />
      <div className="tabs" style={{ marginBottom: 10, padding: 0 }}>
        <button className={`tab ${tab === 'flow' ? 'active' : ''}`} onClick={() => setTab('flow')}><ListTree size={14} style={{ verticalAlign: -2 }} /> Luồng bút toán</button>
        <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}><BookOpen size={14} style={{ verticalAlign: -2 }} /> Tìm tính năng</button>
        <button className={`tab ${tab === 'faq' ? 'active' : ''}`} onClick={() => setTab('faq')}><MessageCircleQuestion size={14} style={{ verticalAlign: -2 }} /> Hỏi đáp</button>
        <button className={`tab ${tab === 'train' ? 'active' : ''}`} onClick={() => setTab('train')}><GraduationCap size={14} style={{ verticalAlign: -2 }} /> Dữ liệu huấn luyện</button>
      </div>
      {tab === 'flow' ? <FlowTab /> : tab === 'search' ? <SearchTab /> : tab === 'faq' ? <FaqTab /> : <TrainingTab />}
    </>
  );
}
