/**
 * Add-in Bảng tính AI: nhúng ứng dụng bảng tính chạy riêng và chuẩn bị bộ số liệu để nạp vào.
 * Khi chưa cấu hình địa chỉ ứng dụng, hiện bộ số liệu dạng bảng để sao chép sang Excel.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DateRange } from '@/components/filters';
import { ErrorBox, Loading } from '@/components/ui';

export function SpreadsheetAiPage() {
  const [range, setRange] = useState({ from: defaultFrom(), to: defaultTo() });
  const cfg = useQuery({ queryKey: ['addin-sai-config'], queryFn: () => api.get<{ url: string; configured: boolean }>('/api/v1/addins/spreadsheet-ai/config') });
  const ds = useQuery({
    queryKey: ['addin-sai-dataset', range],
    queryFn: () => api.get<{ columns: string[]; rows: (string | number)[][] }>('/api/v1/addins/spreadsheet-ai/dataset', { kind: 'trial-balance', ...range }),
  });

  const copyTsv = async () => {
    if (!ds.data) return;
    const tsv = [ds.data.columns, ...ds.data.rows].map((r) => r.join('\t')).join('\n');
    await navigator.clipboard.writeText(tsv);
  };

  return (
    <>
      <PageHeader title="Bảng tính AI" code="TI01" subtitle="Phân tích số liệu kế toán trong bảng tính có trợ lý AI" helpKey="bang-tinh-ai"
        actions={<button className="btn" onClick={copyTsv} disabled={!ds.data}><Copy size={16} /> Sao chép số liệu</button>} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="filters" style={{ borderBottom: 0 }}>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <span className="muted" style={{ marginBottom: 8 }}>Bộ số liệu: cân đối số phát sinh {ds.data ? `(${ds.data.rows.length} tài khoản)` : ''}</span>
        </div>
      </div>
      <ErrorBox error={cfg.error ? errorText(cfg.error) : ds.error ? errorText(ds.error) : null} />
      {cfg.isLoading ? <Loading /> : cfg.data?.configured ? (
        <div className="card" style={{ height: 'calc(100vh - 260px)' }}>
          <iframe title="Bảng tính AI" src={cfg.data.url} style={{ width: '100%', height: '100%', border: 0, borderRadius: 8 }} />
        </div>
      ) : (
        <div className="card">
          <div className="alert alert-info" style={{ margin: 12 }}>
            Chưa cấu hình ứng dụng Bảng tính AI (biến môi trường <code>SPREADSHEET_AI_URL</code>). Trong lúc chờ, bấm "Sao chép số liệu" rồi dán vào Excel.
          </div>
          {ds.data && (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr>{ds.data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{ds.data.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? c.toLocaleString('vi-VN') : c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
