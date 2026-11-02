// [2026-11-02 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20: màn Hồ sơ kế toán (HT07) — xem hồ sơ áp cho hôm nay, lịch sử phiên bản, phát hành bản mới (ADR-0013, quyền settings:write).
/**
 * HỒ SƠ KẾ TOÁN (HT07, ADR-0013): năm tài chính, chế độ kế toán, loại pháp nhân — đầu vào để Kiểm chuẩn chọn đúng bộ quy định.
 * Chỉ thêm: mỗi lần phát hành là một phiên bản mới có hiệu lực từ ngày đầu một năm tài chính; bản cũ giữ cho các năm trước.
 * Kernel từ chối: ngày hiệu lực không phải ngày 01 của tháng bắt đầu năm tài chính, hoặc rơi vào năm đã có kỳ khoá.
 * Đổi chế độ là quyết định của đơn vị (kế toán trưởng / chủ): màn chỉ ghi lại, có bằng chứng; không tự đổi gói định khoản.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { ENTITY_LABEL, REGIME_LABEL, useProfile, type AccountingProfile } from './conformance';

const pad = (n: number) => String(n).padStart(2, '0');

export function AccountingProfilePage() {
  const { can } = useAuth();
  const q = useProfile();
  const qc = useQueryClient();
  const cur = q.data?.current ?? null;
  const thisYear = new Date().getFullYear();
  const [v, setV] = useState({ year: thisYear, fiscalYearStartMonth: cur?.fiscalYearStartMonth ?? 1, regime: cur?.regime ?? 'vn-tt99-2025', entityType: cur?.entityType ?? 'enterprise', note: '' });
  const effectiveFrom = `${v.year}-${pad(v.fiscalYearStartMonth)}-01`;
  const publish = useMutation({
    mutationFn: () => api.post<AccountingProfile>('/api/v1/accounting/profile/publish', { effectiveFrom, fiscalYearStartMonth: v.fiscalYearStartMonth, regime: v.regime, entityType: v.entityType, note: v.note.trim() }),
    onSuccess: () => { setV({ ...v, note: '' }); void qc.invalidateQueries({ queryKey: ['accounting-profile'] }); void qc.invalidateQueries({ queryKey: ['conformance'] }); },
  });

  return (
    <div>
      <PageHeader title="Hồ sơ kế toán" code="HT07" subtitle="Năm tài chính, chế độ kế toán, loại pháp nhân — Kiểm chuẩn dựa vào đây để chọn bộ quy định" actions={<Link className="btn" to="/he-thong/kiem-chuan">Kiểm chuẩn</Link>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <>
          <div className={`dev-answer ${cur ? '' : 'warn'}`}>
            {cur ? (
              <>
                <b>Áp cho hôm nay ({q.data!.asOf}): bản {cur.version}</b>
                <ul>
                  <li>Chế độ: {REGIME_LABEL[cur.regime] ?? cur.regime}</li>
                  <li>Loại pháp nhân: {ENTITY_LABEL[cur.entityType] ?? cur.entityType}</li>
                  <li>Năm tài chính hiện tại: {q.data!.fiscalYear?.start} → {q.data!.fiscalYear?.end} (bắt đầu tháng {cur.fiscalYearStartMonth})</li>
                </ul>
              </>
            ) : (
              <><b>Đơn vị chưa khai hồ sơ kế toán cho hôm nay</b><p>Kiểm chuẩn không đoán chế độ: các ca lớp Cấu hình và Doanh nghiệp sẽ ở trạng thái "Chờ duyệt" tới khi khai.</p></>
            )}
          </div>

          {can('settings:write') ? (
            <div className="card card-body">
              <b>Phát hành bản mới</b>
              <p className="muted">Bản mới có hiệu lực từ ngày đầu năm tài chính đã chọn; bản cũ giữ nguyên cho các năm trước. Không phát hành vào năm đã có kỳ khoá. TT99/2025 áp theo năm tài chính, không đổi chế độ giữa năm.</p>
              <div className="form-grid">
                <Field label="Năm tài chính bắt đầu năm"><input className="input" type="number" min={2000} max={2100} value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} /></Field>
                <Field label="Tháng bắt đầu năm tài chính">
                  <select className="select input" value={v.fiscalYearStartMonth} onChange={(e) => setV({ ...v, fiscalYearStartMonth: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}{m === 1 ? ' (năm dương lịch)' : ''}</option>)}
                  </select>
                </Field>
                <Field label="Chế độ kế toán">
                  <select className="select input" value={v.regime} onChange={(e) => setV({ ...v, regime: e.target.value })}>
                    {Object.entries(REGIME_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Loại pháp nhân">
                  <select className="select input" value={v.entityType} onChange={(e) => setV({ ...v, entityType: e.target.value })}>
                    {Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Căn cứ / lý do (ít nhất 5 ký tự)" full><input className="input" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="vd Quyết định áp dụng TT99 từ năm tài chính 2026" /></Field>
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
                <button type="button" className="btn btn-primary" disabled={publish.isPending || v.note.trim().length < 5} onClick={() => publish.mutate()}>Phát hành, hiệu lực từ {effectiveFrom}</button>
                {publish.isSuccess && <span className="text-ok">Đã phát hành bản {publish.data.version}.</span>}
              </div>
              {publish.error && <ErrorBox error={errorText(publish.error)} />}
            </div>
          ) : (
            <div className="card card-body muted">Phát hành hồ sơ cần quyền cấu hình (kế toán trưởng / chủ đơn vị).</div>
          )}

          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}><b>Lịch sử phiên bản</b> <span className="muted">(chỉ thêm, không sửa / xoá)</span></div>
            {q.data!.history.length === 0 ? <div className="card-body muted">Chưa có phiên bản nào.</div> : (
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Bản</th><th>Hiệu lực từ</th><th>Chế độ</th><th>Loại pháp nhân</th><th>Năm TC từ tháng</th><th>Căn cứ</th><th>Người, lúc</th></tr></thead>
                <tbody>{q.data!.history.map((p) => (
                  <tr key={p.version} className={cur?.version === p.version ? 'dev-row-on' : undefined}>
                    <td>{p.version}</td><td>{p.effectiveFrom}</td><td>{REGIME_LABEL[p.regime] ?? p.regime}</td><td>{ENTITY_LABEL[p.entityType] ?? p.entityType}</td>
                    <td>{p.fiscalYearStartMonth}</td><td>{p.note}</td><td className="muted">{p.createdBy} · {dateTime(p.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
