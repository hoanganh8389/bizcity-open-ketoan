/**
 * BIẾN THỂ MẶT HÀNG (MH26) — mã con = mã gốc + đuôi (Q kẹp quà, Z, K, M, T, B…). Chọn đuôi nào khi PHÂN TÍCH ĐẶT HÀNG (MH02)
 * được TÁCH RIÊNG thành dòng độc lập (đặt riêng), đuôi nào GỘP vào mã gốc (cộng dồn tồn, max, bán, đi đường, đơn đang đặt).
 * Mặc định tách riêng Q, T. Lưu xong, MH02 / đơn đặt tính theo cấu hình mới ngay.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P } from '../du-lieu';
import '../mua-hang.css';

interface SuffixRow { suffix: string; label: string; count: number; samples: { sku: string; name: string; parentSku: string }[]; separate: boolean }
interface VariantKind { code: string; name: string; legacySuffix: string; taxFlow: string; taxSku: string; note: string; products: number }

// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: bảng biến thể thay chữ cuối mã, chỉ đọc (đóng góp)
const TAX_FLOW: Record<string, string> = { invoice: 'Theo hoá đơn', never: 'Không bao giờ', undecided: 'Chưa quyết định' };
const TAX_SKU: Record<string, string> = { self: 'Chính nó', parent: 'Mã cha', invoice: 'Theo hoá đơn', none: 'Không sang' };

/** Biến thể thay cho chữ cuối mã. Chỉ đọc: tới giai đoạn phần mềm xử lý theo ô mới có hiệu lực. */
function BangBienThe() {
  const q = useQuery({ queryKey: ['variant-kinds'], queryFn: () => api.get<VariantKind[]>('/api/v1/items/variant-kinds') });
  return (
    <section className="mh-panel" style={{ marginBottom: 12 }}>
      <b style={{ fontSize: 14 }}>Biến thể thay cho chữ cuối mã</b>
      <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>Phần mềm đã tự điền theo đuôi mã. Hiện vẫn xử lý theo đuôi, các cột cách xử lý chỉ để đối chiếu.</div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>
            <th title="Tên biến thể, chọn ở mặt hàng">Biến thể</th>
            <th title="Đuôi mã cũ có cùng ý nghĩa">Đuôi cũ</th>
            <th className="num" title="Số mặt hàng đang mang biến thể này">Số mã</th>
            <th title="Hàng có được đưa sang dữ liệu thuế không">Sang thuế</th>
            <th title="Khi sang thuế thì ghi theo mã nào">Mã khi sang thuế</th>
            <th title="Giải thích ngắn">Ghi chú</th>
          </tr></thead>
          <tbody>
            {(q.data ?? []).map((k) => (
              <tr key={k.code}>
                <td><b>{k.name}</b></td>
                <td className="mono">{k.legacySuffix}</td>
                <td className="num">{k.products.toLocaleString('vi-VN')}</td>
                <td className={k.taxFlow === 'never' ? 'neg' : ''}>{TAX_FLOW[k.taxFlow] ?? k.taxFlow}</td>
                <td>{TAX_SKU[k.taxSku] ?? k.taxSku}</td>
                <td className="muted" style={{ fontSize: 12 }}>{k.note}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

export function BienTheMatHangPage() {
  const q = useQuery({ queryKey: ['mua-hang', 'variants'], queryFn: () => api.get<{ separate: string[]; suffixes: SuffixRow[] }>(`${P}/variants`) });
  const [sep, setSep] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setSep(q.data.separate); }, [q.data]);
  const dirty = Boolean(sep && q.data && [...sep].sort().join() !== [...q.data.separate].sort().join());
  const toggle = (s: string, separate: boolean) => setSep((cur) => (cur ? (separate ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)) : cur));
  const save = async () => {
    if (!sep) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.put<{ separate: string[] }>(`${P}/variants`, { separate: sep });
      setMsg({ ok: true, text: `Đã lưu. Phân tích đặt hàng (MH02) tách riêng: ${r.separate.join(', ') || '(không đuôi nào — gộp hết vào mã gốc)'}.` });
      await q.refetch();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Biến thể mặt hàng" code="MH26" helpKey="mua-hang-bien-the"
        subtitle="Mã con = mã gốc + đuôi (Q, Z, K, M, T…). Chọn đuôi nào khi phân tích đặt hàng được tách riêng để đặt riêng, đuôi nào gộp vào mã gốc."
        actions={<>
          {dirty && <button className="btn" disabled={busy} onClick={() => setSep(q.data!.separate)}>Bỏ thay đổi</button>}
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
        </>} />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 0 8px' }}>{msg.text}</div>}
      <BangBienThe />
      {!q.data || !sep ? <Loading /> : (
        <section className="mh-panel">
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <b>Gộp vào mã gốc</b>: phân tích đặt hàng cộng dồn tồn, max, bán, hàng đi đường, đơn đang đặt của mã con vào mã gốc (hàng con còn nhiều thì không đặt thêm mã gốc).
            {' '}<b>Tách riêng</b>: mã con thành một dòng riêng trong phân tích, đặt riêng (vd hàng kẹp quà Q đặt riêng với hàng thường).
          </div>
          <div className="table-wrap"><table className="grid">
            <thead><tr><th title="Phần thêm sau mã gốc để ra mã con, vd 110154035Q">Đuôi</th><th title="Loại hàng của đuôi theo quy tắc mã hàng">Ý nghĩa</th><th className="num" title="Số mặt hàng trong danh mục có mã cha và mang đuôi này">Số mã con</th><th title="Vài mã con ← mã gốc của nó">Ví dụ</th><th title="Gộp vào mã gốc: cộng dồn số của mã con vào mã gốc. Tách riêng: mã con là một dòng riêng, đặt riêng">Khi phân tích đặt hàng</th></tr></thead>
            <tbody>
              {q.data.suffixes.map((r) => {
                const on = sep.includes(r.suffix);
                return (
                  <tr key={r.suffix} className={on ? 'mh-row-pick' : ''}>
                    <td className="mono"><b>{r.suffix}</b></td>
                    <td>{r.label}</td>
                    <td className="num">{r.count.toLocaleString('vi-VN')}</td>
                    <td style={{ fontSize: 12 }}>{r.samples.length ? r.samples.map((x) => <div key={x.sku}><span className="mono">{x.sku}</span> ← <span className="mono">{x.parentSku}</span> <span className="muted">{x.name}</span></div>) : <span className="muted">chưa có mã</span>}</td>
                    <td>
                      <select className="select input" style={{ width: 170 }} value={on ? 'sep' : 'merge'} onChange={(e) => toggle(r.suffix, e.target.value === 'sep')}>
                        <option value="merge">Gộp vào mã gốc</option>
                        <option value="sep">Tách riêng</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
