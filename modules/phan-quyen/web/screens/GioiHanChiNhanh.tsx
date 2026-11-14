// [2026-11-14 11:00 PM kiennt] NT-HT-003 — HT12: công tắc giới hạn theo chi nhánh + bảng rà trước khi bật (đóng góp)
/**
 * GIỚI HẠN THEO CHI NHÁNH (thẻ Người dùng): trạng thái công tắc đơn vị `bizcity.authz.branch_scope` và bảng rà — ai có lần gán vai trò
 * tại chi nhánh / kho, phạm vi làm việc sẽ thành gì khi bật. Bật / tắt ghi qua đường cấu hình chung (PUT /api/v1/settings/values/:key,
 * cần settings:write, có lý do); máy chủ quyết, màn chỉ hiện.
 */
import { useState } from 'react';
import { ErrorBox, errorText, useApi, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { FS } from '../lib/matrix';
import { WriteDialog } from './WriteDialog';

interface NguoiRa { userId: string; email: string; fullName: string; role: string; branches: string[] | null; ganTai: string[]; camTai: string[] }
interface RaSoat { batGioiHan: boolean; nguoi: NguoiRa[] }
const KHOA = 'bizcity.authz.branch_scope';

export function GioiHanChiNhanh() {
  const api = useApi();
  const qc = useQueryClient();
  const [mo, setMo] = useState(false);
  const [doi, setDoi] = useState(false);
  const ra = useQuery({ queryKey: ['phan-quyen', 'ra-soat-chi-nhanh'], queryFn: () => api.get<RaSoat>('/api/v1/quyen-chi-nhanh/ra-soat') });
  if (ra.error) return <ErrorBox error={errorText(ra.error)} />;
  if (!ra.data) return null;
  const bat = ra.data.batGioiHan;
  const bi = ra.data.nguoi.filter((n) => n.branches);
  return (
    <div className="card card-body" style={{ marginBottom: 16, fontSize: FS.body }}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: FS.group }}>Giới hạn theo chi nhánh</strong>
        <span className={`badge ${bat ? 'badge-ok' : 'badge-gray'}`}>{bat ? 'Đang bật' : 'Đang tắt'}</span>
        <span className="muted" style={{ fontSize: FS.small }}>
          {bat ? 'Người có lần gán vai trò tại chi nhánh / kho chỉ làm việc ở các chi nhánh đó; vai trò gán tại chi nhánh chỉ có hiệu lực ở đó.'
            : 'Tắt: lần gán tại chi nhánh chỉ cộng quyền ở cửa nạp chứng từ, mọi người làm việc mọi chi nhánh.'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setMo(!mo)}>{mo ? 'Ẩn bảng rà' : `Bảng rà (${ra.data.nguoi.length} người)`}</button>
          <button type="button" className={`btn btn-sm ${bat ? '' : 'btn-primary'}`} onClick={() => setDoi(true)}
            title="Cần quyền Cấu hình đơn vị (settings:write)">{bat ? 'Tắt giới hạn' : 'Bật giới hạn'}</button>
        </span>
      </div>
      {mo ? (
        ra.data.nguoi.length ? (
          <table className="table" style={{ marginTop: 12, fontSize: FS.body }}>
            <thead><tr><th>Người dùng</th><th>Lần gán tại chi nhánh / kho</th><th>{bat ? 'Làm việc ở' : 'Khi bật sẽ làm việc ở'}</th><th>Cấm tại</th></tr></thead>
            <tbody>
              {ra.data.nguoi.map((n) => (
                <tr key={n.userId}>
                  <td>{n.fullName}<div className="muted" style={{ fontSize: FS.small }}>{n.email}</div></td>
                  <td style={{ fontSize: FS.small }}>{n.ganTai.join('; ')}</td>
                  <td>{n.branches ? <strong>{n.branches.join(', ')}</strong> : <span className="muted">mọi chi nhánh{n.role === 'owner' ? ' (chủ đơn vị)' : ''}</span>}</td>
                  <td>{n.camTai.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted" style={{ marginTop: 8 }}>Chưa ai có lần gán tại chi nhánh / kho — bật không đổi gì.</p>
      ) : null}
      {doi ? (
        <WriteDialog title={bat ? 'Tắt giới hạn theo chi nhánh' : 'Bật giới hạn theo chi nhánh'} confirmLabel={bat ? 'Tắt' : 'Bật'} onClose={() => setDoi(false)}
          onSubmit={async (v) => {
            await api.put(`/api/v1/settings/values/${KHOA}`, { value: bat ? 'off' : 'on', reason: v.reason });
            await qc.invalidateQueries({ queryKey: ['phan-quyen'] });
          }}>
          <p>{bat ? 'Mọi người trở lại làm việc ở mọi chi nhánh (lần tải trang sau).'
            : `${bi.length} người sẽ chỉ làm việc ở chi nhánh được gán (xem Bảng rà). Người đang dùng thấy thay đổi ở lần tải trang sau.`}</p>
        </WriteDialog>
      ) : null}
    </div>
  );
}
