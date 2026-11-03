// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: báo cáo mặt hàng tự thêm từ chứng từ + kích hoạt hàng loạt mặt hàng nháp (dùng ở DM10 và HT09)
/**
 * Mặt hàng mới từ chứng từ (D024-3):
 *   useAutoCreate()        chế độ tự thêm (on / off) + báo cáo N ngày gần nhất
 *   AutoCreatedBanner      dải nhắc ở danh sách mặt hàng: bật → "tuần này POS tự thêm N mặt hàng, X chưa có nhóm…" (giai đoạn cảnh
 *                          báo trước khi tắt); tắt → còn bao nhiêu mặt hàng nháp chờ kích hoạt
 *   BulkActivateModal      chọn nhiều mặt hàng nháp, điền một lần ĐVT / nhóm hạch toán còn trống, kích hoạt; còn cảnh báo mềm thì ghi lý do
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WARN_ACK_MIN_REASON } from '@ketoan/contracts';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';

export interface AutoCreatedReport {
  days: number; count: number; noUnit: number; noGroup: number; drafts: number;
  items: { sku: string; name: string; unit: string; postingGroupCode: string | null; isDraft: boolean; draftCodes: string[]; createdAt: string }[];
}
export interface AutoCreateSetting { mode: 'on' | 'off'; last: { by: string; at: string; reason: string | null } | null }

export function useAutoCreate(days = 7) {
  const setting = useQuery({ queryKey: ['item-auto-create'], queryFn: () => api.get<AutoCreateSetting>('/api/v1/settings/item-auto-create'), staleTime: 60_000 });
  const report = useQuery({ queryKey: ['products-auto-created', days], queryFn: () => api.get<AutoCreatedReport>(`/api/v1/products/auto-created?days=${days}`), staleTime: 60_000 });
  return { setting, report };
}

/** Một câu tóm tắt báo cáo (dùng chung DM10 / HT09). */
export function autoCreatedSummary(r: AutoCreatedReport): string {
  const parts = [r.noUnit ? `${r.noUnit} thiếu đơn vị tính` : '', r.noGroup ? `${r.noGroup} chưa có nhóm hạch toán` : '', r.drafts ? `${r.drafts} còn nháp` : ''].filter(Boolean);
  return `${r.days} ngày qua, chứng từ từ hệ thống bán hàng đã tự thêm ${r.count} mặt hàng${parts.length ? ` — ${parts.join(', ')}` : ''}.`;
}

export function AutoCreatedBanner({ onActivate }: { onActivate?: () => void }) {
  const { setting, report } = useAutoCreate();
  const r = report.data;
  if (!setting.data || !r) return null;
  if (setting.data.mode === 'on' && r.count > 0) {
    return (
      <div className="alert alert-warn" style={{ margin: '6px 0' }}>
        {autoCreatedSummary(r)} Mặt hàng tự thêm vào thẳng sổ theo nhóm mặc định — nên kiểm đơn vị tính, nhóm hạch toán.{' '}
        <Link to="/he-thong/quy-dinh-danh-muc">Quy định dữ liệu danh mục</Link> (kế toán trưởng có thể tắt tự thêm: mặt hàng mới thành nháp chờ kiểm).
      </div>
    );
  }
  if (setting.data.mode === 'off' && r.drafts > 0) {
    return (
      <div className="alert alert-warn" style={{ margin: '6px 0' }}>
        {r.drafts} mặt hàng mới từ chứng từ đang nháp; chứng từ của chúng chờ ở Trạm kiểm tra.{' '}
        {onActivate && <button type="button" className="btn btn-xs" onClick={onActivate}>Kích hoạt hàng loạt</button>}
      </div>
    );
  }
  return null;
}

interface DraftRow { sku: string; name: string; unit: string; postingGroupCode: string | null; draftCodes?: string[] }
interface ActivateResult { activated: string[]; stillDraft: { sku: string; codes: string[] }[]; inboxRechecked: { checked: number; cleared: number } }

export function BulkActivateModal({ onClose, groups }: { onClose: () => void; groups: { code: string; name: string }[] }) {
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: ['products', 'drafts-all'], queryFn: () => api.get<DraftRow[]>('/api/v1/products?status=draft&pageSize=200') });
  const rows = drafts.data ?? [];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const sel = useMemo(() => picked ?? new Set(rows.map((r) => r.sku)), [picked, rows]);
  const [unit, setUnit] = useState('');
  const [group, setGroup] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ActivateResult | null>(null);
  // Mặt hàng chưa có nhóm và không chọn nhóm cho lô → sẽ ghi theo nhóm mặc định (cảnh báo mềm ITEM-HINT-001) → cần lý do.
  const needsReason = !group && rows.some((r) => sel.has(r.sku) && !r.postingGroupCode);
  const run = useMutation({
    mutationFn: () => api.post<ActivateResult>('/api/v1/products/activate', {
      skus: [...sel], ...(unit.trim() ? { unit: unit.trim() } : {}), ...(group ? { postingGroupCode: group } : {}),
      ...(needsReason ? { warnAck: { reason: reason.trim(), codes: ['ITEM-HINT-001'] } } : {}),
    }),
    onSuccess: (r) => {
      setResult(r); setPicked(null);
      void qc.invalidateQueries({ queryKey: ['products'] }); void qc.invalidateQueries({ queryKey: ['products-auto-created'] });
    },
  });
  const toggle = (sku: string) => setPicked(() => { const n = new Set(sel); if (n.has(sku)) n.delete(sku); else n.add(sku); return n; });
  const canRun = sel.size > 0 && (!needsReason || reason.trim().length >= WARN_ACK_MIN_REASON) && !run.isPending;

  return (
    <Modal title="Kích hoạt hàng loạt mặt hàng nháp" onClose={onClose} wide
      footer={<><button className="btn btn-primary" disabled={!canRun} onClick={() => run.mutate()}>{run.isPending ? 'Đang kích hoạt…' : `Kích hoạt ${sel.size} mặt hàng`}</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      {drafts.isLoading ? <Loading /> : !rows.length ? <div className="full muted">Không còn mặt hàng nháp.</div> : (
        <>
          <div className="full" style={{ fontSize: 13, marginBottom: 6 }}>
            Ô để trống sẽ được điền cho những mặt hàng <b>đang thiếu</b>, không ghi đè ô đã có. Mặt hàng nào vẫn thiếu thứ bắt buộc thì giữ nháp và được liệt kê sau khi chạy.
          </div>
          <Field label="Đơn vị tính gốc (cho mặt hàng chưa có)"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="vd Cái, Hộp" /></Field>
          <Field label="Nhóm hạch toán (cho mặt hàng chưa có)">
            <select className="select input" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">— để trống: theo nhóm mặc định —</option>
              {groups.map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
            </select>
          </Field>
          {needsReason && (
            <Field label={`Lý do dùng nhóm mặc định (bắt buộc, ≥ ${WARN_ACK_MIN_REASON} ký tự — ghi vào nhật ký)`} full>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd hàng hoá thường, đúng nhóm mặc định" />
            </Field>
          )}
          <div className="full" style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--line, #dfe6ef)', borderRadius: 6 }}>
            <table className="table">
              <thead><tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={sel.size === rows.length} onChange={() => setPicked(sel.size === rows.length ? new Set() : null)} /></th>
                <th>Mã</th><th>Tên</th><th>ĐVT</th><th>Nhóm hạch toán</th><th>Còn thiếu</th>
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.sku}>
                  <td><input type="checkbox" checked={sel.has(r.sku)} onChange={() => toggle(r.sku)} /></td>
                  <td>{r.sku}</td><td>{r.name}</td><td>{r.unit || <span className="muted">—</span>}</td><td>{r.postingGroupCode ?? <span className="muted">mặc định</span>}</td>
                  <td className="muted">{(r.draftCodes ?? []).join(', ')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <ErrorBox error={run.error ? errorText(run.error) : drafts.error ? errorText(drafts.error) : null} />
      {result && (
        <div className={`alert ${result.stillDraft.length ? 'alert-warn' : 'alert-ok'} full`} style={{ marginTop: 8 }}>
          Đã kích hoạt {result.activated.length} mặt hàng{result.inboxRechecked.checked ? `; ${result.inboxRechecked.checked} chứng từ ở Trạm kiểm tra được kiểm lại (${result.inboxRechecked.cleared} hết lỗi chặn)` : ''}.
          {result.stillDraft.length > 0 && <> Còn nháp: {result.stillDraft.map((d) => `${d.sku} (${d.codes.join(', ')})`).join('; ')}.</>}
        </div>
      )}
    </Modal>
  );
}
