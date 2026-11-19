// [2026-11-18 Nguyễn Văn Thủy] Công nợ theo hợp đồng (MH30): sổ tổng hợp + sổ chi tiết công nợ phải trả theo hợp đồng (đóng góp)
/**
 * CÔNG NỢ THEO HỢP ĐỒNG (MH30) — đọc thẳng sổ cái TK 331 có mã hợp đồng (bút toán của chứng từ thuộc hợp đồng tự mang mã):
 *   Tổng hợp: mỗi hợp đồng một dòng — số dư đầu kỳ, phát sinh Nợ / Có, số dư cuối kỳ (Nợ / Có);
 *   Chi tiết: từng bút toán trong kỳ, số còn phải trả luỹ kế theo hợp đồng.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DateRange } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';
import { ListPicker, PartnerPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { purchaseApi, today, type ContractDebtLine, type ContractDebtRow } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

export function CongNoHopDongPage() {
  const [params] = useSearchParams();
  const [kind, setKind] = useState<'tong-hop' | 'chi-tiet'>(params.get('hd') ? 'chi-tiet' : 'tong-hop');
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  const [ncc, setNcc] = useState('');
  const [hd, setHd] = useState(params.get('hd') ?? '');
  const contracts = useQuery({ queryKey: ['mua-hang', 'contracts', ''], queryFn: () => purchaseApi.contracts(), staleTime: 60_000 }).data ?? [];
  const q = useQuery({ queryKey: ['mua-hang', 'contract-debts', from, to, ncc, hd, kind], queryFn: () => purchaseApi.contractDebts({ from, to, partnerCode: ncc || undefined, contractCode: hd || undefined, detail: kind === 'chi-tiet' }) });
  const sumCols: Column<ContractDebtRow>[] = [
    { key: 'contractCode', header: 'Số hợp đồng', type: 'code', width: 170, bold: true },
    { key: 'contractName', header: 'Tên hợp đồng', width: 220 },
    { key: 'partnerCode', header: 'Mã NCC', type: 'code', width: 100 },
    { key: 'partnerName', header: 'Nhà cung cấp', width: 220 },
    { key: 'openDebit', header: 'Đầu kỳ Nợ', type: 'money', width: 120, sum: true, title: 'Số dư Nợ TK 331 trước ngày đầu kỳ (đã trả / ứng trước nhiều hơn nợ)' },
    { key: 'openCredit', header: 'Đầu kỳ Có', type: 'money', width: 120, sum: true, title: 'Số dư Có TK 331 trước ngày đầu kỳ (còn phải trả)' },
    { key: 'debit', header: 'Phát sinh Nợ', type: 'money', width: 120, sum: true, title: 'Trả tiền, trả hàng, chiết khấu, thưởng giảm nợ trong kỳ' },
    { key: 'credit', header: 'Phát sinh Có', type: 'money', width: 120, sum: true, title: 'Mua hàng, chi phí mua ghi nợ trong kỳ' },
    { key: 'closeDebit', header: 'Cuối kỳ Nợ', type: 'money', width: 120, sum: true },
    { key: 'closeCredit', header: 'Cuối kỳ Có', type: 'money', width: 120, sum: true, title: 'Còn phải trả theo hợp đồng' },
  ];
  const detCols: Column<ContractDebtLine>[] = [
    { key: 'contractCode', header: 'Số hợp đồng', type: 'code', width: 160 },
    { key: 'partnerName', header: 'Nhà cung cấp', width: 200 },
    { key: 'date', header: 'Ngày', width: 90, value: (r) => dmy(r.date) },
    { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 120 },
    { key: 'description', header: 'Diễn giải', width: 280 },
    { key: 'account', header: 'TK', type: 'code', width: 70 },
    { key: 'debit', header: 'Nợ', type: 'money', width: 120, sum: true },
    { key: 'credit', header: 'Có', type: 'money', width: 120, sum: true },
    { key: 'balance', header: 'Còn phải trả', type: 'money', width: 130, title: 'Số dư luỹ kế theo hợp đồng sau bút toán này (dương = còn phải trả)' },
  ];
  return (
    <>
      <PageHeader title="Công nợ theo hợp đồng" code="MH30" helpKey="mua-hang-hop-dong" subtitle="Công nợ phải trả nhà cung cấp theo từng hợp đồng mua — tổng hợp và chi tiết" />
      <div className="card">
        <div className="row" style={{ gap: 8, padding: '8px 12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${kind === 'tong-hop' ? 'active' : ''}`} onClick={() => setKind('tong-hop')}>Sổ tổng hợp</button>
            <button className={`tab ${kind === 'chi-tiet' ? 'active' : ''}`} onClick={() => setKind('chi-tiet')}>Sổ chi tiết</button>
          </div>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          <div style={{ width: 240 }}><PartnerPicker value={ncc} kind="supplier" onChange={(c) => { setNcc(c); setHd(''); }} placeholder="Tất cả nhà cung cấp" /></div>
          <div style={{ width: 240 }}><ListPicker items={contracts.filter((c) => !ncc || c.partnerCode === ncc).map((c) => ({ code: c.code, name: `${c.partnerName} · ${c.statusText}` }))} value={hd} onChange={setHd} placeholder="Tất cả hợp đồng" /></div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {!q.data ? <Loading /> : kind === 'tong-hop'
          ? <DataGrid storageKey="mh-cong-no-hd" rows={q.data.rows} rowKey={(r) => r.contractCode} columns={sumCols} footerLabel="Cộng" exportName="tong-hop-cong-no-theo-hop-dong" exportTitle="SỔ TỔNG HỢP CÔNG NỢ THEO HỢP ĐỒNG"
              onRowDoubleClick={(r) => { setHd(r.contractCode); setKind('chi-tiet'); }} emptyText="Không có công nợ theo hợp đồng trong kỳ" />
          : <DataGrid storageKey="mh-cong-no-hd-ct" rows={q.data.lines} rowKey={(r) => `${r.contractCode}|${r.docNo}|${r.date}|${r.account}|${r.debit}|${r.credit}|${r.balance}`} columns={detCols} footerLabel="Cộng" exportName="chi-tiet-cong-no-theo-hop-dong" exportTitle="SỔ CHI TIẾT CÔNG NỢ THEO HỢP ĐỒNG" emptyText="Không có bút toán trong kỳ" />}
      </div>
    </>
  );
}
