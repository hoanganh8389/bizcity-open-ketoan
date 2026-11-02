// [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: khay Mã tra cứu: mọi lỗi API hiện requestId / traceId, nút Chép, Báo lỗi (D019-6).
/**
 * Khay **Mã tra cứu** góc dưới trái, gắn một lần ở AppLayout nên có ở mọi màn mà không phải sửa từng chỗ hiện lỗi (264 chỗ dùng
 * errorText). Câu lỗi vẫn hiện ở màn như cũ; khay chỉ thêm mã để người dùng gửi cho dev (Sổ tay điều tra lỗi TH-01).
 *
 * - Hai loại, có chữ chứ không chỉ màu (U2): "Từ chối đúng luật" (cam) / "Lỗi kỹ thuật" (đỏ).
 * - **Chép**: mã + thời điểm + màn. **Báo lỗi**: nội dung theo bao-loi.yml, chỉ mã, không dữ liệu (Q019-5: chỉ chép, không mở GitHub).
 * - Lỗi mới thay lỗi cũ; mũi tên xem lại tối đa 5 lỗi gần nhất của tab. Bấm × thì ẩn đến lỗi kế tiếp.
 * - "Mở trong Bàn điều tra" (W3): chỉ người có devtools:read (chủ đơn vị, Nhà phát triển); mở Tra mã với traceId (không có thì requestId).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bug, ChevronLeft, ChevronRight, Copy, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { khoMaTraCuu, loaiLoi, moTaLyDo, noiDungBaoLoi, noiDungChep, tomTatMa, type PhienBan } from '@/lib/maTraCuu';

/** navigator.clipboard chỉ có ở https / localhost; máy chủ LAN chạy http thì chép bằng ô chữ ẩn. */
async function chep(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* rơi xuống cách cũ */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function MaTraCuu() {
  const ds = useSyncExternalStore(khoMaTraCuu.nghe, khoMaTraCuu.ds);
  const [an, setAn] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [daChep, setDaChep] = useState<'' | 'chep' | 'bao-loi' | 'loi'>('');
  // Cùng khoá với AppLayout → dùng chung một lần gọi /system/health.
  const pb = useQuery({ queryKey: ['book-mode'], queryFn: () => api.get<PhienBan & { bookMode?: string; envLabel?: string; bugReportUrl?: string | null }>('/api/v1/system/health'), staleTime: Infinity }).data;
  // [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: bản cài đặt BUG_REPORT_URL → Báo lỗi chép nội dung rồi mở trang báo lỗi (Q019-5)
  const bugUrl = pb?.bugReportUrl && /^https?:\/\//i.test(pb.bugReportUrl) ? pb.bugReportUrl : null;
  const { can } = useAuth();
  const navigate = useNavigate();

  // Lỗi mới về: quay lại lỗi mới nhất, hiện lại khay.
  const moiNhat = ds[0] ? `${ds[0].at}|${ds[0].requestId ?? ''}` : undefined;
  useEffect(() => { setI(0); setDaChep(''); }, [moiNhat]);
  useEffect(() => {
    if (!daChep) return;
    const t = window.setTimeout(() => setDaChep(''), 2500);
    return () => window.clearTimeout(t);
  }, [daChep]);

  const e = ds[Math.min(i, ds.length - 1)];
  if (!e || an === moiNhat) return null;
  const loai = loaiLoi(e);
  const bam = async (kieu: 'chep' | 'bao-loi') => {
    const ok = await chep(kieu === 'chep' ? noiDungChep(e) : noiDungBaoLoi(e, pb));
    setDaChep(ok ? kieu : 'loi');
    // Chép trước (cần trang đang được focus), mở tab sau; người báo dán nội dung vào form của trang báo lỗi.
    if (kieu === 'bao-loi' && bugUrl) window.open(bugUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`ma-tra-cuu ${loai}`} role="status" aria-live="polite">
      <AlertTriangle size={15} className="mtc-icon" aria-hidden />
      <div className="mtc-body">
        <div className="mtc-head">
          <b>{loai === 'ky-thuat' ? 'Lỗi kỹ thuật' : 'Từ chối đúng luật'}</b>
          <code title={moTaLyDo(e.reason)}>{e.code}{e.reason ? ` · ${e.reason}` : ''}</code>
        </div>
        <div className="mtc-ids" title={`requestId: ${e.requestId ?? '—'}\ntraceId: ${e.traceId ?? '—'}`}>
          Mã tra cứu: <code>{tomTatMa(e)}</code>
        </div>
        <div className="mtc-actions">
          <button type="button" className="btn btn-xs" onClick={() => void bam('chep')} title="Chép requestId, traceId, thời điểm, màn">
            <Copy size={12} /> {daChep === 'chep' ? 'Đã chép' : 'Chép'}
          </button>
          <button type="button" className="btn btn-xs" onClick={() => void bam('bao-loi')} title={bugUrl ? 'Chép nội dung báo lỗi (chỉ mã, không dữ liệu) rồi mở trang báo lỗi — dán vào form' : 'Chép nội dung báo lỗi theo mẫu (chỉ mã, không dữ liệu) — dán vào issue hoặc gửi cho dev'}>
            <Bug size={12} /> {daChep === 'bao-loi' ? 'Đã chép nội dung' : 'Báo lỗi'}
          </button>
          {/* [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: mở thẳng màn Tra mã (người có devtools:read) */}
          {can('devtools:read') && (e.traceId || e.requestId) && (
            <button type="button" className="btn btn-xs" onClick={() => navigate(`/dev/tra-ma?ma=${encodeURIComponent(e.traceId ?? e.requestId!)}`)} title="Mở mã này ở Bàn điều tra → Tra mã">
              <Search size={12} /> Bàn điều tra
            </button>
          )}
          {daChep === 'loi' && <span className="mtc-note">Trình duyệt chặn chép — rê chuột lên mã để xem đủ</span>}
          {ds.length > 1 && (
            <span className="mtc-nav">
              <button type="button" className="btn btn-xs btn-ghost" disabled={i >= ds.length - 1} onClick={() => setI(i + 1)} aria-label="Lỗi trước"><ChevronLeft size={12} /></button>
              {i + 1}/{ds.length}
              <button type="button" className="btn btn-xs btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Lỗi sau"><ChevronRight size={12} /></button>
            </span>
          )}
        </div>
      </div>
      <button type="button" className="btn btn-xs btn-ghost mtc-close" onClick={() => setAn(moiNhat ?? null)} aria-label="Ẩn mã tra cứu"><X size={13} /></button>
    </div>
  );
}
