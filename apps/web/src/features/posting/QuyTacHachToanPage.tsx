// [2026-11-15 Nguyễn Văn Thủy] Quy tắc hạch toán (ACC41): một màn thay Tài khoản ngầm định 133 dòng, lý do, TK theo mặt hàng (đóng góp)
/**
 * QUY TẮC HẠCH TOÁN — bên trái các nghiệp vụ; bên phải khung Nợ / Có của nghiệp vụ (bất biến, đúng như bộ định khoản), mỗi dòng sổ
 * ghi tài khoản lấy từ đâu. Đổi được: tài khoản của quy tắc (trong phạm vi đầu số, chỉ tài khoản chi tiết) và mục đích xuất.
 * Nguồn khác (hình thức thanh toán, loại kho, loại thuế) hiện để xem, sửa ở danh mục của nó. Dưới cùng: xem thử bút toán một phiếu.
 * Dữ liệu: GET /api/v1/posting/scheme; đổi TK: PUT /api/v1/posting/scheme/accounts/:key; mục đích: PUT /api/v1/posting/purposes/:code;
 * xem thử: POST /api/v1/posting/scheme/preview.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker, ItemPicker } from '@/components/pickers';
import { useBranches } from '@/components/filters';

type Source = 'rule' | 'payment' | 'warehouse' | 'tax' | 'purpose';
interface SLine { side: 'debit' | 'credit'; role: string; amount: string; source: Source; key?: string; when?: string }
interface Business { code: string; name: string; docType: string; description: string; groups: { name: string; lines: SLine[] }[] }
interface Key { key: string; label: string; range: string[]; help: string; suggest: string; accountCode: string | null; accountName: string | null; status: string }
interface Src { code: string; name: string; accountCode: string | null; accountName: string | null; status: string }
interface Purpose extends Src { direction: string; isActive: boolean; sortOrder: number }
interface Scheme {
  businesses: Business[];
  keys: Key[];
  sources: { paymentMethods: (Src & { isReceivable: boolean; partnerCode: string | null })[]; warehouseTypes: (Src & { owned: boolean })[]; taxCodes: (Src & { direction: string; rate: number })[]; purposes: Purpose[] };
  purposeRange: string[];
}
interface PreviewLine { accountCode: string; accountName: string; debit: number; credit: number; description: string; sku: string | null }
interface PreviewRes { ok: boolean; error?: string; entries?: { docType: string | null; docNo: string | null; lines: PreviewLine[] }[] }

// [2026-11-15 Nguyễn Văn Thủy] mục đích hiện theo nghiệp vụ: nhập kho khác = tăng kho, xuất kho không bán = giảm kho, mua hàng = quà NQUA / XQUA (đóng góp)
const purposeFor = (biz: string | undefined, p: { code: string; direction: string }) =>
  biz === 'purchase' ? p.code === 'NQUA' || p.code === 'XQUA' : biz === 'stock_in' ? p.direction !== 'decrease' : p.direction !== 'increase';
const AMOUNT: Record<string, string> = { goods: 'Tiền hàng', tax: 'Tiền thuế', total: 'Tổng tiền', paid: 'Số đã thu / trả', unpaid: 'Số còn nợ', cost: 'Giá vốn', discount: 'Số chiết khấu' };
const SOURCE: Record<Source, { label: string; tip: string; link?: string }> = {
  rule: { label: 'Tài khoản của quy tắc', tip: 'Đổi ngay ở đây, chỉ trong phạm vi đầu số cho phép' },
  payment: { label: 'Hình thức thanh toán', tip: 'Mỗi hình thức (tiền mặt, chuyển khoản, QR…) một tài khoản; sửa ở danh mục Hình thức thanh toán', link: '/cau-hinh/hinh-thuc-thanh-toan' },
  warehouse: { label: 'Loại kho của phân kho', tip: 'Kho trên dòng thuộc loại nào thì lấy TK kho của loại đó; loại chưa khai TK thì dùng TK dự phòng', link: '/danh-muc/loai-kho' },
  tax: { label: 'Loại thuế của dòng', tip: 'Loại thuế đã khai TK thì dùng TK đó; chưa khai thì dùng TK dự phòng', link: '/danh-muc/loai-thue' },
  purpose: { label: 'Mục đích xuất của phiếu', tip: 'Phiếu ghi mục đích nào thì lấy TK của mục đích đó; không ghi mục đích thì dùng TK dự phòng' },
};
const STATUS_BAD: Record<string, string> = { missing: 'Chưa đặt', unknown: 'Không có trong hệ thống tài khoản', summary: 'Là TK tổng hợp — chọn TK chi tiết' };
const fmt = (n: number) => (n ? n.toLocaleString('vi-VN') : '');

// [2026-11-17 10:45 AM kiennt] ACC41 — thứ tự bút toán của một nghiệp vụ: kho / giá vốn (số lượng, giá vốn tính cuối tháng) → doanh thu, giá trị → tiền (đóng góp)
const thuTuNhom = (ten: string) => (/giá vốn|kho|hàng (vào|về|ra)|nhận quà|chi nhánh (xuất|nhận)/i.test(ten) ? 0 : /thu tiền|trả tiền|chiết khấu thanh toán|nơi (chuyển|nhận)/i.test(ten) ? 2 : 1);
const xepNhom = <G extends { name: string }>(gs: G[]): G[] => gs.map((g, i) => ({ g, i })).sort((a, b) => thuTuNhom(a.g.name) - thuTuNhom(b.g.name) || a.i - b.i).map((x) => x.g);

export function QuyTacHachToanPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const q = useQuery({ queryKey: ['posting-scheme'], queryFn: () => api.get<Scheme>('/api/v1/posting/scheme') });
  const [cur, setCur] = useState('sale');
  const [editKey, setEditKey] = useState<Key | null>(null);
  const [editPurpose, setEditPurpose] = useState<(Partial<Purpose> & { isNew?: boolean }) | null>(null);
  const data = q.data;
  const biz = data?.businesses.find((b) => b.code === cur);
  const keys = useMemo(() => new Map((data?.keys ?? []).map((k) => [k.key, k])), [data]);
  const missing = (data?.keys ?? []).filter((k) => k.status !== 'ok');
  const sources = useMemo(() => new Set(biz?.groups.flatMap((g) => g.lines.map((l) => l.source)) ?? []), [biz]);
  // [2026-11-17 Nguyễn Văn Thủy] hai chế độ: Gọn (mặc định — Loại · TK Nợ · TK Có · Sửa) và Chi tiết (khung Nợ / Có, nguồn, xem thử) (đóng góp)
  const [chiTiet, setChiTiet] = useState(() => { try { return localStorage.getItem('acc41-xem') === 'chi-tiet'; } catch { return false; } });
  const doiXem = (v: boolean) => { setChiTiet(v); try { localStorage.setItem('acc41-xem', v ? 'chi-tiet' : 'gon'); } catch { /* bỏ qua */ } };
  const nutXem = (
    <span className="row" style={{ gap: 0 }}>
      <button className={`btn btn-sm${chiTiet ? '' : ' btn-primary'}`} onClick={() => doiXem(false)} title="Mỗi dòng một loại: TK Nợ, TK Có">Gọn</button>
      <button className={`btn btn-sm${chiTiet ? ' btn-primary' : ''}`} onClick={() => doiXem(true)} title="Khung Nợ / Có từng nghiệp vụ, tài khoản lấy từ đâu, xem thử bút toán">Chi tiết</button>
    </span>
  );
  if (!chiTiet) return (
    <>
      {/* [2026-11-17 10:45 AM kiennt] ACC41 — nút Gọn / Chi tiết cùng một chỗ (góc phải tiêu đề) ở cả hai chế độ (đóng góp) */}
      <PageHeader title="Tài khoản ngầm định" code="ACC41" helpKey="quy-tac-hach-toan" actions={nutXem} />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading || !data ? <Loading /> : <GonView data={data} canWrite={canWrite} />}
    </>
  );

  return (
    <>
      <PageHeader title="Tài khoản ngầm định" code="ACC41" subtitle="Mỗi nghiệp vụ ghi Nợ gì, Có gì, tài khoản lấy từ đâu" helpKey="quy-tac-hach-toan" actions={nutXem} />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {missing.length > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: 8 }} title="Chứng từ dùng tới tài khoản chưa đặt sẽ báo lỗi khi ghi sổ">
          Còn {missing.length} tài khoản của quy tắc chưa đúng: {missing.map((k) => k.label).join(', ')}.
        </div>
      )}
      {q.isLoading || !data ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'start' }}>
          <div className="card" style={{ padding: 0 }}>
            <div className="qt-head" title="Các nghiệp vụ hệ thống tự hạch toán từ chứng từ">Nghiệp vụ</div>
            {data.businesses.map((b) => (
              <button key={b.code} className={`qt-biz ${b.code === cur ? 'on' : ''}`} onClick={() => setCur(b.code)} title={b.description}>
                {b.name}<small title="Loại chứng từ gửi vào cổng nhận chứng từ">{b.docType}</small>
              </button>
            ))}
          </div>
          <div>
            {biz && (
              <div className="card" style={{ padding: 0 }}>
                <div className="qt-head"><b>{biz.name}</b> <span className="muted" title="Loại chứng từ (docType) ở cổng nhận chứng từ">· {biz.docType}</span></div>
                <div className="muted" style={{ padding: '6px 10px' }}>{biz.description}</div>
                <table className="grid full">
                  <thead><tr>
                    <th title="Nợ hay Có">Bên</th><th title="Dòng sổ này để làm gì">Dòng sổ</th><th title="Lấy khoản tiền nào của chứng từ">Số tiền</th>
                    <th title="Tài khoản lấy từ nguồn nào">Lấy theo</th><th title="Tài khoản đang dùng">Tài khoản</th><th title="Khi nào có dòng này; trống = luôn có">Khi nào</th><th />
                  </tr></thead>
                  <tbody>
                    {xepNhom(biz.groups).map((g) => [
                      <tr key={g.name} className="qt-grp"><td colSpan={7} title="Nhóm dòng sổ">{g.name}</td></tr>,
                      ...g.lines.map((l, i) => {
                        const k = l.key ? keys.get(l.key) : undefined;
                        const bad = l.source === 'rule' && k && k.status !== 'ok';
                        return (
                          <tr key={`${g.name}-${i}`}>
                            <td><span className={`qt-side ${l.side}`} title={l.side === 'debit' ? 'Ghi Nợ' : 'Ghi Có'}>{l.side === 'debit' ? 'Nợ' : 'Có'}</span></td>
                            <td title={k?.help ?? l.role}>{l.role}</td>
                            <td className="muted" title="Khoản tiền lấy từ chứng từ">{AMOUNT[l.amount] ?? l.amount}</td>
                            <td title={SOURCE[l.source].tip}>{SOURCE[l.source].label}</td>
                            <td title={bad ? STATUS_BAD[k!.status] : k?.help}>
                              {l.source === 'rule' ? (
                                <span className={bad ? 'text-danger' : ''}><b className="mono">{k?.accountCode ?? '—'}</b> {k?.accountName ?? (bad ? STATUS_BAD[k!.status] : '')}</span>
                              ) : (
                                <span className="muted">theo danh sách bên dưới{k ? <> · dự phòng <b className="mono" title={k.label}>{k.accountCode ?? '—'}</b></> : null}</span>
                              )}
                            </td>
                            <td className="muted" title="Khi nào có dòng này">{l.when ?? ''}</td>
                            <td>{l.source === 'rule' && k && <button className="btn btn-sm" disabled={!canWrite} title={`Đổi tài khoản — chỉ chọn trong ${k.range.join(', ')}`} onClick={() => setEditKey(k)}>Đổi</button>}</td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
                <div className="muted" style={{ padding: '6px 10px', fontSize: 12 }} title="Khung Nợ / Có là nguyên tắc cố định của phần mềm">
                  Khung Nợ / Có cố định. Chỉ đổi tài khoản, trong phạm vi đầu số; tài khoản phải là tài khoản chi tiết.
                </div>
              </div>
            )}

            {sources.has('payment') && <SourceTable title="Hình thức thanh toán" link={SOURCE.payment.link!} rows={data.sources.paymentMethods.map((m) => ({ ...m, note: m.isReceivable ? 'ghi nợ (không phải tiền)' : m.partnerCode ? `thu hộ, đối tượng ${m.partnerCode}` : '' }))} />}
            {sources.has('warehouse') && <SourceTable title="Loại kho" link={SOURCE.warehouse.link!} rows={data.sources.warehouseTypes.map((w) => ({ ...w, note: w.owned ? '' : 'không tính giá vốn (hàng giữ hộ)' }))} fallback={keys.get('inventory')} />}
            {sources.has('tax') && <SourceTable title="Loại thuế" link={SOURCE.tax.link!} rows={data.sources.taxCodes.filter((t) => (biz?.docType.startsWith('purchase') ? t.direction === 'input' : t.direction !== 'input')).map((t) => ({ ...t, note: `${t.rate}%` }))} fallback={keys.get(biz?.docType.startsWith('purchase') ? 'tax_input' : 'tax_output')} />}
            {sources.has('purpose') && (
              <div className="card" style={{ padding: 0, marginTop: 12 }}>
                <div className="qt-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b title="Phiếu xuất kho không bán / điều chỉnh kho ghi mục đích nào thì lấy TK của mục đích đó">Mục đích xuất</b>
                  <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} disabled={!canWrite} onClick={() => setEditPurpose({ isNew: true, direction: biz?.code === 'stock_in' ? 'increase' : 'decrease', isActive: true })} title="Thêm một mục đích xuất">Thêm</button>
                </div>
                <table className="grid full">
                  <thead><tr><th title="Mã gửi kèm phiếu (purposeCode)">Mã</th><th title="Tên mục đích">Mục đích</th><th title="Dùng cho phiếu giảm kho, tăng kho hay cả hai">Dùng cho</th><th title="Tài khoản đối ứng">Tài khoản</th><th title="Đang dùng / ngừng dùng">Trạng thái</th><th /></tr></thead>
                  <tbody>
                    {data.sources.purposes.filter((p) => purposeFor(biz?.code, p)).map((p) => (
                      <tr key={p.code} className={p.isActive ? '' : 'muted'}>
                        <td className="mono" title="Mã mục đích">{p.code}</td><td title={p.name}>{p.name}</td>
                        <td title="Chiều phiếu">{p.direction === 'decrease' ? 'Giảm kho' : p.direction === 'increase' ? 'Tăng kho' : 'Cả hai'}</td>
                        <td title={STATUS_BAD[p.status] ?? p.accountName ?? ''}><b className="mono">{p.accountCode}</b> {p.accountName}</td>
                        <td title="Ngừng dùng thì phiếu mới không chọn được">{p.isActive ? 'Đang dùng' : 'Ngừng dùng'}</td>
                        <td><button className="btn btn-sm" disabled={!canWrite} onClick={() => setEditPurpose(p)} title="Sửa mục đích">Sửa</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ padding: '6px 10px', fontSize: 12 }}>Không ghi mục đích: giảm kho vào <b className="mono">{keys.get('stock_shortage')?.accountCode}</b>, tăng kho vào <b className="mono">{keys.get('stock_surplus')?.accountCode}</b> (chờ xử lý).</div>
              </div>
            )}

            {biz && <PreviewCard biz={biz} scheme={data} />}

            <div className="card" style={{ padding: 0, marginTop: 12 }}>
              <div className="qt-head" title="Toàn bộ tài khoản của quy tắc — mỗi khoá dùng ở một hoặc nhiều nghiệp vụ">Tất cả tài khoản của quy tắc</div>
              <table className="grid full">
                <thead><tr><th title="Vai trò">Tài khoản của</th><th title="Đầu số được chọn">Phạm vi</th><th title="Tài khoản đang dùng">Tài khoản</th><th title="Dùng ở nghiệp vụ nào">Dùng ở</th><th /></tr></thead>
                <tbody>
                  {data.keys.map((k) => (
                    <tr key={k.key}>
                      <td title={k.help}>{k.label}</td>
                      <td className="mono muted" title="Chỉ chọn tài khoản chi tiết trong các đầu số này">{k.range.join(', ')}</td>
                      <td title={STATUS_BAD[k.status] ?? k.accountName ?? ''} className={k.status !== 'ok' ? 'text-danger' : ''}><b className="mono">{k.accountCode ?? '—'}</b> {k.accountName ?? STATUS_BAD[k.status]}</td>
                      <td className="muted" title="Nghiệp vụ dùng tài khoản này">{data.businesses.filter((b) => b.groups.some((g) => g.lines.some((l) => l.key === k.key))).map((b) => b.name).join(', ') || 'Màn mua hàng'}</td>
                      <td><button className="btn btn-sm" disabled={!canWrite} onClick={() => setEditKey(k)} title="Đổi tài khoản">Đổi</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {editKey && <KeyDialog k={editKey} onClose={() => setEditKey(null)} />}
      {editPurpose && data && <PurposeDialog p={editPurpose} range={data.purposeRange} onClose={() => setEditPurpose(null)} />}
      <style>{`
        .qt-head { padding: 8px 10px; border-bottom: 1px solid var(--border, #dfe4ec); font-weight: 600; }
        .qt-biz { display: block; width: 100%; text-align: left; background: none; border: 0; border-left: 3px solid transparent; padding: 8px 10px; cursor: pointer; font: inherit; }
        .qt-biz small { display: block; color: var(--muted, #6b7686); font-size: 11px; }
        .qt-biz:hover, .qt-biz.on { background: var(--hover, #eef3fc); }
        .qt-biz.on { border-left-color: var(--nav, #2457B3); font-weight: 600; }
        .qt-grp td { background: var(--subtle, #f4f6fa); font-weight: 600; font-size: 12px; }
        .qt-side { display: inline-block; width: 32px; text-align: center; border-radius: 4px; color: #fff; font-size: 12px; font-weight: 700; }
        .qt-side.debit { background: #c0392b; } .qt-side.credit { background: #1e7a46; }
      `}</style>
    </>
  );
}

/** Dòng nguồn sai tài khoản: không có dự phòng mà tài khoản chưa đặt / không có / tổng hợp. Có dự phòng thì bút toán dùng dự phòng. */
const isBad = (r: Src, fallback?: Key) => !fallback && ['missing', 'unknown', 'summary'].includes(r.status);

function SourceTable({ title, link, rows, fallback }: { title: string; link: string; rows: (Src & { note?: string })[]; fallback?: Key }) {
  const bad = rows.filter((r) => isBad(r, fallback)).length;
  const [open, setOpen] = useState(bad > 0);
  const accs = [...new Set(rows.map((r) => r.accountCode).filter(Boolean))];
  return (
    <div className="card" style={{ padding: 0, marginTop: 12 }}>
      <div className="qt-head" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <b title={`Tài khoản lấy theo ${title.toLowerCase()} — sửa ở danh mục`}>{title}</b>
        <span className="muted" style={{ fontWeight: 400 }} title="Số dòng và các tài khoản đang dùng">
          {rows.length} dòng · TK {accs.slice(0, 6).join(', ')}{accs.length > 6 ? '…' : ''}{bad ? <span className="text-danger"> · {bad} dòng sai TK</span> : null}
        </span>
        <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setOpen((x) => !x)} title={open ? 'Thu gọn danh sách' : 'Xem từng dòng'}>{open ? 'Thu gọn' : 'Xem'}</button>
        <Link to={link} style={{ fontWeight: 400 }} title="Mở danh mục để sửa">Sửa ở danh mục</Link>
      </div>
      {open && <table className="grid full">
        <thead><tr><th title="Mã">Mã</th><th title="Tên">Tên</th><th title="Tài khoản">Tài khoản</th><th title="Ghi chú">Ghi chú</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="mono" title="Mã">{r.code}</td><td title={r.name}>{r.name}</td>
              <td title={STATUS_BAD[r.status] ?? r.accountName ?? ''} className={isBad(r, fallback) ? 'text-danger' : ''}>
                {r.accountCode && r.status === 'ok' ? <><b className="mono">{r.accountCode}</b> {r.accountName}</>
                  : r.accountCode && fallback ? <span className="muted" title="Tài khoản của dòng là tài khoản tổng hợp / không dùng được: bút toán ghi vào tài khoản dự phòng">{r.accountCode} → dự phòng <b className="mono">{fallback.accountCode ?? '—'}</b></span>
                  : r.accountCode ? <><b className="mono">{r.accountCode}</b> {STATUS_BAD[r.status] ?? r.accountName}</>
                  : <span className="muted">dự phòng {fallback?.accountCode ?? '—'}</span>}
              </td>
              <td className="muted" title="Ghi chú">{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>}
    </div>
  );
}

function KeyDialog({ k, onClose }: { k: Key; onClose: () => void }) {
  const qc = useQueryClient();
  const [acc, setAcc] = useState(k.accountCode ?? '');
  const m = useMutation({
    mutationFn: () => api.put(`/api/v1/posting/scheme/accounts/${encodeURIComponent(k.key)}`, { accountCode: acc }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-scheme'] }); onClose(); },
  });
  return (
    <Modal title={`Tài khoản: ${k.label}`} onClose={onClose} helpKey="quy-tac-hach-toan"
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={!acc || acc === k.accountCode || m.isPending} onClick={() => m.mutate()}>Ghi</button></>}>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
      <p className="muted" style={{ marginTop: 0 }}>{k.help}</p>
      <Field label="Tài khoản" hint={`Chỉ tài khoản chi tiết trong ${k.range.join(', ')}`}>
        <AccountPicker postingOnly prefixes={k.range} value={acc} onChange={setAcc} />
      </Field>
      <p className="muted" style={{ fontSize: 12 }}>Áp dụng cho chứng từ ghi sổ từ bây giờ và chứng từ ghi lại. Bút toán đã ghi không tự đổi.</p>
    </Modal>
  );
}

function PurposeDialog({ p, range, onClose }: { p: Partial<Purpose> & { isNew?: boolean }; range: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ code: p.code ?? '', name: p.name ?? '', direction: p.direction ?? 'decrease', accountCode: p.accountCode ?? '', isActive: p.isActive ?? true });
  const set = (x: Partial<typeof v>) => setV((o) => ({ ...o, ...x }));
  const m = useMutation({
    mutationFn: () => api.put(`/api/v1/posting/purposes/${encodeURIComponent(v.code.trim().toUpperCase())}`, { name: v.name, direction: v.direction, accountCode: v.accountCode, isActive: v.isActive }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-scheme'] }); onClose(); },
  });
  return (
    <Modal title={p.isNew ? 'Thêm mục đích xuất' : `Mục đích ${p.code}`} onClose={onClose} viewFirst={!p.isNew} helpKey="quy-tac-hach-toan"
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={!v.code || !v.name || !v.accountCode || m.isPending} onClick={() => m.mutate()}>Ghi</button></>}>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
      <Field label="Mã" hint="Hệ thống nguồn gửi kèm phiếu (purposeCode)"><input className="input" value={v.code} disabled={!p.isNew} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="VD: HUY" /></Field>
      <Field label="Mục đích"><input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Hủy hàng hỏng, hết hạn" /></Field>
      <Field label="Dùng cho">
        <select className="input" value={v.direction} onChange={(e) => set({ direction: e.target.value })}>
          <option value="decrease">Phiếu giảm kho (xuất)</option><option value="increase">Phiếu tăng kho (nhập)</option><option value="both">Cả hai</option>
        </select>
      </Field>
      <Field label="Tài khoản đối ứng" hint={`Tài khoản chi tiết trong ${range.join(', ')}`}><AccountPicker postingOnly prefixes={range} value={v.accountCode} onChange={(c) => set({ accountCode: c })} /></Field>
      <label className="row" style={{ gap: 6 }} title="Ngừng dùng thì phiếu mới không chọn được; phiếu cũ giữ nguyên"><input type="checkbox" checked={v.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label>
    </Modal>
  );
}

/** Xem thử: dựng một chứng từ mẫu của nghiệp vụ, gửi xem thử (không lưu), hiện bút toán. */
function PreviewCard({ biz, scheme }: { biz: Business; scheme: Scheme }) {
  const branches = useBranches().data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const isPurchase = biz.docType.startsWith('purchase');
  const taxes = scheme.sources.taxCodes.filter((t) => (isPurchase ? t.direction === 'input' : t.direction !== 'input'));
  const methods = scheme.sources.paymentMethods;
  const purposes = scheme.sources.purposes.filter((p) => p.isActive && purposeFor(biz.code, p));
  const [f, setF] = useState({ branch: '', sku: '', amount: 100000, tax: '', cost: 70000, method: '', paid: 0, purpose: '', gift: false });
  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));
  const branch = f.branch || branches[0]?.code || '';
  const tax = taxes.find((t) => t.code === f.tax) ?? taxes.find((t) => t.rate > 0) ?? taxes[0];
  const taxAmount = Math.round(f.amount * (tax?.rate ?? 0) / 100);
  const supported = ['sale', 'sale_return', 'purchase', 'purchase_return', 'stock_out', 'stock_in', 'customer_payment', 'supplier_payment'].includes(biz.code);
  const m = useMutation({
    mutationFn: () => {
      const base = { docKey: 'xem-thu', version: 1, branchCode: branch, docNo: 'XEM-THU', docDate: today };
      const line = { lineKey: '1', sku: f.sku, name: f.sku, unit: '', qty: 1 };
      const method = f.method || methods.find((x) => !x.isReceivable)?.code || '';
      const pays = f.paid > 0 && method ? [{ methodCode: method, amount: f.paid }] : [];
      let doc: Record<string, unknown>;
      if (biz.code === 'stock_out' || biz.code === 'stock_in') {
        doc = { ...base, docType: 'stock_adjustment', direction: biz.code === 'stock_in' ? 'increase' : 'decrease', ...(f.purpose ? { purposeCode: f.purpose } : {}), lines: [{ ...line, amount: f.cost }], totals: { total: f.cost } };
      } else if (biz.code === 'customer_payment' || biz.code === 'supplier_payment') {
        doc = { ...base, docType: biz.code, methodCode: method, lines: [], totals: { total: f.amount } };
      } else {
        doc = { ...base, docType: biz.docType, lines: [{ ...line, amountBeforeTax: f.amount, taxCode: tax?.code ?? '', taxAmount, ...(f.gift ? { isGift: true } : {}), ...(biz.docType === 'sale' ? { cost: f.cost } : {}) }],
          payments: pays, totals: { beforeTax: f.amount, tax: taxAmount, total: f.amount + taxAmount }, ...(biz.docType.endsWith('_return') ? { originalDocKey: 'xem-thu-goc' } : {}) };
      }
      return api.post<PreviewRes>('/api/v1/posting/scheme/preview', { document: doc });
    },
  });
  const r = m.data;
  return (
    <div className="card" style={{ padding: 0, marginTop: 12 }}>
      <div className="qt-head" title="Gửi thử một phiếu mẫu theo quy tắc hiện tại — không lưu, không ghi sổ">Xem thử bút toán</div>
      {!supported ? <div className="muted" style={{ padding: 10 }}>Nghiệp vụ này cần hai chi nhánh: xem bút toán ở chứng từ thật (Định khoản tự động — xem trước).</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12, padding: 10 }}>
          <div>
            <Field label="Chi nhánh"><select className="input" value={branch} onChange={(e) => set({ branch: e.target.value })}>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}</select></Field>
            {!['customer_payment', 'supplier_payment'].includes(biz.code) && <Field label="Mã hàng"><ItemPicker value={f.sku} onChange={(c) => set({ sku: c })} /></Field>}
            {['stock_out', 'stock_in'].includes(biz.code) ? (
              <>
                <Field label="Mục đích"><select className="input" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })}><option value="">(không ghi — chờ xử lý)</option>{purposes.map((p) => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}</select></Field>
                <Field label="Giá trị (giá vốn)"><input className="input" type="number" value={f.cost} onChange={(e) => set({ cost: Number(e.target.value) })} /></Field>
              </>
            ) : ['customer_payment', 'supplier_payment'].includes(biz.code) ? (
              <>
                <Field label="Hình thức"><select className="input" value={f.method} onChange={(e) => set({ method: e.target.value })}>{methods.filter((x) => !x.isReceivable).map((x) => <option key={x.code} value={x.code}>{x.code} - {x.name}</option>)}</select></Field>
                <Field label="Số tiền"><input className="input" type="number" value={f.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>
              </>
            ) : (
              <>
                <Field label="Tiền hàng"><input className="input" type="number" value={f.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>
                <Field label="Loại thuế"><select className="input" value={tax?.code ?? ''} onChange={(e) => set({ tax: e.target.value })}>{taxes.map((t) => <option key={t.code} value={t.code}>{t.code} - {t.name}</option>)}</select></Field>
                {biz.docType === 'sale' && <><Field label="Giá vốn"><input className="input" type="number" value={f.cost} onChange={(e) => set({ cost: Number(e.target.value) })} /></Field>
                  <label className="row" style={{ gap: 6, marginBottom: 6 }}><input type="checkbox" checked={f.gift} onChange={(e) => set({ gift: e.target.checked })} /> Dòng hàng tặng</label></>}
                <Field label={isPurchase ? 'Trả ngay' : biz.docType === 'sale' ? 'Thu ngay' : 'Trả lại tiền'} hint="0 = ghi công nợ"><input className="input" type="number" value={f.paid} onChange={(e) => set({ paid: Number(e.target.value) })} /></Field>
                {f.paid > 0 && <Field label="Hình thức"><select className="input" value={f.method} onChange={(e) => set({ method: e.target.value })}>{methods.filter((x) => !x.isReceivable).map((x) => <option key={x.code} value={x.code}>{x.code} - {x.name}</option>)}</select></Field>}
              </>
            )}
            <button className="btn btn-primary" disabled={m.isPending || !branch || (!f.sku && !['customer_payment', 'supplier_payment'].includes(biz.code))} onClick={() => m.mutate()} title="Chạy thử định khoản, không lưu gì">Xem thử</button>
          </div>
          <div>
            <ErrorBox error={m.error ? errorText(m.error) : r && !r.ok ? r.error ?? 'Không xem thử được' : null} />
            {r?.ok && r.entries?.map((e, i) => {
              const no = e.lines.reduce((s, l) => s + l.debit, 0); const co = e.lines.reduce((s, l) => s + l.credit, 0);
              return (
                <table key={i} className="table" style={{ marginBottom: 8 }}>
                  <thead><tr><th colSpan={4} title="Bút toán sẽ ghi">{e.docType === 'customer_payment' || e.docType === 'supplier_payment' ? 'Phiếu thu / chi kèm' : 'Bút toán'}</th></tr>
                    <tr><th title="Tài khoản">Tài khoản</th><th title="Diễn giải">Diễn giải</th><th className="num" title="Nợ">Nợ</th><th className="num" title="Có">Có</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, j) => <tr key={j}><td title={l.accountName}><b className="mono">{l.accountCode}</b> {l.accountName}</td><td className="muted" title={l.description}>{l.description}</td><td className="num" title="Nợ">{fmt(l.debit)}</td><td className="num" title="Có">{fmt(l.credit)}</td></tr>)}
                    <tr><td colSpan={2} className={no === co ? 'text-success' : 'text-danger'} title="Tổng Nợ phải bằng tổng Có">{no === co ? 'Cân' : 'Lệch'}</td><td className="num"><b>{fmt(no)}</b></td><td className="num"><b>{fmt(co)}</b></td></tr>
                  </tbody>
                </table>
              );
            })}
            {r?.ok && !r.entries?.length && <div className="muted">Không có bút toán (chứng từ 0 đồng, hoặc giá vốn chờ tính cuối tháng).</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tài khoản hiện ở chế độ gọn cho một dòng sổ: TK của quy tắc; nguồn khác (HTTT, loại kho, loại thuế) thì TK dự phòng. */
const NGUON_NGAN: Record<Source, string> = { rule: '', payment: 'theo HTTT', warehouse: 'theo loại kho', tax: 'theo loại thuế', purpose: 'theo mục đích' };
const tkCua = (l: SLine, keys: Map<string, Key>) => (l.key ? keys.get(l.key)?.accountCode ?? '' : NGUON_NGAN[l.source]);
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];

/**
 * CHẾ ĐỘ GỌN: bảng như các màn danh mục (lọc từng cột, sắp xếp, xuất Excel) — Loại chứng từ · Bút toán · TK Nợ · TK Có · Sửa;
 * một dòng = một nhóm dòng sổ của nghiệp vụ, theo thứ tự kho / giá vốn → doanh thu → tiền.
 * [2026-11-17 10:45 AM kiennt] ACC41 — bảng DataGrid thay bảng tay + ô chọn loại / ô tìm (đóng góp)
 */
interface GonRow { id: string; loai: string; nhom: string; title: string; no: string[]; co: string[]; sai: boolean; lines: SLine[]; sua: boolean }
function GonView({ data, canWrite }: { data: Scheme; canWrite: boolean }) {
  const [sua, setSua] = useState<{ title: string; lines: SLine[] } | null>(null);
  const keys = useMemo(() => new Map(data.keys.map((k) => [k.key, k])), [data]);
  const rows: GonRow[] = useMemo(() => data.businesses.flatMap((b) => xepNhom(b.groups).map((g) => {
    const nhom = g.name.replace(/\s*\(.*\)$/, '');
    return {
      id: `${b.code}|${g.name}`, loai: b.name, nhom, title: `${b.name} – ${nhom}`,
      no: uniq(g.lines.filter((l) => l.side === 'debit').map((l) => tkCua(l, keys))),
      co: uniq(g.lines.filter((l) => l.side === 'credit').map((l) => tkCua(l, keys))),
      sai: g.lines.some((l) => l.source === 'rule' && l.key && keys.get(l.key)?.status !== 'ok'),
      lines: g.lines, sua: g.lines.some((l) => l.source === 'rule' && l.key),
    };
  })), [data, keys]);
  const cols: Column<GonRow>[] = [
    { key: 'loai', header: 'Loại chứng từ', width: 200 },
    { key: 'nhom', header: 'Bút toán', width: 280, render: (r) => <span className={r.sai ? 'text-danger' : ''} title={r.sai ? 'Có tài khoản chưa đặt / chưa đúng' : undefined}>{r.nhom}</span> },
    { key: 'no', header: 'TK Nợ', type: 'code', width: 200, value: (r) => r.no.join('; ') },
    { key: 'co', header: 'TK Có', type: 'code', width: 200, value: (r) => r.co.join('; ') },
    { key: 'sua', header: 'Chức năng', width: 90, noFilter: true, noSort: true, render: (r) => (r.sua && canWrite ? <a href="#" onClick={(e) => { e.preventDefault(); setSua(r); }}>Sửa</a> : null) },
  ];
  return (
    <div className="card">
      <DataGrid storageKey="acc41-gon" exportName="tai-khoan-ngam-dinh" rows={rows} rowKey={(r) => r.id} columns={cols}
        onRowDoubleClick={(r) => { if (r.sua && canWrite) setSua(r); }} />
      {sua && <SuaGon title={sua.title} lines={sua.lines} keys={keys} onClose={() => setSua(null)} />}
    </div>
  );
}

/** Sửa tài khoản ngầm định: Tên cột · Lọc tài khoản (đầu số được chọn) · TK ngầm định. Dòng lấy theo danh mục khác chỉ xem. */
function SuaGon({ title, lines, keys, onClose }: { title: string; lines: SLine[]; keys: Map<string, Key>; onClose: () => void }) {
  const qc = useQueryClient();
  const dong = lines.filter((l, i) => !l.key || lines.findIndex((x) => x.key === l.key && x.side === l.side) === i);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(dong.filter((l) => l.source === 'rule' && l.key).map((l) => [l.key!, keys.get(l.key!)?.accountCode ?? ''])));
  const doi = Object.entries(v).filter(([k, a]) => a && a !== (keys.get(k)?.accountCode ?? ''));
  const m = useMutation({
    mutationFn: async () => { for (const [k, a] of doi) await api.put(`/api/v1/posting/scheme/accounts/${encodeURIComponent(k)}`, { accountCode: a }); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['posting-scheme'] }); onClose(); },
  });
  return (
    <Modal wide title="Sửa tài khoản ngầm định" onClose={onClose} helpKey="quy-tac-hach-toan"
      footer={<><button className="btn" onClick={onClose}>Huỷ</button><button className="btn btn-primary" disabled={!doi.length || m.isPending} onClick={() => m.mutate()}>Ghi</button></>}>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
      <div className="full">Loại chứng từ: <b>{title}</b></div>
      <table className="grid full">
        {/* [2026-11-17 10:55 AM kiennt] ACC41 — Tên cột rút gọn TK Nợ / TK Có như màn tài khoản ngầm định phổ biến; dòng sổ để ở chú thích (đóng góp) */}
        <thead><tr><th style={{ width: 120 }}>Tên cột</th><th>Lọc tài khoản</th><th style={{ width: 300 }}>TK ngầm định</th></tr></thead>
        <tbody>{dong.map((l, i) => {
          const k = l.key ? keys.get(l.key) : undefined;
          return (
            <tr key={i}>
              <td title={l.role}>{l.side === 'debit' ? 'TK Nợ' : 'TK Có'}</td>
              <td className="mono">{l.source === 'rule' ? k?.range.join('; ') : <span className="muted">theo {SOURCE[l.source].label.toLowerCase()}</span>}</td>
              <td>{l.source === 'rule' && l.key ? <AccountPicker postingOnly prefixes={k?.range} value={v[l.key] ?? ''} onChange={(a) => setV((o) => ({ ...o, [l.key!]: a }))} />
                : <span className="mono">{k?.accountCode ?? ''}</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </Modal>
  );
}
