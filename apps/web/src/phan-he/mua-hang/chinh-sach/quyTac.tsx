/**
 * Quy tắc của chính sách: câu tóm tắt cho người đọc (ruleText) và form nhập theo từng loại (RuleEditor) —
 * kế toán nhập bằng ô, bảng bậc; phần mềm tự lưu thành quy tắc. Thêm loại chính sách: thêm một nhánh ở cả hai hàm.
 */
import type { ReactNode } from 'react';
import { canRepeat, giftFlags, giftItemsOf, isRepeat, termFromRule, termText, type GiftItem, type ItemDiscount, type Policy, type PolicyKind } from '@ketoan/contracts/mua-hang';
import { BangChietKhauMa } from './BangChietKhauMa';
import { BangQuaTang } from './BangQuaTang';
import { BranchPicker } from '@/components/filters';
import { tenChiNhanh } from '../du-lieu';

const branchName = (c: string) => tenChiNhanh.get(c) ?? c;

type R = Record<string, any>;
const tr = (n: number) => `${(Number(n) / 1e6).toLocaleString('vi-VN')} triệu`;
const PERIOD: Record<string, string> = { month: 'tháng', quarter: 'quý', year: 'năm' };

/** Tóm tắt quy tắc thành câu dễ đọc. */
export function ruleText(p: Pick<Policy, 'kind' | 'rule'> & { scope?: Policy['scope'] }): string {
  const t = ruleTextCore(p);
  if (!t) return t;
  // Mua X tặng Y nhiều dòng: cộng dồn / áp riêng theo từng dòng.
  const f = p.kind === 'promo_gift' ? giftFlags({ rule: p.rule, scope: p.scope ?? {} }) : undefined;
  const tags = f ? [f.exclusive && (f.exclusive === f.rows ? 'áp riêng' : `${f.exclusive}/${f.rows} dòng áp riêng`), f.rows && (f.repeat === f.rows ? 'cộng dồn' : !f.repeat ? 'chỉ tặng một lần' : `${f.repeat}/${f.rows} dòng cộng dồn`)].filter(Boolean)
    : [p.rule?.apply === 'exclusive' && 'áp riêng (không cộng chương trình khác)', canRepeat(p) && (isRepeat(p) ? 'cộng dồn' : 'chỉ một lần')].filter(Boolean);
  return tags.length ? `${t} — ${tags.join(', ')}` : t;
}
function ruleTextCore(p: Pick<Policy, 'kind' | 'rule'> & { scope?: Policy['scope'] }): string {
  const r = p.rule as R;
  switch (p.kind) {
    case 'trade_discount': { const on = p.scope?.sku ? `trên dòng mã ${p.scope.sku}` : 'trên tổng đơn'; const min = Number(r.minOrder) ? ` khi tổng đơn từ ${Number(r.minOrder).toLocaleString('vi-VN')}đ` : ''; return r.pct ? `Chiết khấu ${Number(r.pct).toLocaleString('vi-VN')}% ${on}${min}` : `Chiết khấu ${Number(r.amount ?? 0).toLocaleString('vi-VN')}đ ${on}${min}`; }
    case 'item_discount': { const it = (r.items ?? []) as R[]; return `${it.length.toLocaleString('vi-VN')} mã hàng có chiết khấu riêng${it[0] ? ` — ví dụ ${it[0].sku}: ${it[0].pct ? `${Number(it[0].pct).toLocaleString('vi-VN')}%` : `giảm ${Number(it[0].amount ?? 0).toLocaleString('vi-VN')}đ / ${it[0].unit || 'ĐVT'}`}${it[0].minQty ? ` từ ${it[0].minQty}` : ''}` : ''}`; }
    case 'qty_tier': return (r.tiers ?? []).map((t: R) => `từ ${t.from}: ${Number(t.pct).toLocaleString('vi-VN')}%`).join(' · ');
    case 'payment_discount': return `Chiết khấu thanh toán ${Number(r.pct).toLocaleString('vi-VN')}% nếu trả đúng hạn`;
    case 'promo_gift': {
      const it = giftItemsOf({ rule: r, scope: p.scope ?? {} });
      const one = (i: GiftItem) => `mua ${i.buyQty} ${i.buyUnit || ''}${i.sku ? ` ${i.sku}` : ''} tặng ${i.getQty} ${i.getUnit || i.buyUnit || ''}${i.giftSku && i.giftSku !== i.sku ? ` ${i.giftSku}` : ''}`.replace(/\s+/g, ' ');
      const head = it.length > 1 ? `${it.length} dòng mua – tặng, ví dụ ${one(it[0]!)}` : it[0] ? one(it[0]).replace(/^m/, 'M') : 'Chưa có dòng mua – tặng';
      return `${head}${r.splitIntoCost ? ' — KM cho người bán, chia vào giá' : ' — KM cho người tiêu dùng, không chia giá'}`;
    }
    case 'period_rebate': return `Theo ${PERIOD[r.period] ?? 'kỳ'}: ` + (r.tiers ?? []).map((t: R) => `từ ${tr(t.from)}: ${Number(t.pct).toLocaleString('vi-VN')}%`).join(' · ');
    case 'target_rebate': return `Chỉ tiêu ${PERIOD[r.period] ?? ''} ${tr(r.target)} — ` + (r.tiers ?? []).map((t: R) => `đạt ${Number(t.fromPct).toLocaleString('vi-VN')}%: thưởng ${Number(t.pct).toLocaleString('vi-VN')}%`).join(' · ');
    case 'stage_rebate': return (r.stages ?? []).map((s: R) => `ngày ${s.from}–${s.to}: từ ${tr(s.min)} → ${s.amount ? `${Number(s.amount).toLocaleString('vi-VN')}đ` : `${Number(s.pct).toLocaleString('vi-VN')}%`}`).join(' · ') + (r.mode === 'cumulative' ? ' (cộng dồn từ đầu tháng)' : ' (tính riêng từng giai đoạn)');
    case 'credit_limit': return `Hạn mức ${tr(r.limit)}${r.branches && Object.keys(r.branches).length ? ` — ${Object.entries(r.branches).map(([k, v]) => `${branchName(k)} ${tr(v as number)}`).join(', ')}` : ''}; cảnh báo khi dùng từ ${Number(r.warnPct ?? 90).toLocaleString('vi-VN')}%`;
    case 'payment_term': return termText(termFromRule(r));
    case 'supply_target': return Object.entries(r.branches ?? {}).map(([k, v]) => `${branchName(k)} ${tr(v as number)}`).join(' · ');
    case 'lot_tracking': return r.required === false ? 'Không bắt buộc số lô' : 'Bắt buộc nhập số lô + hạn dùng khi nhập hàng; cảnh báo cận date 30-15-7 ngày';
    case 'gift_budget': return `Chương trình ${r.program}: ngân sách ${Number(r.amount ?? 0).toLocaleString('vi-VN')}đ`;
    case 'contract': return `Hợp đồng số ${r.no ?? ''}${r.signedOn ? ` ký ngày ${String(r.signedOn).split('-').reverse().join('/')}` : ''}${r.note ? ` — ${r.note}` : ''}`;
  }
}

/** Quy tắc mặc định khi tạo chính sách mới. */
export function defaultRule(k: PolicyKind): R {
  return ({
    trade_discount: { pct: 5 }, item_discount: { items: [] }, qty_tier: { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] }, payment_discount: { pct: 2 },
    promo_gift: { splitIntoCost: true, items: [] }, period_rebate: { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }] },
    target_rebate: { period: 'month', target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }] }, stage_rebate: { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 1 }] },
    credit_limit: { limit: 500_000_000, warnPct: 90, branches: {} }, payment_term: { basis: 'receipt_date', days: 10, workingDays: true, dayType: 'working' },
    supply_target: { period: new Date().toISOString().slice(0, 7), branches: {} }, lot_tracking: { required: true }, gift_budget: { program: '', amount: 10_000_000 },
    contract: { no: '', signedOn: undefined, note: '' },
  } as Record<PolicyKind, R>)[k];
}

const toNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;
function Num({ value, onChange, money, width = 110, suffix }: { value: number | undefined; onChange: (n: number) => void; money?: boolean; width?: number; suffix?: string }) {
  return <span className="row" style={{ gap: 4, alignItems: 'center' }}><input className="input num" style={{ width }} value={value === undefined ? '' : money ? Number(value).toLocaleString('vi-VN') : String(value)} onChange={(e) => onChange(toNum(e.target.value))} />{suffix && <span className="muted">{suffix}</span>}</span>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}><span style={{ width: 170, fontSize: 13 }}>{label}</span>{children}</div>;
}
/** Bảng nhiều dòng (bậc, giai đoạn, phân bổ chi nhánh). */
function Rows<T extends R>({ rows, onChange, cols, empty }: { rows: T[]; onChange: (rows: T[]) => void; cols: { head: string; cell: (r: T, set: (p: Partial<T>) => void) => ReactNode }[]; empty: T }) {
  return (
    <table className="mh-mini" style={{ width: 'auto' }}>
      <thead><tr>{cols.map((c) => <th key={c.head}>{c.head}</th>)}<th /></tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.head}>{c.cell(r, (p) => onChange(rows.map((x, j) => (j === i ? { ...x, ...p } : x))))}</td>)}<td><button type="button" className="btn btn-xs" onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button></td></tr>)}
        <tr><td colSpan={cols.length + 1}><button type="button" className="btn btn-xs" onClick={() => onChange([...rows, { ...empty }])}>+ Thêm dòng</button></td></tr>
      </tbody>
    </table>
  );
}
const PeriodSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select className="select input" style={{ width: 130 }} value={value} onChange={(e) => onChange(e.target.value)}><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm</option></select>
);
/** Phân bổ theo chi nhánh: { "CN-ND": 500000000 } ↔ bảng chi nhánh + số tiền. */
function BranchAmounts({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const rows = Object.entries(value ?? {}).map(([branch, amount]) => ({ branch, amount }));
  return <Rows rows={rows} empty={{ branch: '', amount: 0 }} onChange={(rs) => onChange(Object.fromEntries(rs.map((r) => [r.branch, r.amount])))}
    cols={[
      { head: 'Chi nhánh', cell: (r, set) => <div style={{ width: 240 }}><BranchPicker value={r.branch} onChange={(c) => set({ branch: c })} activeOnly /></div> },
      { head: 'Số tiền', cell: (r, set) => <Num money width={140} value={r.amount} onChange={(n) => set({ amount: n })} /> },
    ]} />;
}

export function RuleEditor({ kind, rule, onChange }: { kind: PolicyKind; rule: R; onChange: (r: R) => void }) {
  const set = (p: R) => onChange({ ...rule, ...p });
  switch (kind) {
    case 'trade_discount': return <>
      <Row label="Kiểu chiết khấu"><select className="select input" style={{ width: 160 }} value={rule.amount !== undefined ? 'amount' : 'pct'} onChange={(e) => onChange({ ...(e.target.value === 'amount' ? { amount: 1_000_000 } : { pct: 5 }), ...(rule.apply ? { apply: rule.apply } : {}) })}><option value="pct">Theo %</option><option value="amount">Số tiền cố định</option></select></Row>
      {rule.amount !== undefined ? <Row label="Số tiền trên tổng đơn"><Num money width={140} value={rule.amount} onChange={(n) => onChange({ ...rule, amount: n })} suffix="đ" /></Row> : <Row label="Tỷ lệ"><Num width={70} value={rule.pct} onChange={(n) => onChange({ ...rule, pct: n })} suffix="%" /></Row>}
      <Row label="Áp khi tổng đơn từ"><Num money width={140} value={rule.minOrder} onChange={(n) => onChange({ ...rule, minOrder: n || undefined })} suffix="đ" /><span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{rule.amount !== undefined ? 'trống = tiền hàng phải lớn hơn số chiết khấu (không bao giờ làm số phải trả âm)' : 'trống = mọi đơn'}; chưa đủ thì không tự áp, chỉ gợi ý mua thêm</span></Row>
    </>;
    case 'item_discount': return <BangChietKhauMa items={(rule.items ?? []) as ItemDiscount[]} onChange={(items) => set({ items })} />;
    case 'payment_discount': return <Row label="Tỷ lệ nếu trả đúng hạn"><Num width={70} value={rule.pct} onChange={(n) => set({ pct: n })} suffix="%" /></Row>;
    case 'qty_tier': return <><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Mua từ số lượng nào thì được chiết khấu bao nhiêu % (áp cho cả dòng):</div>
      <Rows rows={rule.tiers ?? []} empty={{ from: 0, pct: 0 }} onChange={(tiers) => set({ tiers })} cols={[
        { head: 'Từ số lượng', cell: (r, s) => <Num width={90} value={r.from} onChange={(n) => s({ from: n })} /> },
        { head: 'Chiết khấu', cell: (r, s) => <Num width={60} value={r.pct} onChange={(n) => s({ pct: n })} suffix="%" /> },
      ]} /></>;
    case 'promo_gift': return <>
      <BangQuaTang items={(rule.items ?? []) as GiftItem[]} onChange={(items) => set({ items })} />
      <Row label="Loại khuyến mại"><select className="select input" style={{ width: 300 }} value={rule.splitIntoCost ? '1' : '0'} onChange={(e) => set({ splitIntoCost: e.target.value === '1' })}><option value="1">KM cho người bán — chia vào giá (giá vốn giảm)</option><option value="0">KM cho người tiêu dùng — không chia giá (vào sổ quà)</option></select></Row>
    </>;
    case 'period_rebate': return <>
      <Row label="Kỳ tính thưởng"><PeriodSelect value={rule.period ?? 'month'} onChange={(period) => set({ period })} /></Row>
      <Rows rows={rule.tiers ?? []} empty={{ from: 0, pct: 0 }} onChange={(tiers) => set({ tiers })} cols={[
        { head: 'Doanh số mua từ', cell: (r, s) => <Num money width={140} value={r.from} onChange={(n) => s({ from: n })} /> },
        { head: 'Thưởng', cell: (r, s) => <Num width={60} value={r.pct} onChange={(n) => s({ pct: n })} suffix="%" /> },
      ]} /></>;
    case 'target_rebate': return <>
      <Row label="Kỳ"><PeriodSelect value={rule.period ?? 'month'} onChange={(period) => set({ period })} /></Row>
      <Row label="Chỉ tiêu doanh số"><Num money width={150} value={rule.target} onChange={(n) => set({ target: n })} suffix="đ" /></Row>
      <Rows rows={rule.tiers ?? []} empty={{ fromPct: 100, pct: 0 }} onChange={(tiers) => set({ tiers })} cols={[
        { head: 'Hoàn thành từ', cell: (r, s) => <Num width={60} value={r.fromPct} onChange={(n) => s({ fromPct: n })} suffix="%" /> },
        { head: 'Thưởng', cell: (r, s) => <Num width={60} value={r.pct} onChange={(n) => s({ pct: n })} suffix="% doanh số" /> },
      ]} /></>;
    case 'stage_rebate': return <>
      <Row label="Cách tính"><select className="select input" style={{ width: 300 }} value={rule.mode ?? 'stage'} onChange={(e) => set({ mode: e.target.value })}><option value="stage">Tính riêng doanh số từng giai đoạn</option><option value="cumulative">Cộng dồn từ đầu tháng (trừ phần đã thưởng)</option></select></Row>
      <Rows<R> rows={rule.stages ?? []} empty={{ from: 1, to: 10, min: 0, pct: 1 }} onChange={(stages) => set({ stages })} cols={[
        { head: 'Từ ngày', cell: (r, s) => <Num width={50} value={r.from} onChange={(n) => s({ from: n })} /> },
        { head: 'Đến ngày', cell: (r, s) => <Num width={50} value={r.to} onChange={(n) => s({ to: n })} /> },
        { head: 'Doanh số tối thiểu', cell: (r, s) => <Num money width={130} value={r.min} onChange={(n) => s({ min: n })} /> },
        { head: 'Thưởng', cell: (r, s) => <span className="row" style={{ gap: 4 }}>
          <select className="select input" style={{ width: 90 }} value={r.amount !== undefined ? 'amount' : 'pct'} onChange={(e) => s(e.target.value === 'amount' ? { amount: 1_000_000, pct: undefined } : { pct: 1, amount: undefined })}><option value="pct">%</option><option value="amount">Số tiền</option></select>
          {r.amount !== undefined ? <Num money width={110} value={r.amount} onChange={(n) => s({ amount: n })} /> : <Num width={50} value={r.pct} onChange={(n) => s({ pct: n })} />}
        </span> },
      ]} /></>;
    case 'credit_limit': return <>
      <Row label="Hạn mức tổng"><Num money width={150} value={rule.limit} onChange={(n) => set({ limit: n })} suffix="đ" /></Row>
      <Row label="Cảnh báo khi dùng từ"><Num width={60} value={rule.warnPct ?? 90} onChange={(n) => set({ warnPct: n })} suffix="%" /></Row>
      <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Phân bổ cho chi nhánh (để trống nếu chỉ dùng hạn mức tổng):</div>
      <BranchAmounts value={rule.branches ?? {}} onChange={(b) => set({ branches: b })} />
    </>;
    case 'payment_term': return <TermEditor rule={rule} onChange={onChange} />;
    case 'supply_target': return <>
      <Row label="Tháng"><input className="input" type="month" value={rule.period ?? ''} onChange={(e) => set({ period: e.target.value })} /></Row>
      <BranchAmounts value={rule.branches ?? {}} onChange={(b) => set({ branches: b })} />
    </>;
    case 'gift_budget': return <>
      <Row label="Mã chương trình quà"><input className="input mono" style={{ width: 200 }} value={rule.program ?? ''} placeholder="Ví dụ TGS-TRI-AN" onChange={(e) => set({ program: e.target.value.trim() })} /></Row>
      <Row label="Ngân sách"><Num money width={150} value={rule.amount} onChange={(n) => set({ amount: n })} suffix="đ" /></Row>
    </>;
    case 'contract': return <>
      <Row label="Số hợp đồng / phụ lục"><input className="input mono" style={{ width: 220 }} value={rule.no ?? ''} placeholder="Ví dụ 05/2026/HĐMB-VC" onChange={(e) => set({ no: e.target.value })} /></Row>
      <Row label="Ngày ký"><input className="input" type="date" value={rule.signedOn ?? ''} onChange={(e) => set({ signedOn: e.target.value || undefined })} /></Row>
      <Row label="Ghi chú"><input className="input" style={{ width: 360 }} value={rule.note ?? ''} placeholder="Phạm vi hàng hoá, điều kiện giao, hồ sơ hợp lệ…" onChange={(e) => set({ note: e.target.value })} /></Row>
      <div className="muted" style={{ fontSize: 12 }}>Hiệu lực hợp đồng = ô Hiệu lực từ / Đến bên dưới. File scan gắn ở thẻ Tệp đính kèm của hồ sơ NCC.</div>
    </>;
    case 'lot_tracking': return <Row label="Số lô, hạn dùng"><select className="select input" style={{ width: 260 }} value={rule.required === false ? '0' : '1'} onChange={(e) => set({ required: e.target.value === '1' })}><option value="1">Bắt buộc khi nhập (không có thì không duyệt được)</option><option value="0">Không bắt buộc</option></select></Row>;
  }
}

/** Một câu giải thích mỗi loại chính sách — hiện ngay dưới ô Loại. */
export const KIND_HINT: Record<PolicyKind, string> = {
  trade_discount: 'Phiếu nhập / đơn đặt của NCC này tự trừ chiết khấu trên tổng đơn (CK trên hoá đơn → giảm giá vốn).',
  item_discount: 'Bảng chiết khấu riêng cho TỪNG mã hàng (vài mã đến hàng nghìn mã) — nhập Excel / dán từ Excel; dòng phiếu đúng mã tự được chiết khấu.',
  qty_tier: 'Mua càng nhiều được chiết khấu càng cao — phần mềm tự chọn đúng bậc theo số lượng từng dòng.',
  payment_discount: 'Trả tiền đúng hạn thì được giảm thêm (ghi Nợ 331 / Có 515); trả trễ không được.',
  promo_gift: 'Mua đủ số lượng thì được tặng hàng — phiếu nhập tự thêm dòng quà, báo thiếu / thừa quà.',
  period_rebate: 'Cuối tháng / quý / năm, doanh số mua đạt ngưỡng thì NCC thưởng % — tính ở màn Tính thưởng cuối kỳ.',
  target_rebate: 'Đạt bao nhiêu % chỉ tiêu doanh số nhãn thì được thưởng bao nhiêu %.',
  stage_rebate: 'Chia tháng thành nhiều giai đoạn, mỗi giai đoạn đạt doanh số tối thiểu thì được thưởng.',
  credit_limit: 'Tổng nợ + đơn đang mở không được vượt hạn mức; vượt thì chặn duyệt, cần người có quyền duyệt ngoại lệ.',
  payment_term: 'Cách tính hạn thanh toán: bao nhiêu ngày, ngày làm việc hay ngày lịch, tính từ ngày nào.',
  supply_target: 'Chỉ tiêu nhập hàng của từng chi nhánh trong tháng — theo dõi ở màn Hạn mức.',
  lot_tracking: 'Bắt buộc nhập số lô, hạn dùng khi nhập hàng; cảnh báo hàng cận date.',
  contract: 'Số hợp đồng / phụ lục, ngày ký, hiệu lực — file scan gắn ở hồ sơ NCC; nhắc khi hợp đồng sắp hết hạn.',
  gift_budget: 'Giới hạn tổng giá trị quà xuất tặng của một chương trình — vượt thì cảnh báo.',
};

/** Mẫu điền nhanh theo các tình huống thường gặp (lấy từ tài liệu yêu cầu) — bấm là điền, sửa lại số cho đúng. */
export const TEMPLATES: Record<PolicyKind, { label: string; rule: R }[]> = {
  item_discount: [],
  trade_discount: [{ label: 'CK 7% trên đơn', rule: { pct: 7 } }, { label: 'CK 5%', rule: { pct: 5 } }, { label: 'Giảm 2 triệu / đơn', rule: { amount: 2_000_000 } }],
  qty_tier: [{ label: '50 → 3% · 100 → 5% · 200 → 7%', rule: { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }, { from: 100, pct: 5 }, { from: 200, pct: 7 }] } }, { label: '10 thùng → 2% · 20 thùng → 4%', rule: { tiers: [{ from: 0, pct: 0 }, { from: 10, pct: 2 }, { from: 20, pct: 4 }] } }],
  payment_discount: [{ label: 'CKTT 2%', rule: { pct: 2 } }, { label: 'CKTT 1%', rule: { pct: 1 } }],
  promo_gift: [],
  period_rebate: [{ label: 'Tháng: 200tr → 2% · 300tr → 3%', rule: { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }, { from: 300_000_000, pct: 3 }] } }, { label: 'Quý: 1 tỷ → 1,5%', rule: { period: 'quarter', tiers: [{ from: 1_000_000_000, pct: 1.5 }] } }],
  target_rebate: [{ label: 'Chỉ tiêu 500tr: đạt 100% → 2% · 110% → 3%', rule: { period: 'month', target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }, { fromPct: 110, pct: 3 }] } }],
  stage_rebate: [{ label: '3 giai đoạn 1–10 · 11–20 · 21–31, mỗi GĐ 100tr → 1%', rule: { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 1 }, { from: 11, to: 20, min: 100_000_000, pct: 1 }, { from: 21, to: 31, min: 100_000_000, pct: 1 }] } }],
  credit_limit: [{ label: 'Hạn mức 600 triệu', rule: { limit: 600_000_000, warnPct: 90, branches: {} } }, { label: 'Hạn mức 1 tỷ', rule: { limit: 1_000_000_000, warnPct: 90, branches: {} } }],
  payment_term: [
    { label: '10 ngày làm việc từ ngày nhận đủ hồ sơ', rule: { basis: 'receipt_date', days: 10, workingDays: true, dayType: 'working' } },
    { label: '15 ngày LV (trừ CN) + trả ngày 5/15/25', rule: { basis: 'receipt_date', days: 15, workingDays: true, dayType: 'working6', payDays: [5, 15, 25] } },
    { label: '30 ngày lịch', rule: { basis: 'receipt_date', days: 30, workingDays: false, dayType: 'calendar' } },
    { label: 'Trước ngày 25 hàng tháng', rule: { basis: 'receipt_date', days: 0, workingDays: false, monthDay: 25 } },
    { label: 'Nhận hàng trả ngay', rule: { basis: 'immediate', days: 0, workingDays: false } },
    { label: 'Trả trước khi giao', rule: { basis: 'prepay', days: 0, workingDays: false } },
    { label: 'Công nợ cố định', rule: { basis: 'fixed', days: 0, workingDays: false } },
  ],
  supply_target: [],
  lot_tracking: [{ label: 'Bắt buộc lô + hạn dùng', rule: { required: true } }],
  gift_budget: [{ label: 'Tri ân 10 triệu', rule: { program: 'TGS-TRI-AN', amount: 10_000_000 } }],
  contract: [],
};

/** Tiền tố mã chính sách tự cấp. */
export const CODE_PREFIX: Record<PolicyKind, string> = {
  trade_discount: 'CK', item_discount: 'CKMA', qty_tier: 'BAC', payment_discount: 'CKTT', promo_gift: 'KM', period_rebate: 'THUONG', target_rebate: 'CHITIEU', stage_rebate: 'GIAIDOAN',
  credit_limit: 'HANMUC', payment_term: 'HANTT', supply_target: 'CUNGUNG', lot_tracking: 'LO', gift_budget: 'QUA', contract: 'HD',
};

/** Điều khoản thanh toán: đủ các kiểu trong hợp đồng thực tế (mốc tính, kiểu ngày, ngày trả cố định, trước ngày N hàng tháng). */
export function TermEditor({ rule, onChange }: { rule: R; onChange: (r: R) => void }) {
  const set = (p: R) => onChange({ ...rule, ...p });
  const mode = ['fixed', 'immediate', 'prepay'].includes(rule.basis) ? rule.basis : rule.monthDay ? 'month' : 'days';
  const dayType = rule.dayType ?? (rule.workingDays ? 'working' : 'calendar');
  return <>
    <Row label="Kiểu thanh toán"><select className="select input" style={{ width: 320 }} value={mode} onChange={(e) => {
      const m = e.target.value;
      onChange(m === 'days' ? { basis: 'receipt_date', days: rule.days || 10, workingDays: true, dayType: 'working' } : m === 'month' ? { basis: rule.basis && !['fixed', 'immediate', 'prepay'].includes(rule.basis) ? rule.basis : 'receipt_date', days: 0, workingDays: false, monthDay: 25 } : { basis: m, days: 0, workingDays: false });
    }}>
      <option value="days">Trong vòng X ngày</option><option value="month">Trước ngày N hàng tháng</option><option value="immediate">Nhận hàng thanh toán ngay</option><option value="prepay">Thanh toán trước khi giao hàng</option><option value="fixed">Công nợ cố định</option>
    </select></Row>
    {(mode === 'days' || mode === 'month') && (
      <Row label="Tính từ"><select className="select input" style={{ width: 320 }} value={rule.basis} onChange={(e) => set({ basis: e.target.value })}>
        <option value="receipt_date">Ngày nhận đủ hàng và hồ sơ hợp lệ</option><option value="invoice_date">Ngày hoá đơn</option><option value="order_date">Ngày đơn / phiếu</option>
      </select></Row>
    )}
    {mode === 'days' && <>
      <Row label="Số ngày"><Num width={60} value={rule.days} onChange={(n) => set({ days: n })} /></Row>
      <Row label="Loại ngày"><select className="select input" style={{ width: 320 }} value={dayType} onChange={(e) => set({ dayType: e.target.value, workingDays: e.target.value !== 'calendar' })}>
        <option value="working">Ngày làm việc (trừ T7, CN, lễ)</option><option value="working6">Ngày làm việc (chỉ trừ CN, lễ)</option><option value="calendar">Ngày lịch</option>
      </select></Row>
      <Row label="Chỉ trả vào ngày (trong tháng)"><input className="input" style={{ width: 160 }} value={(rule.payDays ?? []).join(', ')} placeholder="Ví dụ 5, 15, 25" onChange={(e) => { const d = e.target.value.split(/[,; ]+/).map(Number).filter((x) => x >= 1 && x <= 31); set({ payDays: d.length ? d : undefined }); }} /></Row>
    </>}
    {mode === 'month' && <Row label="Ngày N"><Num width={60} value={rule.monthDay} onChange={(n) => set({ monthDay: Math.min(31, Math.max(1, n)) })} /></Row>}
    <div className="muted" style={{ fontSize: 12 }}>Hạn rơi vào ngày nghỉ / lễ (khai ở Cài đặt mua hàng) thì tự sang ngày làm việc kế tiếp. Hoá đơn sai phải điều chỉnh: ghi ở phiếu nhập, hạn tự lùi đúng số ngày.</div>
  </>;
}

