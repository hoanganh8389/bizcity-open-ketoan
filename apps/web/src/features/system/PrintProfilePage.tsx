// [2026-11-11 Nguyễn Văn Thủy] HT16 Báo cáo, chứng từ: thông tin đơn vị trên bản in, người ký, ngày ký (đóng góp)
/**
 * Hồ sơ in (HT16). Ba khối: thông tin đơn vị trên bản in (giá trị + hiện / ẩn), người ký (chức danh → tiêu đề, tên), ngày ký.
 * Ô để trống = theo Thông tin đơn vị (HT03) / theo cả đơn vị. Chỉ khi đơn vị có từ 2 chi nhánh mới hiện ô "Áp cho" để đặt riêng
 * từng chi nhánh (phần nhiều chi nhánh là lớp gắn thêm, đơn vị một chi nhánh không thấy).
 * Khai báo trường / chức danh / mặc định: @ketoan/contracts print-profile.ts — thêm trường ở đó, màn này thêm một dòng ROWS.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mergePrintProfile, SIGNER_ROLES, type PrintProfile, type PrintProfileInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { BranchPicker, useBranches } from '@/components/filters';
import { usePrintProfile } from '@/components/print/profile';
import { useTenant } from './TenantPage';

type Company = PrintProfile['company'];
type Show = PrintProfile['show'];
/** Dòng thông tin đơn vị: trường giá trị (null = không có ô nhập), cờ hiện, gợi ý lấy từ HT03. */
const ROWS: { label: string; field: keyof Company | null; show: keyof Show | null; tenant?: 'name' | 'address' | 'taxCode' | 'phone' }[] = [
  { label: 'Tên đơn vị', field: 'reportName', show: 'nameAddress', tenant: 'name' },
  { label: 'Địa chỉ', field: 'address', show: null, tenant: 'address' }, // hiện cùng dòng tên
  { label: 'Mã số thuế', field: 'taxCode', show: 'taxCode', tenant: 'taxCode' },
  { label: 'Điện thoại', field: 'phone', show: 'phone', tenant: 'phone' },
  { label: 'Email', field: 'email', show: 'email' },
  { label: 'Website', field: 'website', show: 'website' },
  { label: 'Tài khoản ngân hàng', field: 'bankAccount', show: 'bankAccount' },
  { label: 'Logo', field: null, show: 'logo' },
];

export function PrintProfilePage() {
  const { can } = useAuth();
  const editable = can('settings:write');
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const multi = branches.length > 1;
  const [branch, setBranch] = useState('');
  const q = usePrintProfile(branch);
  const tenant = useTenant().data;
  // Đang sửa: lớp của phạm vi đang chọn (cả đơn vị / chi nhánh); "kế thừa" = hồ sơ gộp của lớp trên để làm chữ mờ.
  const [v, setV] = useState<PrintProfileInput>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setV(structuredClone(branch ? q.data.branch ?? {} : q.data.tenant)); }, [q.data, branch]);
  const base = mergePrintProfile(branch ? q.data?.tenant : undefined);
  const eff = mergePrintProfile(branch ? q.data?.tenant : undefined, v);

  const save = useMutation({
    mutationFn: () => api.put('/api/v1/print-profile', { branchCode: branch, profile: v }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['print-profile'] }); },
  });
  const drop = useMutation({
    mutationFn: () => api.delete(`/api/v1/print-profile?branchCode=${encodeURIComponent(branch)}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['print-profile'] }); },
  });
  const set = (p: (x: PrintProfileInput) => PrintProfileInput) => { setSaved(false); setV((x) => p(structuredClone(x))); };
  const setCompany = (k: keyof Company, val: string) => set((x) => ({ ...x, company: { ...x.company, [k]: val } }));
  const setShow = <K extends keyof Show>(k: K, val: Show[K]) => set((x) => ({ ...x, show: { ...x.show, [k]: val } }));
  const setSigner = (role: string, k: 'title' | 'name', val: string) => set((x) => {
    const list = [...(x.signers ?? [])];
    const i = list.findIndex((s) => s.role === role);
    const cur = i >= 0 ? list[i]! : { role: role as never, title: '', name: '' };
    const next = { ...cur, [k]: val };
    if (i >= 0) list[i] = next; else list.push(next);
    return { ...x, signers: list };
  });
  const own = (role: string) => v.signers?.find((s) => s.role === role);

  return (
    <>
      <PageHeader title="Báo cáo, chứng từ" code="HT16" helpKey="bao-cao-chung-tu"
        subtitle="Thông tin đơn vị, người ký, ngày ký in trên mọi báo cáo và chứng từ" />
      <div className="card hs-in">
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : drop.error ? errorText(drop.error) : null} />
        {multi && (
          <section>
            <h3>Áp cho</h3>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <label className="row" style={{ gap: 6 }}><input type="radio" checked={!branch} onChange={() => setBranch('')} /> Cả đơn vị</label>
              <label className="row" style={{ gap: 6 }}><input type="radio" checked={!!branch} onChange={() => setBranch(branches[0]?.code ?? '')} /> Chi nhánh</label>
              {branch && <BranchPicker value={branch} onChange={setBranch} style={{ width: 280 }} />}
              {branch && (q.data?.branch
                ? editable && <button className="btn" onClick={() => drop.mutate()} title="Xoá thiết lập riêng, chi nhánh in theo cả đơn vị">Theo cả đơn vị</button>
                : <span className="muted">Đang theo cả đơn vị — sửa ô nào thì chi nhánh có thiết lập riêng ô đó.</span>)}
            </div>
          </section>
        )}
        {!q.data ? <Loading /> : (
          <>
            <section>
              <h3>Thông tin đơn vị trên báo cáo, chứng từ</h3>
              <table className="hs-bang">
                <thead><tr><th style={{ width: 180 }}>Thông tin</th><th>Nội dung in</th><th className="c" style={{ width: 80 }} title="Tích = in lên báo cáo, chứng từ">Hiện</th></tr></thead>
                <tbody>
                  {ROWS.map((r) => {
                    const hint = (r.field && base.company[r.field]) || (r.tenant ? tenant?.[r.tenant] ?? '' : '');
                    return (
                      <tr key={r.label}>
                        <td>{r.label}</td>
                        <td>{r.field
                          ? <input className="input" value={v.company?.[r.field] ?? ''} placeholder={hint || 'Chưa có'} disabled={!editable}
                              title={r.tenant ? 'Để trống = theo Thông tin đơn vị (HT03)' : undefined} onChange={(e) => setCompany(r.field!, e.target.value)} />
                          : <span className="muted">{tenant?.logo ? 'Theo logo ở Thông tin đơn vị (HT03)' : 'Chưa có logo — thêm ở Thông tin đơn vị (HT03)'}</span>}</td>
                        <td className="c">{r.show
                          ? <input type="checkbox" checked={eff.show[r.show] as boolean} disabled={!editable} onChange={(e) => setShow(r.show!, e.target.checked as never)} />
                          : <span className="muted" title="Hiện / ẩn cùng tên đơn vị">↑</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row" style={{ gap: 18, marginTop: 8 }}>
                <label className="row" style={{ gap: 6 }}>Căn lề
                  <select className="input" value={eff.show.align} disabled={!editable} onChange={(e) => setShow('align', e.target.value as Show['align'])} style={{ width: 110 }}>
                    <option value="left">Trái</option><option value="center">Giữa</option>
                  </select>
                </label>
                {multi && <label className="row" style={{ gap: 6 }} title="In tên chi nhánh dưới tên đơn vị khi báo cáo, chứng từ thuộc một chi nhánh">
                  <input type="checkbox" checked={eff.show.branchLine} disabled={!editable} onChange={(e) => setShow('branchLine', e.target.checked)} /> In dòng chi nhánh</label>}
              </div>
            </section>
            <section>
              <h3>Thông tin chữ ký</h3>
              <table className="hs-bang">
                <thead><tr><th style={{ width: 180 }}>Chức danh</th><th>Tiêu đề người ký</th><th>Tên người ký</th></tr></thead>
                <tbody>
                  {SIGNER_ROLES.map((r) => {
                    const b = base.signers.find((s) => s.role === r.role)!;
                    return (
                      <tr key={r.role}>
                        <td>{r.label}</td>
                        <td><input className="input" value={own(r.role)?.title ?? ''} placeholder={b.title} disabled={!editable} onChange={(e) => setSigner(r.role, 'title', e.target.value)} /></td>
                        <td><input className="input" value={own(r.role)?.name ?? ''} placeholder={b.name || 'Để trống = ký tay'} disabled={!editable} onChange={(e) => setSigner(r.role, 'name', e.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section>
              <h3>Ngày ký</h3>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={eff.signDate.reportPeriodEnd} disabled={!editable}
                onChange={(e) => set((x) => ({ ...x, signDate: { ...x.signDate, reportPeriodEnd: e.target.checked } }))} /> Ngày ký báo cáo lấy theo ngày cuối cùng của kỳ báo cáo (bỏ tích = ngày in)</label>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={eff.signDate.voucherDate} disabled={!editable}
                onChange={(e) => set((x) => ({ ...x, signDate: { ...x.signDate, voucherDate: e.target.checked } }))} /> Ngày ký chứng từ lấy theo ngày chứng từ (bỏ tích = để trống ghi tay)</label>
            </section>
            {editable && (
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi</button>
                {saved && <span className="muted">Đã ghi.</span>}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
