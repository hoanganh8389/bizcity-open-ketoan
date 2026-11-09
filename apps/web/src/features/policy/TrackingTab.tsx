// [2026-11-09 02:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-24): tab Theo dõi thực hiện — các ô của core.policy.tracking (W4a)
import { useState } from 'react';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { pct, useTracking } from './api';

function Cell({ title, big, sub, children }: { title: string; big?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
      {big && <div style={{ fontSize: 24, fontWeight: 700 }}>{big}</div>}
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

export function TrackingTab() {
  const [f, setF] = useState<{ from?: string; to?: string; source?: string; owner?: string; branch?: string }>({});
  const q = useTracking(f);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value || undefined });
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <label className="muted">Từ <input className="input" type="date" value={f.from ?? ''} onChange={set('from')} /></label>
        <label className="muted">Đến <input className="input" type="date" value={f.to ?? ''} onChange={set('to')} /></label>
        <input className="input" placeholder="Chi nhánh" value={f.branch ?? ''} onChange={set('branch')} style={{ width: 110 }} />
        <input className="input" placeholder="Nguồn" value={f.source ?? ''} onChange={set('source')} style={{ width: 130 }} />
        <input className="input" placeholder="Module chủ" value={f.owner ?? ''} onChange={set('owner')} style={{ width: 130 }} />
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : <Body t={q.data!} />}
    </div>
  );
}

function Body({ t }: { t: NonNullable<ReturnType<typeof useTracking>['data']> }) {
  const noData = t.pass.events === 0;
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Kỳ {t.range.from} → {t.range.to} theo ngày chứng từ{noData ? ' · chưa có chứng từ nào gửi tham chiếu chính sách trong kỳ' : ''}</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', marginBottom: 10 }}>
        <Cell title="Đạt chính sách" big={pct(t.pass.rate)} sub={`${t.pass.passed}/${t.pass.events} chứng từ đạt cả ba phép kiểm`} />
        <Cell title="Chứng từ đã áp" big={String(t.applied.events)} sub={`Tổng tiền ${t.applied.total.toLocaleString('vi-VN')}`} />
        <Cell title="Lệch theo mã">
          {t.codes.length === 0 ? <div className="muted">Không có</div> : t.codes.map((c) => <div key={c.code}><span className="badge badge-warn">{c.code}</span> {c.n}</div>)}
        </Cell>
        <Cell title="Sức khoẻ sổ đăng ký" sub="Sắp hết hạn · không còn bản phát hành · khoảng trống">
          <div>Sắp hết hạn: <b>{t.health.expiringSoon.length}</b> · Không còn bản: <b>{t.health.noPublished.length}</b> · Khoảng trống: <b>{t.health.gaps.length}</b></div>
          {t.health.expiringSoon.map((x) => <div key={x.policyId} className="muted" style={{ fontSize: 12 }}>{x.policyKey} hết hạn {x.expiresOn}</div>)}
        </Cell>
      </div>
      <h3 style={{ fontSize: 14 }}>Độ phủ theo nguồn (miền bán)</h3>
      <table className="grid"><thead><tr><th>Nguồn</th><th className="num">Chứng từ bán</th><th className="num">Có tham chiếu</th><th className="num">Độ phủ</th></tr></thead>
        <tbody>{t.coverage.length === 0 ? <tr><td colSpan={4} className="muted">Chưa có chính sách bán hiệu lực trong kỳ</td></tr> : t.coverage.map((c) => (
          <tr key={c.sourceSystem}><td>{c.sourceSystem}</td><td className="num">{c.events}</td><td className="num">{c.withRefs}</td><td className="num">{pct(c.rate)}</td></tr>))}</tbody></table>
      <h3 style={{ fontSize: 14 }}>Độ trễ phiên bản (nguồn bán bằng bản cũ)</h3>
      <table className="grid"><thead><tr><th>Nguồn</th><th>Chính sách</th><th className="num">Chứng từ dùng bản cũ</th><th className="num">Bản cuối đã gửi</th></tr></thead>
        <tbody>{t.stale.length === 0 ? <tr><td colSpan={4} className="muted">Không có nguồn nào dùng bản cũ</td></tr> : t.stale.map((s) => (
          <tr key={`${s.source_system}-${s.policy_key}`}><td>{s.source_system}</td><td>{s.policy_key}</td><td className="num">{s.stale}</td><td className="num">{s.last_sent}</td></tr>))}</tbody></table>
      <h3 style={{ fontSize: 14 }}>Dòng thời gian các bản trong kỳ</h3>
      <table className="grid"><thead><tr><th>Chính sách</th><th>Bản</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead>
        <tbody>{t.timeline.length === 0 ? <tr><td colSpan={4} className="muted">Không có bản nào hiệu lực trong kỳ</td></tr> : t.timeline.map((x) => (
          <tr key={`${x.policyId}-${x.version}`}><td>{x.policyKey}</td><td>{x.version}</td><td>{x.effectiveFrom ?? 'từ đầu'} → {x.effectiveTo ?? 'nay'}</td><td>{x.status === 'published' ? 'Đã phát hành' : 'Đã ngừng'}</td></tr>))}</tbody></table>
    </div>
  );
}
