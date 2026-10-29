/**
 * Kết nối hệ thống khác ở trạm ACC14:
 *   ConnectionsModal — khai các hệ thống nguồn (đầu chuẩn của hệ thống bán hàng, WooCommerce…), thử kết nối;
 *   PullModal        — kéo chứng từ của các kết nối đang bật trong khoảng ngày về thẻ Chờ định khoản;
 *   useConnections   — danh sách kết nối (lọc theo Nguồn, tên nguồn trong bảng).
 * Đầu chuẩn hệ thống nguồn phải dựng: docs/cong-ket-noi.md.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, Plus, Trash2 } from 'lucide-react';
import { CONNECTION_KINDS, CONNECTION_KIND_TEXT, type Connection, type ConnectionView, type PullResult } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Modal } from '@/components/ui';
import { dateTimeShort } from '@/components/voucher/VoucherListPage';

export const useConnections = () => useQuery({ queryKey: ['connections'], queryFn: () => api.get<ConnectionView[]>('/api/v1/connections'), staleTime: 30_000 }).data ?? [];

const blank = (): Connection => ({ code: '', name: '', kind: 'standard', url: '', apiKey: '', apiSecret: '', branchCode: '', taxCode: 'KCT', methodMap: {}, enabled: true, primary: false, note: '' });

export function ConnectionsModal({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['connections'], queryFn: () => api.get<ConnectionView[]>('/api/v1/connections') });
  const [draft, setDraft] = useState<Connection[] | null>(null);
  const [tested, setTested] = useState<Record<string, string>>({});
  const list = draft ?? (q.data ?? []).map(({ lastPull: _l, ...c }) => c);
  const put = (i: number, patch: Partial<Connection>) => setDraft(list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const save = useMutation({
    mutationFn: () => api.put<ConnectionView[]>('/api/v1/connections', { connections: list }),
    onSuccess: () => { setDraft(null); void qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
  const test = useMutation({
    mutationFn: (code: string) => api.post<{ ok: boolean; message: string }>(`/api/v1/connections/${code}/test`),
    onSuccess: (r, code) => setTested((t) => ({ ...t, [code]: `${r.ok ? '✓' : '✗'} ${r.message}` })),
  });
  return (
    <Modal wide title="Kết nối hệ thống khác" onClose={onClose}
      footer={<>{canEdit && <button className="btn btn-primary" disabled={!draft || save.isPending} onClick={() => save.mutate()}>Ghi</button>}<button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="full muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Phiếu mua, bán, chuyển kho, điều chỉnh lập ở hệ thống bán hàng. Trạm này kéo các phiếu đang chờ đẩy sang qua API của từng hệ thống,
        lưu ở thẻ <b>Chờ định khoản</b> để xem trước rồi định khoản. Mã kết nối là <b>Nguồn</b> của chứng từ.
        <b> Đầu chuẩn</b>: đường dẫn cổng của hệ thống bán hàng + khoá (Bearer). <b>WooCommerce</b>: địa chỉ cửa hàng + consumer key / secret, chi nhánh nhận đơn.
        <b> Đổi hình thức</b>: hình thức thanh toán bên nguồn đặt tên khác danh mục thì khai <span className="mono">MÃ NGUỒN=MÃ HÌNH THỨC</span>, mỗi dòng một cặp.
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
      <table className="grid full">
        <thead><tr><th>Mã</th><th>Tên</th><th>Kiểu</th><th>Đường dẫn</th><th>Khoá</th><th>Khoá bí mật</th><th>Chi nhánh</th><th>Loại thuế</th><th title="Mã hình thức thanh toán bên nguồn = mã đã khai ở Hình thức thanh toán, mỗi dòng một cặp">Đổi hình thức</th><th>Bật</th><th title="Kết nối chính tới hệ thống bán hàng: danh mục Chi nhánh hiện website đang nối với từng chi nhánh qua kết nối này">Chính</th><th>Lần kéo gần nhất</th><th /></tr></thead>
        <tbody>
          {list.map((c, i) => {
            const saved = q.data?.find((x) => x.code === c.code);
            return (
              <tr key={i}>
                <td><input className="input mono" style={{ width: 110 }} value={c.code} disabled={!canEdit || Boolean(saved)} onChange={(e) => put(i, { code: e.target.value.toLowerCase() })} placeholder="btsoft" /></td>
                <td><input className="input" style={{ width: 160 }} value={c.name} disabled={!canEdit} onChange={(e) => put(i, { name: e.target.value })} /></td>
                <td>
                  <select className="select input" value={c.kind} disabled={!canEdit} onChange={(e) => put(i, { kind: e.target.value as Connection['kind'] })}>
                    {CONNECTION_KINDS.map((k) => <option key={k} value={k}>{CONNECTION_KIND_TEXT[k]}</option>)}
                  </select>
                </td>
                <td><input className="input mono" style={{ width: 260 }} value={c.url} disabled={!canEdit} onChange={(e) => put(i, { url: e.target.value })} placeholder={c.kind === 'woocommerce' ? 'https://shop.vn' : 'https://…/wp-json/tgs-acc/v1/pending'} /></td>
                <td><input className="input mono" style={{ width: 120 }} value={c.apiKey} disabled={!canEdit} onChange={(e) => put(i, { apiKey: e.target.value })} /></td>
                <td><input className="input mono" style={{ width: 120 }} value={c.apiSecret} disabled={!canEdit || c.kind !== 'woocommerce'} onChange={(e) => put(i, { apiSecret: e.target.value })} /></td>
                <td><input className="input mono" style={{ width: 90 }} value={c.branchCode} disabled={!canEdit || c.kind !== 'woocommerce'} onChange={(e) => put(i, { branchCode: e.target.value })} /></td>
                <td><input className="input mono" style={{ width: 60 }} value={c.taxCode} disabled={!canEdit || c.kind !== 'woocommerce'} onChange={(e) => put(i, { taxCode: e.target.value.toUpperCase() })} /></td>
                <td>
                  <textarea className="input mono" rows={1} style={{ width: 190, fontSize: 12 }} disabled={!canEdit} placeholder="QR-DI-BIDB=QR-VTB-CT"
                    key={`${i}-${JSON.stringify(c.methodMap)}`} defaultValue={Object.entries(c.methodMap).map(([k, v]) => `${k}=${v}`).join('\n')}
                    onBlur={(e) => put(i, { methodMap: parseMethodMap(e.target.value) })} />
                </td>
                <td><input type="checkbox" checked={c.enabled} disabled={!canEdit} onChange={(e) => put(i, { enabled: e.target.checked })} /></td>
                <td><input type="radio" name="conn-primary" checked={Boolean(c.primary)} disabled={!canEdit || c.kind !== 'standard'} title={c.kind !== 'standard' ? 'Chỉ kết nối đầu chuẩn' : 'Kết nối chính'}
                  onChange={() => setDraft(list.map((x, j) => ({ ...x, primary: j === i })))} /></td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {saved?.lastPull ? `${dateTimeShort(saved.lastPull.at)}: ${saved.lastPull.received} mới, ${saved.lastPull.unchanged} không đổi${saved.lastPull.errors ? `, ${saved.lastPull.errors} lỗi` : ''}` : ''}
                  {tested[c.code] && <div>{tested[c.code]}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {saved && !draft && <button className="btn btn-sm" disabled={test.isPending} onClick={() => test.mutate(c.code)}><Plug size={13} /> Thử</button>}
                  {canEdit && <button className="btn btn-sm" title="Bỏ kết nối" onClick={() => setDraft(list.filter((_, k) => k !== i))}><Trash2 size={13} /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setDraft([...list, blank()])}><Plus size={13} /> Thêm kết nối</button>}
      {!canEdit && <div className="full muted" style={{ marginTop: 6, fontSize: 12 }}>Sửa kết nối cần quyền cấu hình (kế toán trưởng).</div>}
    </Modal>
  );
}

/** "NGUON=DICH" mỗi dòng (hoặc cách bằng dấu ;) → bảng đổi hình thức thanh toán. */
function parseMethodMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/[\n;]+/)) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && v) out[k] = v.toUpperCase();
  }
  return out;
}

/** Kéo chứng từ của các kết nối đã tích, trong khoảng ngày, về thẻ Chờ định khoản. */
/** branchCodes: các chi nhánh đang chọn; null = tất cả chi nhánh (quét mọi cửa hàng); [] = chưa chọn. */
export function PullModal({ from: from0, to: to0, branchCodes, onClose }: { from: string; to: string; branchCodes: string[] | null; onClose: () => void }) {
  const qc = useQueryClient();
  const conns = useConnections().filter((c) => c.enabled);
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(to0);
  const [codes, setCodes] = useState<Set<string> | null>(null);
  const chosen = codes ?? new Set(conns.map((c) => c.code));
  const [results, setResults] = useState<(PullResult | { connection: string; failed: string })[]>([]);
  const pull = useMutation({
    mutationFn: async () => {
      const out: typeof results = [];
      for (const code of chosen) {
        try { out.push(await api.post<PullResult>(`/api/v1/connections/${code}/pull`, { from, to, branchCodes: branchCodes ?? undefined })); } catch (e) { out.push({ connection: code, failed: errorText(e) }); }
        setResults([...out]);
      }
      return out;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); void qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
  const nameOf = (code: string) => conns.find((c) => c.code === code)?.name ?? code;
  return (
    <Modal title="Kéo chứng từ từ hệ thống kết nối" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!chosen.size || branchCodes?.length === 0 || pull.isPending} onClick={() => { setResults([]); pull.mutate(); }}>{pull.isPending ? 'Đang kéo…' : 'Kéo chứng từ'}</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      {!conns.length ? <div className="muted">Chưa có kết nối nào đang bật. Khai ở nút <b>Kết nối</b>.</div> : (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <label>Từ ngày <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Đến ngày <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          {conns.map((c) => (
            <label key={c.code} className="checkbox" style={{ display: 'block', margin: '4px 0' }}>
              <input type="checkbox" checked={chosen.has(c.code)} onChange={(e) => { const n = new Set(chosen); if (e.target.checked) n.add(c.code); else n.delete(c.code); setCodes(n); }} /> {c.name} <span className="muted mono">({c.code})</span>
            </label>
          ))}
          <div className={branchCodes?.length ? 'muted' : 'alert alert-warn'} style={{ fontSize: 12, marginTop: 6 }}>
            {branchCodes === null
              ? <>Đang chọn <b>tất cả chi nhánh</b>: hệ thống nguồn quét mọi cửa hàng, có thể lâu. Muốn nhanh thì chọn vài chi nhánh ở bảng lọc bên trái rồi bấm Tìm kiếm.</>
              : branchCodes.length
                ? <>Chỉ kéo chứng từ của <b>{branchCodes.length.toLocaleString('vi-VN')}</b> chi nhánh đang chọn ở bảng lọc bên trái{branchCodes.length <= 5 ? ` (${branchCodes.join(', ')})` : ''}.</>
                : <>Chưa chọn chi nhánh: chọn ở bảng lọc bên trái rồi bấm Tìm kiếm (hệ thống nguồn chỉ quét các cửa hàng đã chọn).</>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Chứng từ kéo về luôn ở trạng thái Chờ định khoản. Đã có đúng phiên bản thì bỏ qua; phiên bản mới thì chờ định khoản lại.</div>
          {results.map((r) => (
            <div key={r.connection} className={`alert ${'failed' in r ? 'alert-bad' : r.errors.length || r.ackError ? 'alert-warn' : 'alert-ok'}`} style={{ marginTop: 6 }}>
              <b>{nameOf(r.connection)}</b>:{' '}
              {'failed' in r ? r.failed : <>
                đọc {r.fetched.toLocaleString('vi-VN')}, mới / phiên bản mới {r.received.toLocaleString('vi-VN')}, không đổi {r.unchanged.toLocaleString('vi-VN')}{r.cancelled ? `, huỷ ${r.cancelled.toLocaleString('vi-VN')} (phiếu đã xoá ở nguồn)` : ''}
                {r.errors.length > 0 && <>, lỗi {r.errors.length}: {r.errors.slice(0, 5).map((x) => `${x.docNo} (${x.message})`).join('; ')}{r.errors.length > 5 ? '…' : ''}</>}
                {r.ackError && <>. Báo nhận cho hệ thống nguồn không được: {r.ackError}</>}
              </>}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
