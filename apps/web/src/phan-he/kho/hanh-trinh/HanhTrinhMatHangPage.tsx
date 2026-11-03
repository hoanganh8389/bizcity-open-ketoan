// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: màn Hành trình mặt hàng (ACC95) — truy vết vòng đời một mặt hàng, "Vì sao giá vốn này?" (ADR-0021, R-CONT-0 / R-CONT-8)
/**
 * HÀNH TRÌNH MẶT HÀNG (ACC95). Một mặt hàng, một câu chuyện: mua · nhập → bán · xuất → trả → chuyển kho, bút toán mang mã hàng,
 * giá vốn từng tháng. Sự kiện KẾ TOÁN (đổi sổ / đổi giá trị tồn) viền đậm; sự kiện VẬN HÀNH (chuyển kho cùng nhóm tính giá) nhạt.
 *   - bấm một sự kiện → làm nổi các sự kiện nối với nó (cùng chứng từ, hoặc hàng trả ↔ chứng từ bán gốc);
 *   - "Vì sao giá vốn này?" ở mỗi tháng → công thức đơn giá bằng số thật + các phiếu góp vào;
 *   - phần chưa truy được (`coverage.notes`) nói rõ, không giả vờ đầy đủ.
 * Vào bằng đường dẫn: /bao-cao/hanh-trinh-mat-hang?sku=SUA01&from=2026-10-01&to=2026-10-31 (nút "Truy vết" ở các báo cáo / danh mục).
 * Dữ liệu: GET /api/v1/lineage/* (bizcity_lineage@1, chỉ đọc).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LINEAGE_LANE, type CostExplain, type ItemHistory, type LineageEvent, type LineageItem } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading, Money } from '@/components/ui';
import { api, errorText } from '@/lib/api';

interface SearchRow { sku: string; name: string; unit: string; barcode: string; isActive: boolean; isDraft: boolean }
const LANES: { key: 'in' | 'out' | 'return' | 'move'; title: string }[] = [
  { key: 'in', title: 'Mua · nhập' }, { key: 'out', title: 'Bán · xuất' }, { key: 'return', title: 'Trả hàng' }, { key: 'move', title: 'Chuyển kho' },
];
const qty = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Đường dẫn mở chứng từ ở danh sách chứng từ (lọc đúng số chứng từ, đủ ngày). */
const docLink = (e: { docNo: string; at: string }) => `/chung-tu?status=&search=${encodeURIComponent(e.docNo)}&from=${e.at}&to=${e.at}`;

export function HanhTrinhMatHangPage() {
  const [sp, setSp] = useSearchParams();
  const sku = sp.get('sku') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const [text, setText] = useState('');
  const dq = useDebounced(text.trim());
  const [onlyAccounting, setOnlyAccounting] = useState(false);
  const [picked, setPicked] = useState<LineageEvent | null>(null);
  const [period, setPeriod] = useState<{ period: string; costGroup: string } | null>(null);

  const search = useQuery({ queryKey: ['lineage-search', dq], queryFn: () => api.get<SearchRow[]>(`/api/v1/lineage/search?q=${encodeURIComponent(dq)}`), enabled: dq.length > 0 && !sku });
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const lin = useQuery({ queryKey: ['lineage', sku, from, to], queryFn: () => api.get<LineageItem>(`/api/v1/lineage/items/${encodeURIComponent(sku)}${qs ? `?${qs}` : ''}`), enabled: Boolean(sku) });
  // [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10: thẻ Lịch sử (mã cũ / mới, hiệu lực, người đổi, phân loại, lý do)
  const [showHistory, setShowHistory] = useState(false);
  const hist = useQuery({ queryKey: ['lineage-history', sku], queryFn: () => api.get<ItemHistory>(`/api/v1/lineage/items/${encodeURIComponent(sku)}/history`), enabled: Boolean(sku) && showHistory });
  const why = useQuery({
    queryKey: ['lineage-cost', sku, period?.period, period?.costGroup],
    queryFn: () => api.get<CostExplain>(`/api/v1/lineage/items/${encodeURIComponent(sku)}/cost?period=${period!.period}&costGroup=${encodeURIComponent(period!.costGroup)}`),
    enabled: Boolean(sku && period),
  });
  useEffect(() => { setPicked(null); setPeriod(null); }, [sku]);

  const d = lin.data;
  const events = useMemo(() => (d?.events ?? []).filter((e) => !onlyAccounting || e.effect === 'accounting'), [d, onlyAccounting]);
  /** Sự kiện nối với sự kiện đang chọn: cùng chứng từ, hoặc hàng trả ↔ chứng từ bán gốc. */
  const related = useMemo(() => {
    if (!picked) return new Set<string>();
    const keys = new Set([picked.docKey, ...(picked.originalDocKey ? [picked.originalDocKey] : [])]);
    for (const e of d?.events ?? []) if (e.originalDocKey === picked.docKey) keys.add(e.docKey);
    return keys;
  }, [picked, d]);
  const go = (s: string) => setSp(s ? { sku: s } : {});

  return (
    <div>
      <PageHeader title="Hành trình mặt hàng" code="ACC95" subtitle="Mua → nhập → bán → giá vốn → trả: mọi sự kiện và bút toán của một mặt hàng, và giá vốn hình thành từ đâu" />

      {!sku && (
        <div className="card" style={{ marginBottom: 12 }}>
          <label className="field-label">Tìm mặt hàng (mã, tên hoặc mã vạch)</label>
          <input className="input" style={{ width: '100%', maxWidth: 420 }} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="vd SUA01, sữa bột, 8934…" />
          {search.isFetching && <div className="muted" style={{ marginTop: 6 }}>Đang tìm…</div>}
          {dq && search.data && !search.data.length && <div className="muted" style={{ marginTop: 6 }}>Không có mặt hàng nào khớp "{dq}".</div>}
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {(search.data ?? []).map((r) => (
              <button key={r.sku} className="btn" style={{ textAlign: 'left' }} onClick={() => go(r.sku)}>
                <b>{r.sku}</b> · {r.name} <span className="muted">· {r.unit}{r.barcode ? ` · ${r.barcode}` : ''}{!r.isActive ? ' · ngừng' : ''}{r.isDraft ? ' · nháp' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sku && lin.isLoading && <Loading />}
      {sku && lin.error && <ErrorBox error={errorText(lin.error)} />}

      {d && (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{d.item.sku}</b><span>{d.item.name}</span><span className="muted">· {d.item.unit}{d.item.barcode ? ` · ${d.item.barcode}` : ''}</span>
            {d.item.isDraft && <span className="badge badge-warn">Nháp</span>}
            {!d.item.isActive && <span className="badge">Ngừng</span>}
            <span className="spacer" />
            <label className="muted">Từ <input className="input" type="date" value={from} onChange={(e) => setSp({ sku, ...(e.target.value ? { from: e.target.value } : {}), ...(to ? { to } : {}) })} /></label>
            <label className="muted">Đến <input className="input" type="date" value={to} onChange={(e) => setSp({ sku, ...(from ? { from } : {}), ...(e.target.value ? { to: e.target.value } : {}) })} /></label>
            <button className="btn btn-sm" onClick={() => go('')}>Đổi mặt hàng</button>
            <Link className="btn btn-sm" to={`/bao-cao/so-chi-tiet-hang-hoa?sku=${encodeURIComponent(d.item.sku)}`}>Sổ chi tiết hàng hoá</Link>
          </div>

          {/* [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b: định danh + lịch sử mã — mã cũ / mới là MỘT mặt hàng */}
          {d.item.itemId && (
            <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, marginBottom: 4 }}>
              <span className="muted" title="Định danh bất biến của mặt hàng — không đổi khi đổi mã">Định danh <code>{d.item.itemId}</code></span>
              {d.item.codes.length > 1 && <span className="muted">· Các mã:</span>}
              {d.item.codes.length > 1 && d.item.codes.map((c, i) => (
                <span key={i} className={`badge ${c.validTo === null ? 'badge-ok' : ''}`} title={`${c.kind} · ${c.validFrom === '1970-01-01' ? 'từ đầu' : `từ ${c.validFrom}`}${c.validTo ? ` đến trước ${c.validTo}` : ' · đang dùng'}`}>
                  {c.kind === 'sku' ? '' : `${c.kind}: `}{c.code}{c.validTo ? ` (đến ${c.validTo})` : ''}
                </span>
              ))}
            </div>
          )}
          {/* [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3: họ mặt hàng theo định danh — mỗi biến thể một hành trình riêng (tồn, giá vốn riêng) */}
          {(d.item.family.parent || d.item.family.children.length > 0 || d.item.family.siblings.length > 0) && (
            <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, marginBottom: 4 }}>
              <span className="muted" title="Biến thể là mặt hàng riêng: tồn kho và giá vốn tính riêng; họ đi theo định danh nên đổi mã không đứt">Họ mặt hàng:</span>
              {d.item.family.parent && <><span className="muted">cha</span> <button type="button" className="btn btn-xs" onClick={() => go(d.item.family.parent!.sku)}>{d.item.family.parent.sku} · {d.item.family.parent.name}</button></>}
              {d.item.family.children.length > 0 && <span className="muted">· biến thể</span>}
              {d.item.family.children.map((c) => <button key={c.itemId} type="button" className="btn btn-xs" onClick={() => go(c.sku)}>{c.sku}</button>)}
              {d.item.family.siblings.length > 0 && <span className="muted">· cùng cha</span>}
              {d.item.family.siblings.map((c) => <button key={c.itemId} type="button" className="btn btn-xs" onClick={() => go(c.sku)}>{c.sku}</button>)}
            </div>
          )}
          <div style={{ margin: '4px 0' }}>
            <button type="button" className="btn btn-sm" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Ẩn lịch sử' : 'Lịch sử mặt hàng'}</button>
            {showHistory && (hist.isLoading ? <Loading /> : hist.error ? <ErrorBox error={errorText(hist.error)} /> : hist.data && (
              <div className="card card-body" style={{ marginTop: 6 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Mới nhất trước · nguồn: mã có phiên bản, phân loại theo ngày, nhật ký thao tác — không sửa được</div>
                <table className="grid"><thead><tr><th style={{ width: 150 }}>Lúc</th><th style={{ width: 100 }}>Hiệu lực từ</th><th>Thay đổi</th><th style={{ width: 160 }}>Người</th></tr></thead>
                  <tbody>{hist.data.entries.map((h, i) => (
                    <tr key={i}><td>{h.at.slice(0, 16).replace('T', ' ')}</td><td>{h.effectiveFrom ?? '—'}</td><td>{h.text}</td><td className="muted">{h.by}</td></tr>
                  ))}</tbody></table>
                {hist.data.truncated && <div className="muted" style={{ fontSize: 12 }}>Danh sách bị cắt — xem nhật ký đầy đủ ở Bàn điều tra.</div>}
              </div>
            ))}
          </div>
          {d.coverage.notes.map((n, i) => <div key={i} className={`alert ${i === 0 ? 'alert-info' : 'alert-warn'}`} style={{ margin: '4px 0' }}>{n}</div>)}
          {d.summary.truncated && <div className="alert alert-warn" style={{ margin: '4px 0' }}>Danh sách quá dài nên bị cắt — thu hẹp khoảng ngày để xem đủ.</div>}

          <div className="row" style={{ gap: 10, margin: '10px 0', flexWrap: 'wrap' }}>
            <Stat label="Sự kiện" value={String(d.summary.events)} sub={`${d.summary.accountingEvents} kế toán · ${d.summary.operationalEvents} vận hành`} />
            <Stat label="Số lượng nhập" value={qty(d.summary.inQty)} />
            <Stat label="Số lượng xuất" value={qty(d.summary.outQty)} />
            <Stat label="Dòng bút toán" value={String(d.summary.entries)} />
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Vòng đời</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Viền xanh = sự kiện kế toán (đổi sổ / đổi giá trị tồn) · viền xám = vận hành (không đổi sổ). Bấm một sự kiện để thấy chuỗi nối với nó.</div>
            {LANES.map((lane) => {
              const list = events.filter((e) => LINEAGE_LANE[e.kind] === lane.key);
              if (!list.length) return null;
              return (
                <div key={lane.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, padding: '6px 0', borderTop: '1px dashed var(--line, #dfe6ef)' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{lane.title}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {list.map((e, i) => {
                      const on = related.has(e.docKey);
                      return (
                        <button key={`${e.docKey}:${e.lineNo}:${e.kind}:${i}`} type="button" onClick={() => setPicked(picked === e ? null : e)} title={e.effectWhy}
                          style={{ textAlign: 'left', minWidth: 190, padding: '6px 10px', borderRadius: 8, background: 'var(--surface, #fff)', cursor: 'pointer', color: e.effect === 'operational' ? 'var(--ink-500, #5d6878)' : undefined,
                            border: '1px solid var(--line, #dfe6ef)', borderLeft: `4px solid ${e.effect === 'accounting' ? 'var(--brand-600, #1e5bb8)' : '#8a94a6'}`, outline: on ? '2px solid var(--brand-600, #1e5bb8)' : undefined }}>
                          <b style={{ display: 'block' }}>{e.docNo}</b>
                          <span style={{ fontSize: 12 }}>{e.at} · {e.label}<br />{qty(e.qty)} {e.unit}{e.amount !== null ? <> · <Money value={e.amount} /></> : <span className="muted"> · chờ giá vốn</span>}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {picked && (
              <div className="alert alert-info" style={{ marginTop: 8 }}>
                <b>{picked.docNo}</b> · {picked.label} · {picked.at} · chi nhánh {picked.branch}{picked.warehouse ? ` · kho ${picked.warehouse}` : ''}{picked.counterBranch ? ` ⇄ ${picked.counterBranch}` : ''}
                <div style={{ fontSize: 12, marginTop: 2 }}>{picked.effectWhy}</div>
                {picked.originalDocKey && <div style={{ fontSize: 12 }}>Hàng trả của chứng từ gốc <b>{picked.originalDocKey}</b>.</div>}
                <Link className="btn btn-xs" style={{ marginTop: 4 }} to={docLink(picked)}>Mở chứng từ</Link>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Dòng thời gian</h3><span className="spacer" />
              <label className="muted"><input type="checkbox" checked={onlyAccounting} onChange={(e) => setOnlyAccounting(e.target.checked)} /> chỉ sự kiện đổi sổ</label>
            </div>
            <div className="table-wrap" style={{ maxHeight: 320 }}>
              <table className="grid"><thead><tr><th>Ngày</th><th>Sự kiện</th><th>Chứng từ</th><th>Chi nhánh / kho</th><th className="num">Số lượng</th><th className="num">Thành tiền</th><th>Ảnh hưởng</th><th>Trạng thái</th></tr></thead>
                <tbody>{events.map((e, i) => (
                  <tr key={i} onClick={() => setPicked(picked === e ? null : e)} style={{ cursor: 'pointer', background: related.has(e.docKey) ? 'var(--info-bg, #e8f0fc)' : undefined }}>
                    <td>{e.at}</td><td>{e.label}</td><td><Link to={docLink(e)} onClick={(ev) => ev.stopPropagation()}>{e.docNo}</Link>{e.version > 1 ? <span className="muted"> (v{e.version})</span> : null}{e.code && e.code !== d.item.sku ? <span className="badge" title="Mã hàng tại ngày chứng từ — cùng định danh"> mã cũ {e.code}</span> : null}</td>
                    <td>{e.branch}{e.warehouse ? ` / ${e.warehouse}` : ''}{e.counterBranch ? ` ⇄ ${e.counterBranch}` : ''}</td>
                    <td className="num">{qty(e.qty)}</td><td className="num">{e.amount === null ? <span className="muted">chờ giá vốn</span> : <Money value={e.amount} />}</td>
                    <td><span className={`badge ${e.effect === 'accounting' ? 'badge-ok' : ''}`} title={e.effectWhy}>{e.effect === 'accounting' ? 'kế toán' : 'vận hành'}</span></td><td>{e.status}</td>
                  </tr>))}
                </tbody></table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Giá vốn từng tháng</h3>
            {!d.costPeriods.length ? <div className="muted">Chưa có tháng nào được tính giá vốn.</div> : (
              <div className="table-wrap" style={{ maxHeight: 260 }}>
                <table className="grid"><thead><tr><th>Tháng</th><th>Nhóm tính giá</th><th className="num">Tồn đầu</th><th className="num">Nhập</th><th className="num">Đơn giá</th><th className="num">Xuất</th><th className="num">Tồn cuối</th><th /></tr></thead>
                  <tbody>{d.costPeriods.map((c) => (
                    <tr key={`${c.period}:${c.costGroup}`} style={{ background: period?.period === c.period && period.costGroup === c.costGroup ? 'var(--info-bg, #e8f0fc)' : undefined }}>
                      <td>{c.period}</td><td>{c.costGroup}{c.costGroupName ? ` · ${c.costGroupName}` : ''}{c.source === 'import' ? ' · nhập Excel' : ''}</td>
                      <td className="num">{qty(c.openingQty)}</td><td className="num">{qty(c.inQty)}</td><td className="num"><Money value={c.unitCost} blankZero={false} /></td>
                      <td className="num">{qty(c.outQty)}</td><td className="num">{qty(c.closingQty)} · <Money value={c.closingValue} /></td>
                      <td><button className="btn btn-xs" onClick={() => setPeriod({ period: c.period, costGroup: c.costGroup })}>Vì sao giá vốn này?</button></td>
                    </tr>))}
                  </tbody></table>
              </div>
            )}
            {period && (
              <div style={{ marginTop: 10 }}>
                {why.isLoading && <Loading />}
                {why.error && <ErrorBox error={errorText(why.error)} />}
                {why.data && (
                  <div className="alert alert-info">
                    <b>Vì sao đơn giá {why.data.period.slice(5)}/{why.data.period.slice(0, 4)} là {why.data.row ? <Money value={why.data.row.unitCost} blankZero={false} /> : '—'}?</b>
                    <ol style={{ margin: '6px 0 6px 18px' }}>{why.data.sentences.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    {why.data.contributions.length > 0 && (
                      <table className="grid" style={{ background: 'var(--surface, #fff)' }}><thead><tr><th>Ngày</th><th>Chứng từ</th><th>Loại</th><th>Vai trong công thức</th><th className="num">Số lượng</th><th className="num">Thành tiền</th></tr></thead>
                        <tbody>{why.data.contributions.map((c, i) => (
                          <tr key={i}><td>{c.at}</td><td>{c.docNo}</td><td>{c.label}</td><td title={c.roleWhy}>{{ in: 'góp vào đơn giá', out: 'hàng xuất', gift: 'quà (không vào đơn giá)', internal: 'chuyển cùng nhóm', return: 'trả nhà cung cấp' }[c.role]}</td>
                            <td className="num">{qty(c.qty)}</td><td className="num">{c.amount === null ? '—' : <Money value={c.amount} />}</td></tr>))}
                        </tbody></table>
                    )}
                    <div className={why.data.reconcile.matchesStored === false ? 'alert alert-warn' : 'muted'} style={{ marginTop: 6, fontSize: 12 }}>{why.data.reconcile.note}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Bút toán mang mã hàng</h3>
            {!d.entries.length ? <div className="muted">Chưa có dòng bút toán nào mang mã hàng này trong khoảng đã chọn.</div> : (
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table className="grid"><thead><tr><th>Ngày</th><th>Bút toán</th><th>Tài khoản</th><th className="num">Nợ</th><th className="num">Có</th><th>Từ chứng từ</th><th>Loại dòng</th><th>Trạng thái</th></tr></thead>
                  <tbody>{d.entries.map((l, i) => (
                    <tr key={i} style={{ background: l.docKey && related.has(l.docKey) ? 'var(--info-bg, #e8f0fc)' : undefined }}>
                      <td>{l.postingDate}</td><td>{l.entryNo}</td><td>{l.account}{l.accountName ? ` · ${l.accountName}` : ''}</td>
                      <td className="num">{l.costFill && !l.debit && !l.credit ? <span className="muted">chờ tính giá</span> : <Money value={l.debit} />}</td><td className="num">{l.costFill && !l.debit && !l.credit ? '' : <Money value={l.credit} />}</td>
                      <td>{l.docNo}</td><td>{l.part}</td><td>{l.status === 'reversed' ? 'đã đảo' : l.status === 'reversal' ? 'bút toán đảo' : 'ghi sổ'}</td>
                    </tr>))}
                  </tbody></table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ minWidth: 150, padding: '8px 12px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
