/**
 * TỔNG QUAN MUA HÀNG (MH00) — trang để thuyết trình: luồng, số liệu thật của phân hệ, và bảng 25 tình huống của tài liệu
 * yêu cầu (phép thử công thức chạy trực tiếp: đưa số liệu tài liệu vào bộ máy, so với con số tài liệu ghi).
 * Khối "Nạp dữ liệu tình huống" (cần mật khẩu) đưa 25 tình huống + ví dụ bổ sung vào sổ thật để thuyết trình / kiểm thử.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { runScenarios } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { KIND_LABEL, STATUS_LABEL, useMuaHang, vnd } from '../du-lieu';
import { NapDuLieu } from './NapDuLieu';
import '../mua-hang.css';

const FLOW: [string, string][] = [
  ['Chính sách', 'CK, bậc SL, KM, CKTT, hạn mức, hạn trả, giá cố định, thưởng, lô — khai một lần (MH04)'],
  ['Đơn đặt', 'Giữ hạn mức; ứng trước nếu NCC yêu cầu'],
  ['Nhập mua', 'Tự áp chính sách; cảnh báo giá / hạn mức / quà / lô / hoá đơn'],
  ['Duyệt', 'Vượt hạn mức thì chặn → duyệt ngoại lệ có lý do'],
  ['Sổ kế toán', 'Tự ghi bút toán, công nợ theo chứng từ, kho, sổ hoá đơn'],
  ['Cuối kỳ', 'Tính thưởng, phân bổ chi phí → giá vốn thực tế'],
];

export function TongQuanMuaPage() {
  const { data } = useMuaHang();
  const results = useMemo(() => runScenarios(), []);
  const tested = results.filter((r) => r.ok !== undefined);
  const docs = data?.docs ?? [];
  const approved = docs.filter((d) => d.status === 'approved');

  return (
    <>
      <PageHeader title="Tổng quan mua hàng" code="MH00" helpKey="mua-hang-tong-quan" subtitle="Luồng nghiệp vụ, số liệu phân hệ và 25 tình huống của tài liệu yêu cầu" />
      <div className="mh-flow">{FLOW.map(([t, d], i) => <div key={t}><b>{i + 1}. {t}</b>{d}</div>)}</div>
      <div className="kpis">
        <div className="card kpi"><div className="label">Chứng từ mua hàng</div><div className="value">{docs.length}</div><div className="hint">{approved.length} đã duyệt (đã vào sổ) · {docs.filter((d) => d.status === 'pending_approval').length} chờ duyệt</div></div>
        <div className="card kpi"><div className="label">Giá trị nhập đã duyệt</div><div className="value">{vnd(approved.filter((d) => d.kind === 'receipt').reduce((s, d) => s + d.totals.total, 0))}</div><div className="hint">gồm thuế</div></div>
        <div className="card kpi"><div className="label">Chính sách đang áp</div><div className="value">{data?.policies.filter((p) => p.isActive).length ?? 0}</div><div className="hint">chiết khấu, khuyến mại, hạn mức, hạn trả, thưởng, lô</div></div>
        <div className="card kpi"><div className="label">Phép thử 25 tình huống</div><div className={`value ${tested.every((r) => r.ok) ? 'mh-ok' : 'mh-bad'}`}>{tested.filter((r) => r.ok).length} / {tested.length} khớp</div><div className="hint">phần mềm tính lại theo số liệu tài liệu</div></div>
      </div>
      <NapDuLieu />
      {docs.some((d) => d.note?.startsWith('VD')) && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-head" style={{ padding: '8px 12px', fontWeight: 700 }}>Ví dụ bổ sung ngoài tài liệu</div>
          <div className="table-wrap" style={{ maxHeight: 'none' }}><table className="grid"><thead><tr><th style={{ width: 110 }}>Số phiếu</th><th style={{ width: 120 }}>Loại</th><th>Ví dụ</th><th style={{ width: 90 }}>Trạng thái</th><th style={{ width: 80 }} /></tr></thead><tbody>
            {docs.filter((d) => d.note?.startsWith('VD')).sort((a, b) => (a.note ?? '').localeCompare(b.note ?? '', 'vi', { numeric: true })).map((d) => (
              <tr key={d.id}><td className="mono">{d.docNo}</td><td>{d.kind === 'rebate' && !d.rebate ? 'Chiết khấu sau mua' : KIND_LABEL[d.kind]}</td><td style={{ fontSize: 12.5 }}>{d.note}</td><td>{STATUS_LABEL[d.status]}</td><td><Link className="btn btn-xs" to={`/mua-hang/chung-tu?mo=${encodeURIComponent(d.docNo)}`}>Mở phiếu</Link></td></tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      <div className="card">
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="grid">
            <thead><tr><th style={{ width: 44 }}>TH</th><th style={{ width: 260 }}>Tình huống</th><th>Phần mềm làm gì</th><th style={{ width: 240 }}>Tài liệu ghi</th><th style={{ width: 300 }}>Phần mềm tính ra</th><th style={{ width: 60 }}>Khớp</th><th style={{ width: 70 }} /></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.th}>
                  <td><b>{r.th}</b></td>
                  <td>{r.title}{r.side === 'ban' && <div><span className="badge badge-gray">phía bán</span></div>}</td>
                  <td style={{ fontSize: 12.5 }}>{r.how}</td>
                  <td style={{ fontSize: 12.5 }}>{r.expected ?? <span className="muted">báo cáo có sẵn</span>}</td>
                  <td style={{ fontSize: 12.5 }}>{r.result || <span className="muted">—</span>}</td>
                  <td style={{ textAlign: 'center' }}>{r.ok === undefined ? <span className="muted">—</span> : r.ok ? <span className="mh-ok">✓</span> : <span className="mh-bad">✗</span>}</td>
                  <td><Link className="btn btn-xs" to={r.path}>Mở màn</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
