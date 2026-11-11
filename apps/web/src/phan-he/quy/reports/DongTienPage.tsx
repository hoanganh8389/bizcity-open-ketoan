// [2026-11-11 Nguyễn Văn Thủy] Báo cáo Dòng tiền theo mục thu / chi (ACC98) (đóng góp)
/**
 * DÒNG TIỀN (ACC98): A Tiền tồn đầu kỳ (tiền mặt, tiền gửi) · B Thực thu theo mục thu · C Thực chi theo mục chi · D Tiền tồn cuối kỳ;
 *   hai cột Kỳ trước (khoảng ngày liền trước, cùng độ dài) và Kỳ này.
 * Mục thu / chi: danh mục DM17 (cây THU / CHI), mục cha cộng các mục con; dòng tiền chưa gán mục hiện ở dòng "Chưa gán mục".
 *   Mục thu: thu − chi của mục; mục chi: chi − thu (phiếu sửa / đảo trong mục tự bù trừ) → D = A + B − C.
 * Số liệu: /reports/cash-balances (tồn đầu, cuối của 111, 112, 113) + /reports/cash-items (thu, chi theo mục).
 */
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultTo, kyText, periodFrom } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange, useBranches } from '@/components/filters';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { useDimension } from '@/components/voucher/lookups';

interface Bal { rows: { accountCode: string; opening: number; closing: number }[] }
interface Items { rows: { item: string; thu: number; chi: number }[] }
interface Row { key: string; code: string; name: string; level: number; bold?: boolean; prev: number; cur: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Kỳ trước: liền trước kỳ này, cùng số ngày; kỳ là trọn tháng thì lùi đúng số tháng. */
function previous(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00`); const t = new Date(`${to}T00:00:00`);
  const wholeMonths = f.getDate() === 1 && new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() === t.getDate();
  if (wholeMonths) {
    const n = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1;
    return { from: iso(new Date(f.getFullYear(), f.getMonth() - n, 1)), to: iso(new Date(f.getFullYear(), f.getMonth(), 0)) };
  }
  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000);
  const pt = new Date(f.getTime() - 86_400_000);
  return { from: iso(new Date(pt.getTime() - days * 86_400_000)), to: iso(pt) };
}
const CASH = [['111', 'Tiền mặt'], ['112', 'Tiền gửi ngân hàng'], ['113', 'Tiền đang chuyển']] as const;

export function DongTienPage() {
  const multi = (useBranches().data?.length ?? 0) > 1;
  const [f, setF] = useState({ from: periodFrom(), to: defaultTo(), branchCodes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const pv = previous(f.from, f.to);
  const kys = [pv, { from: f.from, to: f.to }];
  const qs = useQueries({ queries: kys.flatMap((k) => [
    { queryKey: ['cash-balances', 'dong-tien', k, f.branchCodes], queryFn: () => api.get<Bal>('/api/v1/reports/cash-balances', { ...k, branchCodes: f.branchCodes }) },
    { queryKey: ['cash-items', k, f.branchCodes], queryFn: () => api.get<Items>('/api/v1/reports/cash-items', { ...k, branchCodes: f.branchCodes }) },
  ]) });
  const dims = useDimension('cash_item') as { code: string; name: string; parentCode?: string | null }[];
  const loading = qs.some((q) => q.isLoading);
  const error = qs.find((q) => q.error)?.error;
  const bal = [qs[0]?.data as Bal | undefined, qs[2]?.data as Bal | undefined];
  const items = [qs[1]?.data as Items | undefined, qs[3]?.data as Items | undefined];

  const rows: Row[] = [];
  if (!loading && bal[1]) {
    const parent = new Map(dims.map((d) => [d.code, d.parentCode ?? '']));
    const rootOf = (c: string) => { let x = c; for (let i = 0; i < 10 && parent.get(x); i++) x = parent.get(x)!; return x; };
    const sumBal = (k: 0 | 1, p: string, side: 'opening' | 'closing') => r2((bal[k]?.rows ?? []).filter((r) => r.accountCode.startsWith(p)).reduce((s, r) => s + r[side], 0));
    const cashLines = (side: 'opening' | 'closing') => CASH.filter(([p]) => sumBal(0, p, side) || sumBal(1, p, side))
      .map(([p, n], i): Row => ({ key: `${side}-${p}`, code: String(i + 1), name: n, level: 1, prev: sumBal(0, p, side), cur: sumBal(1, p, side) }));
    /** Số của một mục (kể cả mục con) ở kỳ k: mục thu = thu − chi, mục chi = chi − thu. */
    const amount = (k: 0 | 1, code: string, root: 'THU' | 'CHI') => r2((items[k]?.rows ?? [])
      .filter((r) => r.item && (r.item === code || (() => { for (let x = parent.get(r.item) ?? '', i = 0; x && i < 10; x = parent.get(x) ?? '', i++) if (x === code) return true; return false; })()))
      .reduce((s, r) => s + (root === 'THU' ? r.thu - r.chi : r.chi - r.thu), 0));
    const unassigned = (k: 0 | 1, root: 'THU' | 'CHI') => r2((items[k]?.rows ?? []).filter((r) => !r.item || !parent.has(r.item) || (rootOf(r.item) !== 'THU' && rootOf(r.item) !== 'CHI'))
      .reduce((s, r) => s + (root === 'THU' ? r.thu : r.chi), 0));
    /** Cây mục dưới gốc, theo thứ tự mã; chỉ mục có số ở một trong hai kỳ. */
    const tree = (root: 'THU' | 'CHI'): Row[] => {
      const out: Row[] = [];
      const walk = (p: string, level: number) => {
        for (const d of dims.filter((x) => (x.parentCode ?? '') === p).sort((a, b) => a.code.localeCompare(b.code))) {
          const prev = amount(0, d.code, root); const cur = amount(1, d.code, root);
          if (!prev && !cur) continue;
          const hasKids = dims.some((x) => x.parentCode === d.code);
          out.push({ key: `${root}-${d.code}`, code: d.code, name: d.name, level, bold: hasKids, prev, cur });
          walk(d.code, level + 1);
        }
      };
      walk(root, 1);
      const u0 = unassigned(0, root); const u1 = unassigned(1, root);
      if (u0 || u1) out.push({ key: `${root}-none`, code: '', name: root === 'THU' ? '(Chưa gán mục thu)' : '(Chưa gán mục chi)', level: 1, prev: u0, cur: u1 });
      return out;
    };
    const total = (rs: Row[]) => rs.filter((r) => r.level === 1);
    const thu = tree('THU'); const chi = tree('CHI');
    const sum = (rs: Row[], k: 'prev' | 'cur') => r2(total(rs).reduce((s, r) => s + r[k], 0));
    const open = cashLines('opening'); const close = cashLines('closing');
    rows.push({ key: 'A', code: 'A', name: 'Tiền tồn đầu kỳ', level: 0, bold: true, prev: sum(open, 'prev'), cur: sum(open, 'cur') }, ...open);
    rows.push({ key: 'B', code: 'B', name: 'Thực thu', level: 0, bold: true, prev: sum(thu, 'prev'), cur: sum(thu, 'cur') }, ...thu);
    rows.push({ key: 'C', code: 'C', name: 'Thực chi', level: 0, bold: true, prev: sum(chi, 'prev'), cur: sum(chi, 'cur') }, ...chi);
    rows.push({ key: 'D', code: 'D', name: 'Tiền tồn cuối kỳ', level: 0, bold: true, prev: sum(close, 'prev'), cur: sum(close, 'cur') }, ...close);
  }
  const columns: Column<Row>[] = [
    { key: 'code', header: 'Mã mục thu/chi', type: 'code', width: 130, noSort: true, render: (r) => <span style={{ paddingLeft: Math.max(r.level - 1, 0) * 14 }}>{r.bold ? <b>{r.code}</b> : r.code}</span> },
    { key: 'name', header: 'Tên mục thu/chi', width: 360, noSort: true, render: (r) => <span style={{ paddingLeft: Math.max(r.level - 1, 0) * 14 }}>{r.bold ? <b>{r.name}</b> : r.name}</span> },
    { key: 'prev', header: 'Kỳ trước', type: 'money', width: 160, noSort: true, title: `${kyText(pv.from, pv.to)}`, bold: (r) => Boolean(r.bold) },
    { key: 'cur', header: 'Kỳ này', type: 'money', width: 160, noSort: true, title: kyText(f.from, f.to), bold: (r) => Boolean(r.bold) },
  ];
  return (
    <>
      <PageHeader title="Dòng tiền" code="ACC98" subtitle="Tiền tồn đầu kỳ, thực thu theo mục thu, thực chi theo mục chi, tiền tồn cuối kỳ — kỳ trước và kỳ này" helpKey="so-quy" />
      <FilterLayout boThamSo={{ value: f, onApply: setF }}
        filters={<><DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />{multi && <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />}</>}>
        <div className="card">
          <div className="rp-tieu-de"><h2>DÒNG TIỀN</h2><i>{kyText(f.from, f.to)}</i></div>
          <ErrorBox error={error ? errorText(error) : null} />
          {loading ? <Loading /> : !rows.length ? <Empty /> : (
            <DataGrid storageKey="acc98" rows={rows} rowKey={(r) => r.key} columns={columns} footerLabel={false} rowClassName={(r) => (r.level === 0 ? 'bold' : '')}
              exportName="dong-tien" exportTitle={`Dòng tiền — ${kyText(f.from, f.to)}`} />
          )}
        </div>
      </FilterLayout>
    </>
  );
}
