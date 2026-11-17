// [2026-11-16 11:00 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: màn BH19 Điểm thành viên (đóng góp)
/** BH19 Điểm thành viên (NT-BH-020 kiểm 5): phát sinh điểm trong kỳ theo cửa hàng, số dư cuối kỳ theo hạng, danh sách khách. Chỉ xem. */
import { useState } from 'react';
import { DataGrid, ErrorBox, FilterLayout, KpiCards, Loading, PageHeader, PeriodField, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';

type Kinds = { earn: number; redeem: number; expire: number; reverse: number; adjust: number };
type Report = {
  from: string; to: string; total: Kinds; balance: number; customerCount: number;
  byBranch: (Kinds & { branchCode: string })[];
  byTier: { tierKey: string; tierName: string; customers: number; balance: number }[];
  customers: { customerCode: string; balance: number; tierName: string; period: Kinds }[];
};

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** Tiêu đề cột có chú thích rê chuột: nghĩa + cách tính (UI §7). */
const h = (label: string, tip: string) => <span title={tip}>{label}</span>;
const kindCols = <T extends Kinds>(): GridColumn<T>[] => [
  { key: 'earn', header: h('Tích', 'Điểm tích theo đơn bán (và số dư cũ nạp từ website)'), type: 'number', sum: true, width: 90 },
  { key: 'redeem', header: h('Đổi', 'Điểm khách đổi lấy quà / voucher (số âm)'), type: 'number', sum: true, width: 90 },
  { key: 'expire', header: h('Hết hạn', 'Phần còn lại của lô quá hạn, ghi hằng ngày (số âm)'), type: 'number', sum: true, width: 90 },
  { key: 'reverse', header: h('Hoàn khi trả hàng', 'Điểm đã tích của phần hàng khách trả (số âm)'), type: 'number', sum: true, width: 120 },
  { key: 'adjust', header: h('Điều chỉnh', 'Điều chỉnh tay'), type: 'number', sum: true, width: 100 },
];
const branchCols: GridColumn<Report['byBranch'][number]>[] = [
  { key: 'branchCode', header: h('Cửa hàng', 'Cửa hàng phát sinh; hết hạn / số dư cũ không gắn cửa hàng'), type: 'code', width: 110, value: (b) => b.branchCode || '(không theo cửa hàng)' },
  ...kindCols<Report['byBranch'][number]>(),
];
const tierCols: GridColumn<Report['byTier'][number]>[] = [
  { key: 'tierName', header: h('Hạng', 'Hạng theo tổng điểm đã tích (chính sách website)'), width: 140 },
  { key: 'customers', header: 'Số khách', type: 'number', sum: true, width: 90 },
  { key: 'balance', header: h('Điểm còn', 'Tổng số dư cuối kỳ của khách ở hạng này'), type: 'number', sum: true, width: 110 },
];
const customerCols: GridColumn<Report['customers'][number]>[] = [
  { key: 'customerCode', header: h('Mã khách', 'Mã đối tượng (máy bán: SĐT)'), type: 'code', width: 120 },
  { key: 'tierName', header: 'Hạng', width: 110 },
  { key: 'balance', header: h('Điểm còn', 'Số dư cuối kỳ = tổng mọi dòng sổ điểm tới hết ngày cuối kỳ'), type: 'number', sum: true, width: 100 },
  { key: 'earn', header: 'Tích trong kỳ', type: 'number', sum: true, width: 110, value: (c) => c.period.earn },
  { key: 'redeem', header: 'Đổi trong kỳ', type: 'number', sum: true, width: 110, value: (c) => c.period.redeem },
  { key: 'expire', header: 'Hết hạn trong kỳ', type: 'number', sum: true, width: 120, value: (c) => c.period.expire },
];

export function DiemThanhVienPage() {
  const today = vnToday();
  const [draft, setDraft] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [applied, setApplied] = useState(draft);
  const api = useApi();
  const q = useQuery({ queryKey: ['loyalty-report', applied], queryFn: () => api.get<Report>('/api/v1/m/loyalty/report', applied) });
  const d = q.data;
  return (
    <div>
      <PageHeader title="Điểm thành viên" code="BH19" subtitle="Sổ điểm thành viên: điểm tích, đổi, hết hạn, hoàn trong kỳ theo cửa hàng; số dư cuối kỳ theo hạng và theo khách. Chỉ xem — điểm chỉ hạch toán lúc đổi (trên chứng từ bán)." />
      <FilterLayout
        onSearch={() => setApplied(draft)}
        filters={<PeriodField from={draft.from} to={draft.to} onChange={(from, to) => setDraft({ from, to })} />}
      >
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : d && (
          <>
            <KpiCards items={[
              { key: 'b', label: `Điểm còn (${d.customerCount} khách)`, value: d.balance, tone: 'info' },
              { key: 'e', label: 'Tích trong kỳ', value: d.total.earn, tone: 'ok' },
              { key: 'r', label: 'Đổi trong kỳ', value: d.total.redeem, tone: 'warn' },
              { key: 'x', label: 'Hết hạn trong kỳ', value: d.total.expire },
            ]} />
            <h3 style={{ margin: '10px 0 4px' }}>Phát sinh theo cửa hàng</h3>
            <DataGrid rows={d.byBranch} columns={branchCols} rowKey={(x) => x.branchCode || '-'} storageKey="loyalty.cn" exportName="diem-thanh-vien-cua-hang" emptyText="Không có phát sinh trong kỳ" />
            <h3 style={{ margin: '10px 0 4px' }}>Số dư theo hạng</h3>
            <DataGrid rows={d.byTier} columns={tierCols} rowKey={(x) => x.tierKey} storageKey="loyalty.hang" />
            <h3 style={{ margin: '10px 0 4px' }}>Khách (500 khách điểm còn nhiều nhất)</h3>
            <DataGrid rows={d.customers} columns={customerCols} rowKey={(x) => x.customerCode} storageKey="loyalty.khach" exportName="diem-thanh-vien-khach" emptyText="Chưa có khách nào có điểm" />
          </>
        )}
      </FilterLayout>
    </div>
  );
}
