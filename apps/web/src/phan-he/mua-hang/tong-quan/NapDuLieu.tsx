/**
 * NẠP DỮ LIỆU TÌNH HUỐNG — đưa 25 tình huống của tài liệu yêu cầu + ví dụ bổ sung (VD1–VD8) vào SỔ THẬT của đơn vị đang
 * đăng nhập, để cả nhóm xem luồng như vận hành. Cần mật khẩu nạp dữ liệu. Đã nạp thì "Nạp lại" (xoá bản cũ, nạp lại) hoặc "Xoá".
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, RefreshCw, Trash2, Warehouse } from 'lucide-react';
import { errorText } from '@/lib/api';
import { purchaseApi, useMuaHang } from '../du-lieu';

const WILL: [string, string][] = [
  ['14 nhà cung cấp', 'Trung Hậu, Hoàng Nhi, Thắng Bảo, NPP Anlene, Hoà Bình, Vinh Châu và 6 NCC theo hợp đồng thật (Bảo Huy, Diana, Lifesfood, Hoàng Tuấn, Hoàng Gia Phú, Đại Thịnh) — có số dư nợ đầu kỳ'],
  ['4 chi nhánh', 'Nghệ An, Nam Định, Phú Thọ, Hồ Chí Minh (thêm nếu chưa có) — mỗi chi nhánh một kho mặc định <mã>-HH để lọc / báo cáo theo kho'],
  ['13 mặt hàng', 'Anlene, TH, Vinamilk, khăn ướt, dầu ăn trẻ em (mã đã có trong danh mục thì giữ nguyên) + 3 mã quà'],
  ['41 chính sách', 'danh mục mặt hàng NCC, hợp đồng, CK 7%, CK tiền, CKTT, mua 10 tặng 1 / 2, hạn mức NCC + nhãn, đủ 7 kiểu hạn thanh toán theo hợp đồng thật, giá cố định theo ĐVT, thưởng, tồn min–max, lô'],
  ['40 chứng từ', 'đơn đặt, nhập mua, trả / đổi hàng, quà, chi phí, chiết khấu sau mua, ứng trước, trả tiền — phiếu "đã duyệt" được ghi sổ thật; phiếu nháp để thử trực tiếp'],
];

export function NapDuLieu({ compact }: { compact?: boolean }) {
  const { data, refresh } = useMuaHang();
  const demo = (data?.docs ?? []).filter((d) => d.isDemo).length;
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; errors?: { docNo: string; error?: string }[] } | null>(null);
  const run = async (label: string, fn: () => Promise<{ text: string; errors?: { docNo: string; error?: string }[] }>) => {
    if (!pw) return setMsg({ ok: false, text: 'Nhập mật khẩu nạp dữ liệu' });
    setBusy(label); setMsg(null);
    try { const r = await fn(); setMsg({ ok: !r.errors?.length, ...r }); await refresh(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(''); }
  };
  const seed = (reset: boolean) => run(reset ? 'reset' : 'seed', async () => { const r = await purchaseApi.seedDemo(pw, reset); return { text: `Đã nạp ${r.documents} chứng từ vào sổ${r.errors.length ? ` — ${r.errors.length} mục lỗi` : ' — không lỗi'}.${r.skipped?.length ? ` Bỏ qua ${r.skipped.length} mục: ${r.skipped.map((x) => x.error ?? x.docNo).join('; ')}.` : ''} Mở "Quy trình" hoặc "Chứng từ mua hàng" để xem.`, errors: r.errors }; });
  const kho = () => run('kho', async () => { const r = await purchaseApi.demoWarehouses(pw); return { text: r.created.length ? `Đã thêm kho mặc định: ${r.created.join(', ')}. Phiếu mẫu tự hiện kho này, lọc theo kho được (không sửa phiếu).` : `Các chi nhánh mẫu (${r.branches.join(', ')}) đều đã có kho mặc định — không thêm gì.` }; });
  const clear = () => { if (window.confirm('Xoá toàn bộ dữ liệu tình huống? Phiếu đã duyệt được đảo bút toán (ghi số âm); danh mục NCC, mặt hàng, chi nhánh đã thêm vẫn giữ.')) void run('clear', async () => { const r = await purchaseApi.clearDemo(pw); return { text: `Đã xoá ${r.documents} chứng từ tình huống.` }; }); };

  return (
    <div className="mh-seed">
      <div className="mh-seed-icon"><Database size={28} /></div>
      <div className="mh-seed-body">
        <h3>{demo ? `Đang có dữ liệu tình huống (${demo} chứng từ)` : 'Nạp dữ liệu tình huống vào sổ thật'}</h3>
        <p>Đưa đủ <b>25 tình huống</b> của tài liệu yêu cầu (mota1 + motamuahang) và <b>8 ví dụ bổ sung</b> vào sổ kế toán của đơn vị đang đăng nhập — để thuyết trình, cả nhóm và tester mở từng phiếu xem luồng, bút toán, công nợ, kho như vận hành thật.</p>
        {!compact && !demo && <ul className="mh-seed-list">{WILL.map(([a, b]) => <li key={a}><b>{a}</b> — {b}</li>)}</ul>}
        <div className="mh-seed-actions">
          {/* type="text" + che ký tự bằng CSS: không phải ô password nên Chrome không bật hộp "Lưu mật khẩu?" khi chuyển màn */}
          <input className="input" type="text" name="seed-key" autoComplete="off" spellCheck={false} data-lpignore="true" data-1p-ignore placeholder="Mật khẩu nạp dữ liệu" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !demo && void seed(false)} style={{ width: 200, WebkitTextSecurity: 'disc' } as React.CSSProperties} />
          {!demo && <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void seed(false)}><Database size={14} style={{ verticalAlign: -2 }} /> {busy === 'seed' ? 'Đang nạp… (khoảng 10–30 giây)' : 'Nạp dữ liệu'}</button>}
          {demo > 0 && <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void seed(true)}><RefreshCw size={14} style={{ verticalAlign: -2 }} /> {busy === 'reset' ? 'Đang nạp lại…' : 'Nạp lại từ đầu'}</button>}
          {demo > 0 && <button className="btn" disabled={Boolean(busy)} onClick={() => void kho()} title="Chi nhánh mẫu chưa có kho thì thêm kho mặc định <mã>-HH — phiếu mẫu tự hiện kho, lọc theo kho được; không sửa phiếu"><Warehouse size={14} style={{ verticalAlign: -2 }} /> {busy === 'kho' ? 'Đang thêm kho…' : 'Thêm kho cho chi nhánh mẫu'}</button>}
          {demo > 0 && <button className="btn" disabled={Boolean(busy)} onClick={clear}><Trash2 size={14} style={{ verticalAlign: -2 }} /> {busy === 'clear' ? 'Đang xoá…' : 'Xoá dữ liệu tình huống'}</button>}
          {demo > 0 && <Link className="btn" to="/app/mua-hang">Xem sơ đồ quy trình →</Link>}
        </div>
        {msg && (
          <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ marginTop: 8 }}>
            {msg.text}
            {msg.errors?.length ? <ul style={{ margin: '4px 0 0 16px' }}>{msg.errors.map((e, i) => <li key={i}>{e.docNo}: {e.error}</li>)}</ul> : null}
          </div>
        )}
      </div>
    </div>
  );
}
