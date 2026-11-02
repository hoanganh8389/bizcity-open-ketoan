// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Ghi sổ (DEV05) — chứng từ bị từ chối / treo và vì sao; dùng lại API sẵn có
/**
 * GHI SỔ (DEV05): hai câu hỏi của Sổ tay TH-04, TH-05.
 *   ?xem=loi   lần định khoản lỗi gần đây (GET /api/v1/posting-log?action=error, khoảng ?ngay=1|7|30) gom theo loại chứng từ + lý do;
 *   ?xem=treo  chứng từ đang chờ / lỗi định khoản (GET /api/v1/documents?status=…), chờ lâu nhất trước.
 * Dùng lại API sẵn có (20-KIEN-TRUC §2.1). Không nút ghi (U8): định khoản lại làm ở màn Định khoản tự động (ACC14) — có link.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { devParams } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { usePostingLog, useStuckDocs, type PostingLogRow, type StuckDoc } from '../api';
import { Answer, CopyCode, DevBanner, DevGuard, Src, when } from '../ui';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function GhiSoPage() {
  const [params, setParams] = useSearchParams();
  const f = devParams('/dev/ghi-so', params);
  const set = (k: string, v: string) => setParams({ ...f, [k]: v });
  return (
    <DevGuard>
      <PageHeader title="Ghi sổ" code="DEV05" helpKey="ban-dieu-tra" subtitle="Chứng từ nào bị từ chối / treo, vì sao — nhật ký định khoản của đơn vị" actions={
        f.xem === 'loi' && (
          <select className="select" value={f.ngay} onChange={(e) => set('ngay', e.target.value)} aria-label="Khoảng">
            <option value="1">Hôm nay</option><option value="7">7 ngày</option><option value="30">30 ngày</option>
          </select>
        )
      } />
      <DevBanner />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={f.xem === 'loi'} className={`tab${f.xem === 'loi' ? ' active' : ''}`} onClick={() => set('xem', 'loi')}>Định khoản lỗi</button>
        <button type="button" role="tab" aria-selected={f.xem === 'treo'} className={`tab${f.xem === 'treo' ? ' active' : ''}`} onClick={() => set('xem', 'treo')}>Chờ / lỗi chưa vào sổ</button>
      </div>
      {f.xem === 'loi' ? <Loi days={Number(f.ngay)} /> : <Treo />}
    </DevGuard>
  );
}

function Loi({ days }: { days: number }) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const q = usePostingLog({ from: ymd(from), to: ymd(to), action: 'error' });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const rows = q.data!.slice(0, 200);
  const byType = new Map<string, number>();
  for (const r of q.data!) byType.set(r.docType, (byType.get(r.docType) ?? 0) + 1);
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const label = days === 1 ? 'hôm nay' : `${days} ngày qua`;
  return (
    <>
      <Answer level={rows.length ? 'rej' : 'ok'}>
        {rows.length
          ? <ul>
              <li>{q.data!.length} lần định khoản lỗi {label}; nhiều nhất loại {top.slice(0, 3).map(([t, n]) => `${t} (${n})`).join(', ')}.</li>
              <li>Kernel từ chối đúng luật — sổ không đổi. Việc của dev: vì sao dữ liệu sai tới được Kernel (Sổ tay TH-04).</li>
            </ul>
          : <>Không có lần định khoản lỗi nào {label}.</>}
      </Answer>
      {rows.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Lúc</th><th>Loại</th><th>Số</th><th>Chi nhánh</th><th>Phiên bản</th><th>Lý do</th><th>Trạng thái hiện tại</th></tr></thead>
            <tbody>{rows.map((r: PostingLogRow) => (
              <tr key={r.id}>
                <td>{when(r.createdAt)}</td>
                <td><code>{r.docType}</code></td>
                <td>{r.docNo ?? '—'}</td>
                <td>{r.branchCode}</td>
                <td>v{r.version}</td>
                <td>{r.message ?? ''}</td>
                <td>{r.docStatus}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="card-body"><Link to="/chung-tu?status=error">Định khoản lại ở màn Định khoản tự động (ACC14) →</Link></div>
        </div>
      )}
      <Src>nguồn: GET /api/v1/posting-log?action=error — nhật ký định khoản (posting_log) của đơn vị, 200 dòng mới nhất</Src>
    </>
  );
}

function Treo() {
  const q = useStuckDocs(true);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const d = q.data!;
  const rows = [...d.error, ...d.pending].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const oldest = rows[0];
  return (
    <>
      <Answer level={d.errorTotal ? 'rej' : d.pendingTotal ? 'warn' : 'ok'}>
        {rows.length
          ? <ul>
              <li>{d.errorTotal} chứng từ lỗi định khoản, {d.pendingTotal} chứng từ đang chờ định khoản{oldest ? ` — chờ lâu nhất từ ${when(oldest.receivedAt)}` : ''}.</li>
              <li>Thường do thiếu danh mục (mặt hàng / đối tượng) hoặc thiếu cấu hình định khoản cho loại chứng từ (Sổ tay TH-05). Bổ sung rồi định khoản lại — không sửa tay trạng thái.</li>
            </ul>
          : <>Không có chứng từ nào chờ hay lỗi định khoản.</>}
      </Answer>
      {rows.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Nhận lúc</th><th>Trạng thái</th><th>Loại</th><th>Số</th><th>Ngày</th><th>Nguồn</th><th>Lý do</th><th>Khoá</th></tr></thead>
            <tbody>{rows.map((r: StuckDoc) => (
              <tr key={r.id}>
                <td>{when(r.receivedAt)}</td>
                <td>{r.status === 'error' ? <span className="dev-tag rej">lỗi định khoản</span> : <span className="dev-tag">chờ</span>}</td>
                <td><code>{r.docType}</code></td>
                <td>{r.docNo ?? '—'}</td>
                <td>{r.docDate}</td>
                <td>{r.sourceSystem}</td>
                <td>{r.errorMessage ?? ''}</td>
                <td><CopyCode value={r.docKey} short={16} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="card-body"><Link to={d.errorTotal ? '/chung-tu?status=error' : '/chung-tu?status=pending'}>Mở màn Định khoản tự động (ACC14) →</Link></div>
        </div>
      )}
      <Src>nguồn: GET /api/v1/documents?status=error | pending — 100 dòng mỗi trạng thái; đủ danh sách ở ACC14</Src>
    </>
  );
}
