// [2026-11-06 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-43: thẻ Căn cứ hiện căn cứ thật (của phiên bản hoặc mặc định ở registry) và nơi dùng; lịch sử hiện căn cứ từng phiên bản
// [2026-11-06 02:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39: HT13 Cấu hình hệ thống, bản chỉ đọc (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md; bản mẫu mockups/cau-hinh-he-thong.html)
/**
 * CẤU HÌNH HỆ THỐNG (HT13, chỉ đọc). Một bảng cho mọi khoá của registry `bizcity_settings@1`: lớp A / B / C, giá trị đang áp
 * (chỉ khoá có phiên bản và không phải bí mật), số phiên bản, thay đổi gần nhất, bản sắp hiệu lực, căn cứ, sức khoẻ cấu hình.
 * Nguồn: GET /api/v1/settings/overview và GET /api/v1/settings/values/:key/history. Không có nút sửa: đổi cấu hình vẫn ở màn của từng khoá
 * (đổi loại A một người, chỉ ghi nhật ký — D030-12 — là S030-40).
 * Không bao giờ hiện giá trị của khoá bí mật hoặc khoá chưa đi đường chung (D030-13): chỉ trạng thái.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';

type Group = 'duyet' | 'ketoan' | 'nhaplieu' | 'he-thong';
type Filter = null | 'basis' | 'recent' | 'upcoming' | 'seal';
interface Basis { doc: string; article?: string; clause?: string; point?: string; url?: string; effectiveFrom?: string }
interface Use { kind: 'gate' | 'action' | 'form' | 'report'; ref: string }
interface Item {
  key: string; group: Group; class: 'A' | 'B' | 'C' | null; owner: string; scopes: string[]; storage: string; valueType: string | null; permission: string | null;
  versioned: boolean; secret: boolean; basis: null | Basis; basisFrom: null | 'version' | 'registry'; usedBy: Use[];
  current: null | { value: unknown; source: unknown };
  versions: number;
  lastChange: null | { version: number; by: string; at: string; reason: string | null; validFrom: string };
  upcoming: null | { validFrom: string; version: number };
}
interface Overview {
  configVersion: number; today: string; items: Item[];
  health: { total: number; missingBasis: number; withBasis: number; changedRecently: number; changedRecentlyClassA: number; upcoming: number; versioned: number; sealMissing: number | null; recentDays: number };
}
interface Version { scope: string; scopeId: string; value: unknown; validFrom: string; version: number; reason: string | null; basis: Basis | null; by: string; at: string }

const GROUPS: { id: Group; label: string }[] = [
  { id: 'duyet', label: 'Duyệt & khoá sổ' },
  { id: 'ketoan', label: 'Kế toán & thuế' },
  { id: 'nhaplieu', label: 'Nhập liệu & kiểm soát' },
  { id: 'he-thong', label: 'Cài đặt & kết nối' },
];
const CLASS_UI = {
  A: { text: 'A · sổ', long: 'A · ảnh hưởng sổ', cls: 'badge-warn' },
  B: { text: 'B · vận hành', long: 'B · vận hành', cls: 'badge-info' },
  C: { text: 'C · hiển thị', long: 'C · hiển thị', cls: '' },
} as const;
const USE_LABEL: Record<Use['kind'], string> = { gate: 'cổng', action: 'thao tác', form: 'màn nhập', report: 'báo cáo' };
const SCOPE_LABEL: Record<string, string> = { tenant: 'đơn vị', accounting_unit: 'đơn vị hạch toán', branch: 'chi nhánh', user: 'người dùng', install: 'bản cài', period: 'kỳ', doc_type: 'loại chứng từ', record: 'từng bản ghi' };

const fmtDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const fmtValue = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const sourceText = (s: unknown) => {
  if (s === 'default') return 'giá trị mặc định của registry';
  if (s === 'legacy') return 'giá trị hiện hành (đường lưu cũ)';
  if (s && typeof s === 'object') {
    const o = s as { scope?: string; validFrom?: string; version?: number };
    return `phiên bản V${o.version ?? '?'} · phạm vi ${SCOPE_LABEL[o.scope ?? ''] ?? o.scope} · từ ${o.validFrom ? fmtDate(o.validFrom) : '—'}`;
  }
  return '—';
};

export function ConfigCenterPage() {
  const q = useQuery({ queryKey: ['settings', 'overview'], queryFn: () => api.get<Overview>('/api/v1/settings/overview'), staleTime: 60_000 });
  const [group, setGroup] = useState<Group | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'gia-tri' | 'can-cu' | 'lich-su'>('gia-tri');
  const data = q.data;
  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.filter((i) => (!group || i.group === group)
      && (filter !== 'basis' || i.basis === null)
      && (filter !== 'recent' || i.lastChange !== null && Date.now() - Date.parse(i.lastChange.at) <= data.health.recentDays * 86_400_000)
      && (filter !== 'upcoming' || i.upcoming !== null));
  }, [data, group, filter]);
  const item = data?.items.find((i) => i.key === sel) ?? rows[0] ?? null;

  const h = data?.health;
  const tiles: { id: Exclude<Filter, null>; n: number | null; text: string }[] = h ? [
    { id: 'basis', n: h.missingBasis, text: `khoá chưa khai căn cứ (${h.withBasis} khoá đã có)` },
    { id: 'recent', n: h.changedRecently, text: `khoá đã đổi trong ${h.recentDays} ngày qua (khoá có phiên bản)` },
    { id: 'upcoming', n: h.upcoming, text: 'khoá có bản sắp hiệu lực' },
    { id: 'seal', n: h.sealMissing, text: 'ngày đã đóng chưa niêm phong bằng chứng' },
  ] : [];

  return (
    <div>
      <PageHeader title="Cấu hình hệ thống" code="HT13" helpKey="cau-hinh-he-thong"
        subtitle="Mọi khoá cấu hình của đơn vị ở một chỗ: loại A / B / C, giá trị đang áp, phiên bản, thay đổi gần nhất, căn cứ. Chỉ xem — đổi ở màn của từng khoá. Khoá bí mật chỉ hiện trạng thái." />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : !data || !h ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8, marginBottom: 12 }}>
            {tiles.map((t) => (
              <button key={t.id} type="button" className="card card-body" aria-pressed={filter === t.id}
                style={{ marginTop: 0, textAlign: 'left', cursor: 'pointer', borderColor: filter === t.id ? 'var(--brand-500, #2563eb)' : undefined }}
                onClick={() => setFilter(filter === t.id ? null : t.id)}>
                <b style={{ fontSize: 22, display: 'block' }}>{t.n ?? '—'}</b>
                <span className="muted" style={{ fontSize: 12.5 }}>{t.text}</span>
              </button>
            ))}
          </div>
          {filter === 'seal' ? (
            <section className="card card-body">
              {h.sealMissing === null
                ? <p className="muted" style={{ margin: 0 }}>Không đọc được thư mục niêm phong của bản cài này, nên chưa biết số ngày chưa niêm phong.</p>
                : h.sealMissing === 0
                  ? <p style={{ margin: 0 }}>Mọi ngày đã đóng quá 2 ngày đều đã niêm phong bằng chứng.</p>
                  : <p style={{ margin: 0 }}><b>{h.sealMissing}</b> ngày đã đóng quá 2 ngày chưa niêm phong. Xem chi tiết ở kiểm tra <code>EVIDENCE_SEAL_MISSING</code> (Kiểm chuẩn) hoặc <code>GET /api/v1/evidence/verify</code>.</p>}
            </section>
          ) : (
            <>
              <nav aria-label="Nhóm khoá cấu hình" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <button type="button" className={`tab ${!group ? 'active' : ''}`} onClick={() => setGroup(null)}>Tất cả <small className="muted">{data.items.length}</small></button>
                {GROUPS.map((g) => (
                  <button key={g.id} type="button" className={`tab ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)}>
                    {g.label} <small className="muted">{data.items.filter((i) => i.group === g.id).length}</small>
                  </button>
                ))}
              </nav>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <section className="card" style={{ marginTop: 0, flex: '3 1 520px', minWidth: 0, overflowX: 'auto' }}>
                {rows.length === 0 ? <Empty text="Không có khoá nào khớp bộ lọc." /> : (
                  <table className="grid">
                    <thead><tr><th>Khoá</th><th>Giá trị đang áp</th><th>Loại</th><th>Căn cứ</th><th>Phiên bản</th><th>Đổi gần nhất</th></tr></thead>
                    <tbody>
                      {rows.map((i) => (
                        <tr key={i.key} className="clickable" aria-selected={item?.key === i.key} tabIndex={0} onClick={() => setSel(i.key)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i.key); } }}
                          style={item?.key === i.key ? { background: 'var(--brand-50, #eff6ff)' } : undefined}>
                          <td><code style={{ fontSize: 12 }}>{i.key}</code><div className="muted" style={{ fontSize: 12 }}>{i.owner} · lưu: {i.storage}</div></td>
                          <td>{i.secret ? <span className="muted">bí mật — không hiện</span> : i.current ? <span>{fmtValue(i.current.value)}</span> : <span className="muted">chưa có phiên bản</span>}</td>
                          <td>{i.class ? <span className={`badge ${CLASS_UI[i.class].cls}`} style={{ whiteSpace: 'nowrap' }} title={CLASS_UI[i.class].long}>{CLASS_UI[i.class].text}</span> : '—'}</td>
                          <td>{i.basis ? <span className="badge badge-ok">có</span> : <span className="badge badge-warn">thiếu</span>}</td>
                          <td>{i.versioned ? i.versions : <span className="muted">—</span>}{i.upcoming && <div><span className="badge badge-info" title={`Bản V${i.upcoming.version} có hiệu lực từ ${fmtDate(i.upcoming.validFrom)}`}>sắp: {fmtDate(i.upcoming.validFrom)}</span></div>}</td>
                          <td>{i.lastChange ? <>{fmtDate(i.lastChange.at)}<div className="muted" style={{ fontSize: 12 }}>{i.lastChange.by}</div></> : <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <aside style={{ flex: '1 1 300px', minWidth: 0 }}>{item ? <Detail item={item} tab={tab} setTab={setTab} /> : null}</aside>
              </div>
            </>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Phiên bản cấu hình của đơn vị: {data.configVersion} · tính đến {fmtDate(data.today)}.</p>
        </>
      )}
    </div>
  );
}

/** Một dòng căn cứ: văn bản · điều · khoản · điểm (+ hiệu lực của văn bản). */
const basisText = (b: Basis) => [b.doc, b.article, b.clause, b.point].filter(Boolean).join(' · ') + (b.effectiveFrom ? ` (hiệu lực ${fmtDate(b.effectiveFrom)})` : '');

function BasisView({ basis, from }: { basis: Basis; from: Item['basisFrom'] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', gap: '4px 10px', margin: 0, fontSize: 13 }}>
      <dt className="muted">Văn bản</dt><dd style={{ margin: 0 }}>{basis.doc}</dd>
      {basis.article && <><dt className="muted">Điều</dt><dd style={{ margin: 0 }}>{basis.article}</dd></>}
      {basis.clause && <><dt className="muted">Khoản</dt><dd style={{ margin: 0 }}>{basis.clause}</dd></>}
      {basis.point && <><dt className="muted">Điểm</dt><dd style={{ margin: 0 }}>{basis.point}</dd></>}
      {basis.effectiveFrom && <><dt className="muted">Hiệu lực</dt><dd style={{ margin: 0 }}>{fmtDate(basis.effectiveFrom)}</dd></>}
      {basis.url && <><dt className="muted">Liên kết</dt><dd style={{ margin: 0 }}><a href={basis.url} target="_blank" rel="noreferrer noopener">{basis.url}</a></dd></>}
      <dt className="muted">Nguồn</dt><dd style={{ margin: 0 }}>{from === 'version' ? 'khai ở phiên bản đang áp' : 'căn cứ mặc định của khoá (registry)'}</dd>
    </dl>
  );
}

function Detail({ item, tab, setTab }: { item: Item; tab: 'gia-tri' | 'can-cu' | 'lich-su'; setTab: (t: 'gia-tri' | 'can-cu' | 'lich-su') => void }) {
  const tabs: ['gia-tri' | 'can-cu' | 'lich-su', string][] = [['gia-tri', 'Giá trị & hiệu lực'], ['can-cu', 'Căn cứ'], ['lich-su', 'Lịch sử']];
  return (
    <section className="card card-body" style={{ marginTop: 0 }}>
      <h3 style={{ margin: 0 }}>{item.key.replace(/^bizcity\./, '')}</h3>
      <code style={{ fontSize: 12 }}>{item.key}</code>
      <div style={{ margin: '6px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {item.class && <span className={`badge ${CLASS_UI[item.class].cls}`}>{CLASS_UI[item.class].long}</span>}
        {item.secret && <span className="badge">🔒 bí mật</span>}
        {!item.versioned && <span className="badge">chưa có phiên bản</span>}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'gia-tri' && (
        <dl style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: '4px 10px', margin: 0, fontSize: 13 }}>
          <dt className="muted">Giá trị</dt><dd style={{ margin: 0 }}>{item.secret ? 'bí mật — không hiện (chỉ trạng thái)' : item.current ? fmtValue(item.current.value) : 'chưa đi đường chung có phiên bản; xem ở màn của khoá'}</dd>
          <dt className="muted">Nguồn</dt><dd style={{ margin: 0 }}>{item.current ? sourceText(item.current.source) : '—'}</dd>
          <dt className="muted">Phạm vi</dt><dd style={{ margin: 0 }}>{item.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(', ')}</dd>
          <dt className="muted">Kiểu giá trị</dt><dd style={{ margin: 0 }}>{item.valueType ?? '—'}</dd>
          <dt className="muted">Nơi lưu</dt><dd style={{ margin: 0 }}>{item.storage}</dd>
          <dt className="muted">Quyền sửa</dt><dd style={{ margin: 0 }}>{item.permission ?? '—'}</dd>
          <dt className="muted">Sắp hiệu lực</dt><dd style={{ margin: 0 }}>{item.upcoming ? `V${item.upcoming.version} từ ${fmtDate(item.upcoming.validFrom)}` : '—'}</dd>
          <dt className="muted">Nơi dùng</dt><dd style={{ margin: 0 }}>{item.usedBy.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{item.usedBy.map((u) => <li key={`${u.kind}-${u.ref}`}>{USE_LABEL[u.kind]}: {u.ref}</li>)}</ul> : <span className="muted">chưa khai</span>}</dd>
        </dl>
      )}
      {tab === 'can-cu' && (
        item.basis
          ? <BasisView basis={item.basis} from={item.basisFrom} />
          : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Chưa khai căn cứ (văn bản, điều, khoản). Căn cứ khai khi đổi giá trị (khoá có phiên bản) hoặc ở mục <code>basis</code> của khoá trong registry <code>bizcity_settings@1</code> 1.2.0.</p>
      )}
      {tab === 'lich-su' && <History item={item} />}
    </section>
  );
}

function History({ item }: { item: Item }) {
  const q = useQuery({
    queryKey: ['settings', 'history', item.key], enabled: item.versioned && !item.secret,
    queryFn: () => api.get<{ versions: Version[] }>(`/api/v1/settings/values/${item.key}/history`),
  });
  if (item.secret) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Khoá bí mật: không hiện lịch sử giá trị.</p>;
  if (!item.versioned) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Khoá này chưa đi đường có phiên bản; mỗi lần đổi vẫn có bằng chứng (nhật ký thao tác) nhưng chưa có bảng phiên bản.</p>;
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const vs = q.data?.versions ?? [];
  if (!vs.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Chưa có lần đổi nào (đang dùng giá trị mặc định).</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {vs.map((v) => (
        <li key={`${v.scope}-${v.scopeId}-${v.version}`} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 10, fontSize: 13 }}>
          <b>V{v.version} · {fmtValue(v.value)}</b>
          <div className="muted">từ {fmtDate(v.validFrom)} · {SCOPE_LABEL[v.scope] ?? v.scope}{v.scopeId ? ` ${v.scopeId}` : ''}</div>
          <div className="muted">{v.by} · {fmtDate(v.at)}{v.reason ? ` · ${v.reason}` : ''}</div>
          {v.basis && <div className="muted">Căn cứ: {basisText(v.basis)}</div>}
        </li>
      ))}
    </ul>
  );
}
