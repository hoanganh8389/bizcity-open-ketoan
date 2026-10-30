/**
 * CÔNG THỨC ĐẶT HÀNG (MH18) — cấu hình riêng từng chi nhánh cha, nhân viên mua hàng tự chỉnh:
 *   1. Kho: kho nào cộng vào "Tồn kho", kho nào lấy "Tồn max kho"; kho chuẩn của từng shop (thường mỗi shop một kho).
 *   2. Thành phần: bật / tắt, dấu + / −, hệ số, số ngày bán dự phòng; phần shop cộng gộp hay chỉ cộng phần thiếu.
 *   3. Làm tròn, đuôi mã bỏ qua, tốc độ bán (số ngày đo, số ngày đủ hàng), dự phòng kho, ngưỡng nửa thùng, duyệt tự động.
 * Bên phải: công thức viết bằng chữ + ví dụ tính trên một mã thật (gõ mã để xem), chạy lại theo cấu hình đang sửa (chưa lưu).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_FORMULA, FORMULA_VARS, formulaText, orderNeed, varLabel, type FormulaConfig, type FormulaTerm } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { ItemPicker } from '@/components/pickers';
import { errorText } from '@/lib/api';
import { num, qtyFmt, stockApi, useHierarchy } from './api';
import { ChonChiNhanhCha, ChuaPhanCap } from './chung';

export function CongThucPage() {
  const qc = useQueryClient();
  const h = useHierarchy();
  const [parent, setParent] = useState('');
  const f = useQuery({ queryKey: ['ton-max', 'formula', parent], enabled: Boolean(parent), queryFn: () => stockApi.formula(parent) });
  const [cfg, setCfg] = useState<FormulaConfig | null>(null);
  const [sku, setSku] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (f.data) setCfg(f.data.config); }, [f.data]);
  const ex = useQuery({ queryKey: ['ton-max', 'example', parent, sku], enabled: Boolean(parent && sku), queryFn: () => stockApi.analysis(parent, sku) });
  const node = (h.data?.branches ?? []).find((b) => b.code === parent);
  const shops = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent);
  const excl = new Set(cfg?.excludeShops ?? []);
  const stopped = shops.filter((s) => !s.isActive && !excl.has(s.code));
  const dirty = Boolean(cfg && f.data && JSON.stringify(cfg) !== JSON.stringify(f.data.config));
  const up = (p: Partial<FormulaConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const upTerm = (key: string, p: Partial<FormulaTerm>) => setCfg((c) => (c ? { ...c, terms: c.terms.map((t) => (t.key === key ? { ...t, ...p } : t)) } : c));
  const move = (i: number, d: -1 | 1) => setCfg((c) => { if (!c) return c; const t = [...c.terms]; const j = i + d; if (j < 0 || j >= t.length) return c; [t[i], t[j]] = [t[j]!, t[i]!]; return { ...c, terms: t }; });
  type WhField = 'stockWarehouses' | 'maxWarehouses' | 'minWarehouses';
  /** Kho đang áp của từng cột khi chưa tích gì: tính tồn = mọi kho đang dùng; lấy max = kho mặc định; lấy min = như lấy max. */
  const effective = (field: WhField): string[] => {
    const saved = cfg?.[field] ?? [];
    if (saved.length) return saved;
    if (field === 'stockWarehouses') return node?.warehouses.filter((w) => w.isActive).map((w) => w.code) ?? [];
    if (field === 'minWarehouses') return effective('maxWarehouses');
    return [node?.warehouses.find((w) => w.isDefault)?.code ?? node?.warehouses[0]?.code ?? ''];
  };
  const toggleWh = (field: WhField, code: string) => setCfg((c) => { if (!c) return c; const cur = effective(field); return { ...c, [field]: cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code] }; });

  // Ví dụ: số liệu máy chủ trả theo công thức ĐÃ LƯU; tính lại tại chỗ theo cấu hình đang sửa (các thành phần đã có số).
  const row = ex.data?.rows[0];
  const live = useMemo(() => {
    if (!row || !cfg) return null;
    const days = cfg.terms.find((t) => t.key === 'banShop')?.days ?? 7;
    const savedDays = f.data?.config.terms.find((t) => t.key === 'banShop')?.days ?? 7;
    const perDay = row.banShop / Math.max(1, savedDays);
    return orderNeed({ maxKho: row.maxKho, minKho: row.minKho, tonKho: row.tonKho, diDuongKho: row.diDuongKho, diDuongShop: row.diDuongShop, banShopNgay: Array(Math.max(days, 1)).fill(perDay), banThangTruoc: row.banThangTruoc, dangDat: row.dangDat, shops: [{ code: 'all', max: row.maxShop, ton: row.tonShop }] }, cfg);
  }, [row, cfg, f.data]);

  const save = async () => {
    if (!cfg) return;
    setMsg(null);
    try { await stockApi.saveFormula(parent, cfg); setMsg({ ok: true, text: 'Đã lưu công thức — màn Phân tích đặt hàng tính theo công thức mới.' }); await qc.invalidateQueries({ queryKey: ['ton-max'] }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <>
      <PageHeader title="Công thức đặt hàng" code="MH18" helpKey="mua-hang-cong-thuc" subtitle="Mỗi chi nhánh cha một công thức tính SL cần nhập: chọn kho, bật / tắt thành phần, dấu, hệ số, số ngày; xem công thức bằng chữ và ví dụ trên mã thật" />
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
          <ChonChiNhanhCha value={parent} onChange={(v) => { setParent(v); setCfg(null); }} />
          {f.data && <span className="muted" style={{ fontSize: 12 }}>{f.data.saved ? `Lưu lần cuối bởi ${f.data.updatedBy} lúc ${new Date(f.data.updatedAt!).toLocaleString('vi-VN')}` : 'Chưa lưu riêng — đang dùng công thức chuẩn'}</span>}
          <span className="grow" />
          <button className="btn btn-sm" onClick={() => setCfg({ ...DEFAULT_FORMULA, stockWarehouses: cfg?.stockWarehouses ?? [], maxWarehouses: cfg?.maxWarehouses ?? [], minWarehouses: cfg?.minWarehouses ?? [], shopWarehouses: cfg?.shopWarehouses ?? {} })}>Về công thức chuẩn</button>
          {dirty && <button className="btn btn-sm" onClick={() => setCfg(f.data!.config)}>Bỏ thay đổi</button>}
          <button className="btn btn-primary" disabled={!dirty} onClick={() => void save()}>Lưu công thức</button>
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={f.error ? errorText(f.error) : null} />
        {!cfg ? (parent ? <Loading /> : null) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 12, padding: '0 12px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <section className="mh-panel">
                <h4>① Kho của chi nhánh cha</h4>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Tích kho cộng vào <b>Tồn kho</b> (vd kho hàng + kho khuyến mại), kho lấy <b>Tồn max kho</b> và kho lấy <b>Tồn min kho</b> (dùng khi công thức bật Tồn min kho thay cho max). Không tích gì = mọi kho đang dùng / kho mặc định / như kho lấy max.</div>
                <table className="tm-terms"><thead><tr><th>Kho</th><th>Tính tồn</th><th>Lấy max</th><th>Lấy min</th></tr></thead><tbody>
                  {(node?.warehouses ?? []).map((w) => <tr key={w.code} className={w.isActive ? '' : 'off'}>
                    <td><span className="mono">{w.code}</span> · {w.name}{w.isDefault && <span className="tm-chip info" style={{ marginLeft: 6 }}>mặc định</span>}{w.isPromo && <span className="tm-chip warn" style={{ marginLeft: 4 }}>KM</span>}</td>
                    <td><input type="checkbox" checked={effective('stockWarehouses').includes(w.code)} onChange={() => toggleWh('stockWarehouses', w.code)} /></td>
                    <td><input type="checkbox" checked={effective('maxWarehouses').includes(w.code)} onChange={() => toggleWh('maxWarehouses', w.code)} /></td>
                    <td><input type="checkbox" checked={effective('minWarehouses').includes(w.code)} onChange={() => toggleWh('minWarehouses', w.code)} /></td>
                  </tr>)}
                </tbody></table>
              </section>
              <section className="mh-panel">
                <h4>② Shop tính vào công thức & kho chuẩn <span className="badge">{shops.length - excl.size} / {shops.length} shop đang tính</span>
                  <Link to="/mua-hang/phan-cap" className="btn btn-xs" style={{ marginLeft: 'auto' }} title="Thêm / bỏ shop khỏi cây chi nhánh cha (MH15)">Cấu hình phân cấp (MH15) →</Link></h4>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Ô tích = shop được cộng vào công thức (tồn max shop, tồn shop, bán, đi đường xuống shop). Shop đã nghỉ / tạm dừng mà vẫn nằm trong cây phân cấp (vd còn max cũ) thì <b>bỏ tích</b> để không tính — tích lại là tính lại; muốn bỏ hẳn khỏi cây thì vào MH15. Shop nhiều kho thì chọn kho chuẩn. Bấm <b>Lưu</b> để áp dụng.
                  {stopped.length > 0 && <> <button type="button" className="btn btn-xs" onClick={() => up({ excludeShops: [...new Set([...(cfg.excludeShops ?? []), ...stopped.map((s) => s.code)])] })}>Bỏ {stopped.length} shop đang ngừng ra khỏi công thức</button></>}
                </div>
                <div className="tm-wh-grid">{shops.map((s) => <label key={s.code} title={s.name} style={excl.has(s.code) ? { opacity: 0.55, background: '#f3f4f6' } : undefined}>
                  <input type="checkbox" checked={!excl.has(s.code)} title={excl.has(s.code) ? 'Đang KHÔNG tính vào công thức — tích để tính lại' : 'Đang tính vào công thức — bỏ tích để không tính'} onChange={(e) => up({ excludeShops: e.target.checked ? (cfg.excludeShops ?? []).filter((x) => x !== s.code) : [...(cfg.excludeShops ?? []), s.code] })} />
                  <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: excl.has(s.code) ? 'line-through' : undefined }}><b className="mono">{s.code}</b> {s.name}</span>
                  {!s.isActive && <span className="badge badge-bad" style={{ fontSize: 10 }} title="Chi nhánh đã ngừng hoạt động (danh mục chi nhánh)">ngừng</span>}
                  {s.warehouses.length > 1 ? <select className="select input" style={{ height: 24, fontSize: 11.5, width: 96 }} value={cfg.shopWarehouses[s.code] ?? ''} onChange={(e) => up({ shopWarehouses: { ...cfg.shopWarehouses, [s.code]: e.target.value } })}>
                    <option value="">mặc định</option>{s.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code}</option>)}</select>
                    : <span className="mono muted" style={{ fontSize: 11 }}>{s.warehouses[0]?.code ?? 'chưa có kho'}</span>}
                </label>)}</div>
              </section>
              <section className="mh-panel">
                <h4>③ Thành phần công thức</h4>
                <table className="tm-terms"><thead><tr><th>Dùng</th><th>Thành phần</th><th>Dấu</th><th>Hệ số</th><th>Số ngày</th><th /></tr></thead><tbody>
                  {cfg.terms.map((t, i) => {
                    const v = FORMULA_VARS.find((x) => x.key === t.key)!;
                    return <tr key={t.key} className={t.on ? '' : 'off'}>
                      <td><input type="checkbox" checked={t.on} onChange={(e) => upTerm(t.key, { on: e.target.checked })} /></td>
                      <td><b>{t.key === 'banShop' ? `Bán ${t.days ?? 7} ngày của mọi shop` : v.label}</b><div className="muted" style={{ fontSize: 11 }}>{v.hint}</div></td>
                      <td><span className="tm-sign"><button className={t.sign > 0 ? 'on' : ''} onClick={() => upTerm(t.key, { sign: 1 })}>+</button><button className={t.sign < 0 ? 'on' : ''} onClick={() => upTerm(t.key, { sign: -1 })}>−</button></span></td>
                      <td><input className="tm-input" style={{ width: 56 }} value={String(t.factor ?? 1).replace('.', ',')} onChange={(e) => upTerm(t.key, { factor: num(e.target.value) || 0 })} /></td>
                      <td>{t.key === 'banShop' ? <input className="tm-input" style={{ width: 50 }} value={t.days ?? 7} onChange={(e) => upTerm(t.key, { days: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /> : ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-xs" onClick={() => move(i, -1)} title="Lên">↑</button><button className="btn btn-xs" onClick={() => move(i, 1)} title="Xuống">↓</button></td>
                    </tr>;
                  })}
                </tbody></table>
                <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <label className="checkbox chk-explain"><input type="radio" checked={cfg.shopGapMode === 'sum'} onChange={() => up({ shopGapMode: 'sum' })} /> <span><b>Phần shop cộng gộp</b><small>Tổng max shop − tổng tồn shop (shop dư bù shop thiếu) — cách đang dùng</small></span></label>
                  <label className="checkbox chk-explain"><input type="radio" checked={cfg.shopGapMode === 'positive'} onChange={() => up({ shopGapMode: 'positive' })} /> <span><b>Chỉ cộng phần thiếu từng shop</b><small>Shop dư không bù cho shop thiếu (hàng không điều chuyển giữa shop)</small></span></label>
                </div>
              </section>
              <section className="mh-panel">
                <h4>④ Làm tròn, tốc độ bán, chuyển hàng, duyệt max</h4>
                <table className="tm-terms"><tbody>
                  <tr><td>Làm tròn SL gợi ý mua</td><td><select className="select input" value={cfg.roundBuy} onChange={(e) => up({ roundBuy: e.target.value as FormulaConfig['roundBuy'] })}><option value="up">Lên nguyên thùng</option><option value="nearest">Thùng gần nhất</option><option value="none">Không làm tròn</option></select></td></tr>
                  
                  <tr><td>Đo tốc độ bán trong</td><td><input className="tm-input" value={cfg.windowDays} onChange={(e) => up({ windowDays: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /> ngày gần nhất</td></tr>
                  <tr><td>Max shop gợi ý đủ bán</td><td><input className="tm-input" value={cfg.coverDays} onChange={(e) => up({ coverDays: num(e.target.value) || 1 })} /> ngày (bán / ngày × số này)</td></tr>
                  <tr><td>Max kho gợi ý</td><td>tổng max shop + <input className="tm-input" style={{ width: 56 }} value={cfg.warehouseBufferPct} onChange={(e) => up({ warehouseBufferPct: num(e.target.value) })} /> % dự phòng</td></tr>
                  <tr><td>Chuyển xuống shop (tự động)</td><td>thiếu từ <input className="tm-input" style={{ width: 56 }} value={Math.round(cfg.packThreshold * 100)} onChange={(e) => up({ packThreshold: Math.min(100, num(e.target.value)) / 100 })} /> % thùng trở lên thì làm tròn lên nguyên thùng</td></tr>
                  <tr><td>Duyệt tự động phiếu đăng ký max</td><td>khi max mới lệch max cũ không quá <input className="tm-input" style={{ width: 56 }} value={cfg.autoApprovePct} onChange={(e) => up({ autoApprovePct: num(e.target.value) })} /> % (0 = luôn duyệt tay)</td></tr>
                </tbody></table>
              </section>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 8, alignSelf: 'start' }}>
              <section className="mh-panel">
                <h4>Công thức đang dùng {dirty && <span className="tm-chip warn">đang sửa, chưa lưu</span>}</h4>
                <div className="tm-formula">{formulaText(cfg)}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Số dương = cần nhập thêm; số âm = đang dư. SL gợi ý mua làm tròn theo quy cách thùng ({cfg.roundBuy === 'up' ? 'lên' : cfg.roundBuy === 'nearest' ? 'gần nhất' : 'không làm tròn'}). Kho tính tồn: <b>{effective('stockWarehouses').join(', ') || '—'}</b> · kho lấy max: <b>{effective('maxWarehouses').join(', ') || '—'}</b>.</div>
              </section>
              <section className="mh-panel">
                <h4>Ví dụ trên một mã thật</h4>
                <div style={{ width: '100%', marginBottom: 6 }}><ItemPicker value={sku} onChange={setSku} placeholder="Gõ mã / tên hàng để xem ví dụ" /></div>
                {ex.isLoading && <Loading />}
                {row && live && (
                  <table className="tm-terms tm-example"><thead><tr><th>Thành phần</th><th className="num">Số</th></tr></thead><tbody>
                    {live.parts.map((p) => <tr key={p.key}><td>{p.sign < 0 ? '−' : '+'} {p.label}</td><td className="num">{qtyFmt(p.value)}</td></tr>)}
                    <tr><td><b>= SL cần nhập</b></td><td className={`num ${live.need > 0 ? 'tm-need' : 'tm-need-neg'}`}><b>{qtyFmt(live.need)}</b> {row.baseUnit}</td></tr>
                    {row.pack && <tr><td>Quy cách</td><td className="num">1 {row.packUnit} = {row.pack} {row.baseUnit}</td></tr>}
                  </tbody></table>
                )}
                {row && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{row.name} · {row.shopsWithMax} shop có max, {row.shopsBelowMax} shop đang dưới max · bán tháng trước {qtyFmt(row.banThangTruoc)}{row.orders.length ? ` · đang đặt: ${row.orders.map((o) => `${o.docNo} còn ${qtyFmt(o.remaining)}`).join(', ')}` : ''}</div>}
                {sku && ex.data && !row && <div className="muted">Mã này chưa có số liệu ở chi nhánh {parent}.</div>}
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Ví dụ tính lại ngay theo cấu hình đang sửa; kho chọn khác thì bấm Lưu để lấy lại số tồn đúng kho.</div>
              </section>
              <section className="mh-panel"><h4>Ghi nhớ</h4><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                {FORMULA_VARS.map((v) => <li key={v.key}><b>{varLabel(v.key)}</b>: {v.hint}</li>)}
              </ul></section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
