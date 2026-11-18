// [2026-11-19 Nguyễn Văn Thủy] thành phần báo lỗi dùng chung cho mọi khai báo / chứng từ (docs/nghiep-vu/25 §3.4): "N chưa đạt",
// danh sách quy tắc ✗ chưa đạt / ✓ đã qua kèm mã, cách sửa; mã tra cứu + nút Chép để tester dán vào báo lỗi (đóng góp)
/**
 * KẾT QUẢ KIỂM — đặt ở đầu form:
 *   <KetQuaKiem error={save.error} entity="item" />
 * - Lỗi quy tắc (error.details.findings): dải đỏ "3 chưa đạt", bấm mở danh sách ✗ (mã · câu · cách sửa) và ✓ các quy tắc đã qua
 *   (lấy từ /api/v1/catalog-rules?entity=…). Ô sai đã được tô đỏ sẵn bởi useKiemLoi (error.fields).
 * - Lỗi khác (kỹ thuật, quyền…): câu lỗi + mã lỗi.
 * - Luôn có mã tra cứu và nút Chép (chép: màn, giờ, mã lỗi, câu, mã tra cứu) — dev dán mã tra cứu vào Nhật ký kiểm / Grafana.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiError, errorText } from '@/lib/api';

export interface QuyTac { code: string; level: string; okText: string | null; field: string | null; defaults: { title: string } }
type Finding = { code: string; level: string; title: string; howTo?: string; field?: string };

/** Bộ quy tắc của một đối tượng (item, partner, account…) — dùng cho danh sách ✓ và cột Tình trạng. */
export function useQuyTac(entity?: string) {
  return useQuery({ queryKey: ['catalog-rules', entity ?? ''], enabled: Boolean(entity), staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ items: QuyTac[] }>('/api/v1/catalog-rules', { entity })).items });
}

const findingsOf = (e: unknown): Finding[] => (e instanceof ApiError && e.details && typeof e.details === 'object' && Array.isArray((e.details as { findings?: unknown }).findings)
  ? (e.details as { findings: Finding[] }).findings : []);

/** Chép thông tin lỗi để dán vào báo lỗi. */
export function chepLoi(e: unknown, extra?: string) {
  const fs = findingsOf(e);
  const a = e instanceof ApiError ? e : undefined;
  const text = [
    `Màn: ${document.title} (${window.location.pathname})`,
    `Lúc: ${new Date().toLocaleString('vi-VN', { hour12: false })}`,
    fs.length ? fs.map((f) => `- ${f.code}: ${f.title}`).join('\n') : `Lỗi: ${a?.code ?? ''} — ${errorText(e)}`,
    a?.requestId ? `Mã tra cứu: ${a.requestId}` : '',
    extra ?? '',
  ].filter(Boolean).join('\n');
  void navigator.clipboard?.writeText(text);
}

export function KetQuaKiem({ error, entity }: { error: unknown; entity?: string }) {
  const [mo, setMo] = useState(true);
  const [daChep, setDaChep] = useState(false);
  const rules = useQuyTac(entity).data ?? [];
  if (!error) return null;
  const fs = findingsOf(error);
  const a = error instanceof ApiError ? error : undefined;
  const failed = new Set(fs.map((f) => f.code));
  const passed = fs.length ? rules.filter((r) => r.okText && !failed.has(r.code) && r.level === 'block') : [];
  const chep = () => { chepLoi(error); setDaChep(true); setTimeout(() => setDaChep(false), 1500); };
  return (
    <div className="alert alert-bad full kqk" role="alert">
      <div className="kqk-head">
        {fs.length ? <button type="button" className="kqk-tog" onClick={() => setMo((x) => !x)}>{mo ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <b>{fs.length} điều chưa đạt</b>{passed.length ? <span className="muted"> · {passed.length} đã qua</span> : null}</button>
          : <span><b>{errorText(error)}</b>{a?.code ? <span className="mono muted"> · {a.code}</span> : null}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {a?.requestId && <span className="muted" style={{ fontSize: 11.5 }} title="Gửi mã này cho người hỗ trợ: tìm đúng lần lưu ở Nhật ký kiểm khai báo / Grafana">Mã tra cứu: <span className="mono">{a.requestId}</span></span>}
          <button type="button" className="btn btn-xs" title="Chép mã lỗi, câu báo và mã tra cứu — dán vào báo lỗi" onClick={chep}><Copy size={12} /> {daChep ? 'Đã chép' : 'Chép'}</button>
        </span>
      </div>
      {fs.length > 0 && mo && (
        <ul className="kqk-list">
          {fs.map((f, i) => <li key={`x${i}`} className="kqk-x"><span className="kqk-ic">✗</span><span className="mono kqk-code">{f.code}</span><span>{f.title}{f.howTo ? <span className="muted"> — {f.howTo}</span> : null}</span></li>)}
          {passed.map((r) => <li key={r.code} className="kqk-ok"><span className="kqk-ic">✓</span><span className="mono kqk-code">{r.code}</span><span>{r.okText}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/** Ô Tình trạng ở danh sách: "Đủ" / "Thiếu N" (đỏ), rê chuột thấy quy tắc chưa đạt và đã qua. */
export function TinhTrang({ codes, rules, draft }: { codes: string[]; rules: QuyTac[]; draft?: boolean }) {
  const blocks = rules.filter((r) => r.level === 'block' && r.okText);
  const bad = codes.filter(Boolean);
  const title = [
    ...bad.map((c) => `✗ ${c}: ${rules.find((r) => r.code === c)?.defaults.title.replace(/\{\w+\}/g, '…') ?? ''}`),
    ...blocks.filter((r) => !bad.includes(r.code)).map((r) => `✓ ${r.code}: ${r.okText}`),
  ].join('\n');
  if (!bad.length && !draft) return <span className="badge badge-ok" title={title}>Đủ</span>;
  return <span className="badge badge-bad" title={title}>{bad.length ? `Thiếu ${bad.length}` : 'Nháp'}</span>;
}
