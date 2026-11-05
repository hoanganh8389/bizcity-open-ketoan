// [2026-11-05 09:30 PM Nguyễn Văn Thủy] PHASE-026 — màn Công thức giá vốn: công thức của bản cài đang chạy, so hai dữ liệu, tính thử (đóng góp)
/**
 * CÔNG THỨC GIÁ VỐN (ACC49A). Chỉ đọc: BOOK_MODE của bản cài chọn công thức, không chọn trên màn hình.
 * Công thức đọc từ @ketoan/contracts, cùng nguồn với lúc tính giá vốn.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { COST_FORMULAS, returnValueAtOpening, type CostBook, type CostFormula } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';

interface FormulaInfo { book: CostBook; branches: number; withUnit: number; units: number }
const money = (v: number) => Math.round(v).toLocaleString('vi-VN');

function FormulaCard({ f, active }: { f: CostFormula; active: boolean }) {
  return (
    <div className="card card-body" style={active ? { borderColor: 'var(--primary, #2563eb)', borderWidth: 2 } : undefined}>
      <h3 style={{ marginTop: 0 }} title={f.scope}>{f.label}{active ? ' · bản cài đang chạy' : ''}</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{f.scope}</div>
      <div className="mono" style={{ fontSize: 13 }} title="Đơn giá vốn của một mã hàng, một chi nhánh, một tháng">
        <div>{f.numerator}</div>
        <div style={{ borderTop: '1px solid currentColor', margin: '4px 0' }} />
        <div>{f.denominator}</div>
      </div>
      <p style={{ fontSize: 13, marginBottom: 4 }}><b>Hàng mua trả lại:</b> {f.returnRule}</p>
      <p style={{ fontSize: 13, marginTop: 0 }}><b>Nhập điều chỉnh:</b> {f.adjustRule}</p>
    </div>
  );
}

function ReasonTable({ title, f }: { title: string; f: CostFormula['inReasons'] }) {
  return (
    <div>
      <h4 style={{ margin: '8px 0 4px' }}>{title}</h4>
      <table className="grid">
        <thead><tr><th style={{ width: 90 }} title="Mã lý do trên phiếu">Lý do</th><th>Tên</th><th title="Số liệu đưa vào công thức">Căn cứ tính</th></tr></thead>
        <tbody>{f.map((r) => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.basis}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Tính thử một phiếu trả nhà cung cấp theo hai công thức. */
function TinhThu() {
  const [v, setV] = useState({ oq: 10, ov: 1_000_000, q: 5, a: 400_000 });
  const num = (k: keyof typeof v, label: string, hint: string) => (
    <label style={{ display: 'grid', gap: 2, fontSize: 13 }} title={hint}>{label}
      <input className="input" type="number" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(0, Number(e.target.value)) })} />
    </label>
  );
  const unitLeft = (out: number) => (v.oq - v.q > 0 ? (v.ov - out) / (v.oq - v.q) : null);
  const noiBo = v.a;
  const thue = returnValueAtOpening(v.q, v.a, v.oq, v.ov);
  const row = (name: string, out: number, title: string) => {
    const u = unitLeft(out);
    return <tr title={title}><td>{name}</td><td className="num">{money(out)}</td><td className="num">{u === null ? '—' : money(u)}</td></tr>;
  };
  return (
    <div className="card card-body">
      <h3 style={{ marginTop: 0 }}>Tính thử hàng trả nhà cung cấp</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
        {num('oq', 'Số lượng tồn đầu', 'Số lượng tồn cuối tháng trước')}
        {num('ov', 'Giá trị tồn đầu', 'Giá trị tồn cuối tháng trước (đồng)')}
        {num('q', 'Số lượng trả', 'Số lượng trên phiếu trả nhà cung cấp')}
        {num('a', 'Thành tiền − thuế', 'Tiền trên phiếu trả, đã trừ thuế (đồng)')}
      </div>
      <table className="grid">
        <thead><tr><th>Công thức</th><th className="num" title="Giá trị trừ khỏi tử số của công thức">Giá trị trừ</th><th className="num" title="(Giá trị tồn đầu − giá trị trừ) ÷ (số lượng tồn đầu − số lượng trả)">Đơn giá còn lại</th></tr></thead>
        <tbody>
          {row('Nội bộ', noiBo, 'Mọi lý do: thành tiền − thuế')}
          {row('Thuế (XTR1, XTR9)', thue, 'Đơn giá trả ≤ đơn giá tồn đầu: theo đơn giá tồn đầu. Tiền trả ≤ giá trị tồn đầu: theo tiền trả. Số lượng trả ≤ tồn đầu: giá trị tồn đầu. Còn lại: giá trị tồn đầu + phần vượt × đơn giá trả.')}
        </tbody>
      </table>
    </div>
  );
}

export function CongThucGiaVonPage() {
  const info = useQuery({ queryKey: ['costing-formula'], queryFn: () => api.get<FormulaInfo>('/api/v1/inventory/costing/formula') });
  if (info.isLoading) return <Loading />;
  if (info.error) return <ErrorBox error={errorText(info.error)} />;
  const d = info.data!;
  const active = COST_FORMULAS[d.book];
  return (
    <div>
      <PageHeader title="Công thức giá vốn" code="ACC49A" subtitle="Bình quân gia quyền theo tháng, theo từng mã hàng, từng chi nhánh" helpKey="cong-thuc-gia-von" />
      {d.withUnit < d.branches && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          {d.branches - d.withUnit} / {d.branches} chi nhánh chưa gán đơn vị hạch toán. Các chi nhánh này đang dùng chung một đơn giá, chưa tính riêng theo chi nhánh.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, marginBottom: 12 }}>
        {(['internal', 'tax'] as const).map((b) => <FormulaCard key={b} f={COST_FORMULAS[b]} active={b === d.book} />)}
      </div>
      <div style={{ marginBottom: 12 }}><TinhThu /></div>
      <div className="card card-body">
        <h3 style={{ marginTop: 0 }}>Danh sách lý do · {active.label}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
          <ReasonTable title="Phiếu nhập" f={active.inReasons} />
          <ReasonTable title="Phiếu hàng mua trả lại" f={active.returnReasons} />
        </div>
      </div>
    </div>
  );
}
