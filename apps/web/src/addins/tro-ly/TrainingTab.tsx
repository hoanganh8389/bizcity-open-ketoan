/**
 * Thẻ "Dữ liệu huấn luyện" của Trợ lý: tester / kế toán thêm câu hỏi - câu trả lời, hướng dẫn thao tác, kèm ảnh và
 * mã màn liên quan; robot và thẻ Hỏi đáp dùng ngay. Máy chủ lưu tệp JSONL (không bảng cơ sở dữ liệu), ảnh lưu tệp riêng.
 * Người có quyền sửa danh mục mới thêm / sửa / xoá / nhập; còn lại chỉ xem và thử hỏi.
 * Có "Thử hỏi" để kiểm tra câu hỏi sẽ ra câu trả lời nào; xuất / nhập JSONL để chuyển dữ liệu giữa các máy.
 */
import { useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ImagePlus, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { CORE_MENU, flattenMenu, mergeAddInMenu, type AddInManifestDto } from '@/layout/menu';
import { fold, KNOWLEDGE_URL, safeMarkdown, searchFaq, trainedFaq, useTraining, type TrainingEntry } from './knowledge';

const KIND_TEXT = { faq: 'Hỏi đáp', guide: 'Hướng dẫn' } as const;
const MAX_IMAGE = 3 * 1024 * 1024;
const splitList = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
const dt = (s: string) => new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

type Draft = { id?: string; kind: 'faq' | 'guide'; question: string; keywords: string; answer: string; screens: string; active: boolean };
const EMPTY: Draft = { kind: 'faq', question: '', keywords: '', answer: '', screens: '', active: true };

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Không đọc được ảnh'));
    r.readAsDataURL(file);
  });
}

function useScreens() {
  const addins = useQuery({ queryKey: ['addins'], queryFn: () => api.get<AddInManifestDto[]>('/api/v1/system/addins'), staleTime: 300_000 }).data ?? [];
  return useMemo(() => flattenMenu(mergeAddInMenu(CORE_MENU, addins)), [addins]);
}

function Editor({ value, readOnly, onClose }: { value: Draft; readOnly: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const screens = useScreens();
  const [v, setV] = useState<Draft>(value);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => setV((x) => ({ ...x, ...p }));
  const codes = splitList(v.screens).map((c) => c.toUpperCase());
  const known = codes.map((c) => ({ c, s: screens.find((x) => x.code?.toUpperCase() === c) }));

  const done = () => { qc.invalidateQueries({ queryKey: ['tro-ly-knowledge'] }); onClose(); };
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = { kind: v.kind, question: v.question.trim(), keywords: splitList(v.keywords), answer: v.answer.trim(), screens: codes, active: v.active };
      return v.id ? api.put(`${KNOWLEDGE_URL}/${v.id}`, body) : api.post(KNOWLEDGE_URL, body);
    },
    onSuccess: () => { if (v.id) { qc.invalidateQueries({ queryKey: ['tro-ly-knowledge'] }); viewAgain[1](); } else done(); },
    onError: (e) => setErr(errorText(e)),
  });
  const del = useMutation({ mutationFn: () => api.delete(`${KNOWLEDGE_URL}/${v.id}`), onSuccess: done, onError: (e) => setErr(errorText(e)) });

  /** Tải ảnh lên máy chủ rồi chèn ![ảnh](đường dẫn) vào chỗ con trỏ. */
  const addImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setErr('');
    setUploading(true);
    try {
      let text = '';
      for (const f of imgs) {
        if (f.size > MAX_IMAGE) throw new Error(`Ảnh "${f.name}" quá 3 MB`);
        const { url } = await api.post<{ url: string }>('/api/v1/addins/tro-ly/images', { dataUrl: await readDataUrl(f) });
        text += `\n![${f.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '') || 'ảnh'}](${url})\n`;
      }
      const el = area.current;
      const at = el ? el.selectionStart : v.answer.length;
      const next = v.answer.slice(0, at) + text + v.answer.slice(at);
      set({ answer: next });
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); });
    } catch (e) { setErr(errorText(e)); } finally { setUploading(false); }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void addImages(files); }
  };

  const ready = v.question.trim().length >= 3 && v.answer.trim().length > 0 && !save.isPending;
  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean(v.id) && !readOnly} wide title={readOnly ? 'Mục huấn luyện' : v.id ? 'Sửa mục huấn luyện' : 'Thêm mục huấn luyện'} onClose={onClose}
      footer={<>
        {!readOnly && <button className="btn btn-primary" disabled={!ready} onClick={() => save.mutate()}>Ghi</button>}
        {!readOnly && v.id && <button data-view-ok className="btn btn-danger" disabled={del.isPending} onClick={() => window.confirm('Xoá mục này? Robot sẽ không dùng nữa.') && del.mutate()}><Trash2 size={14} /> Xoá</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      {err && <div className="full"><ErrorBox error={err} /></div>}
      <Field label="Loại">
        <select className="input" value={v.kind} disabled={readOnly} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
          <option value="faq">Hỏi đáp (câu hỏi - câu trả lời)</option>
          <option value="guide">Hướng dẫn thao tác</option>
        </select>
      </Field>
      <Field label="Trạng thái">
        <label className="row" style={{ gap: 6, minHeight: 30 }}><input type="checkbox" checked={v.active} disabled={readOnly} onChange={(e) => set({ active: e.target.checked })} /> Đang dùng (bỏ tích để tạm ẩn khỏi robot)</label>
      </Field>
      <Field label="Câu hỏi / tên hướng dẫn (*)" full>
        <input className="input" value={v.question} disabled={readOnly} onChange={(e) => set({ question: e.target.value })} placeholder="Ví dụ: Phiếu chi tạm ứng cho nhân viên ghi thế nào?" autoFocus />
      </Field>
      <Field label="Từ khoá thêm" full hint="Cách gọi khác, viết tắt, từ hay gõ sai — cách nhau bằng dấu phẩy. Trùng nguyên cụm thì được ưu tiên.">
        <input className="input" value={v.keywords} disabled={readOnly} onChange={(e) => set({ keywords: e.target.value })} placeholder="tạm ứng, tam ung, 141, ứng tiền" />
      </Field>
      <Field label="Màn liên quan" full hint="Mã màn cách nhau bằng dấu phẩy; robot hiện nút mở màn.">
        <input className="input mono" value={v.screens} disabled={readOnly} onChange={(e) => set({ screens: e.target.value })} placeholder="ACC14, ACC89" />
        {known.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {known.map(({ c, s }) => <span key={c} className={`badge ${s ? 'badge-info' : 'badge-bad'}`} title={s ? s.group : 'Không có màn mang mã này'}>{c}{s ? ` · ${s.label}` : ' · không có'}</span>)}
          </div>
        )}
      </Field>
      <div className="field full">
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Câu trả lời / nội dung (*) <span className="muted" style={{ fontWeight: 400 }}>— markdown: **đậm**, - gạch đầu dòng, ![mô tả](ảnh)</span></span>
          {!readOnly && (
            <span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = ''; }} />
              <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()} title="Chọn ảnh, hoặc dán ảnh (Ctrl + V) thẳng vào ô nội dung"><ImagePlus size={14} /> {uploading ? 'Đang tải ảnh…' : 'Chèn ảnh'}</button>
            </span>
          )}
        </label>
        <div className="troly-edit">
          <textarea ref={area} className="input" value={v.answer} disabled={readOnly} onChange={(e) => set({ answer: e.target.value })} onPaste={onPaste}
            placeholder={'Viết câu trả lời. Dán ảnh chụp màn hình bằng Ctrl + V.\n\nVí dụ:\n1. Vào **Phiếu chi (ACC21)**\n2. Chọn lý do **Tạm ứng** → Nợ 141 / Có 1111'} />
          {/* safeMarkdown: chặn HTML thô, chỉ nhận liên kết / ảnh an toàn. */}
          <div className="doc troly-preview" dangerouslySetInnerHTML={{ __html: v.answer.trim() ? safeMarkdown(v.answer) : '<p class="muted">Xem trước câu trả lời hiện ở đây.</p>' }} />
        </div>
      </div>
    </Modal>
  );
}

export function TrainingTab() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const list = useTraining();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'' | 'faq' | 'guide'>('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [probe, setProbe] = useState('');
  const [msg, setMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const rows = list.data ?? [];
  const qf = fold(text.trim());
  const shown = rows.filter((x) => (!kind || x.kind === kind) && (!qf || fold(`${x.question} ${x.keywords.join(' ')} ${x.answer} ${x.screens.join(' ')}`).includes(qf)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const hits = probe.trim() ? searchFaq(probe, 3, trainedFaq(rows)) : [];

  const imp = useMutation({
    mutationFn: async (file: File) => api.post<{ added: number; updated: number; badLines: number[] }>(`${KNOWLEDGE_URL}/import`, { jsonl: await file.text() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tro-ly-knowledge'] });
      setMsg(`Đã nhập: thêm ${r.added}, cập nhật ${r.updated}${r.badLines.length ? `; bỏ qua dòng lỗi ${r.badLines.join(', ')}` : ''}.`);
    },
    onError: (e) => setMsg(errorText(e)),
  });
  const open = (x?: TrainingEntry) => setEdit(x
    ? { id: x.id, kind: x.kind, question: x.question, keywords: x.keywords.join(', '), answer: x.answer, screens: x.screens.join(', '), active: x.active }
    : EMPTY);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Search size={16} className="muted" />
        <input className="input" style={{ flex: 1, minWidth: 200, maxWidth: 420 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lọc theo câu hỏi, từ khoá, nội dung, mã màn…" />
        <select className="input" style={{ width: 140 }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">Tất cả loại</option><option value="faq">Hỏi đáp</option><option value="guide">Hướng dẫn</option>
        </select>
        <span className="muted">{shown.length} / {rows.length} mục</span>
        <span style={{ flex: 1 }} />
        {canWrite && <button className="btn btn-primary" onClick={() => open()}><Plus size={15} /> Thêm</button>}
        {canWrite && <>
          <input ref={importRef} type="file" accept=".jsonl,.ndjson,.txt,application/x-ndjson" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ''; }} />
          <button className="btn" disabled={imp.isPending} onClick={() => importRef.current?.click()} title="Nhập tệp JSONL (mỗi dòng một mục; trùng id thì ghi đè)"><Upload size={15} /> Nhập JSONL</button>
        </>}
        <button className="btn" disabled={!rows.length} onClick={() => api.download(`${KNOWLEDGE_URL}/export`, {}, 'tro-ly-huan-luyen.jsonl').catch((e) => setMsg(errorText(e)))}><Download size={15} /> Xuất JSONL</button>
      </div>
      {msg && <div className="alert alert-info" style={{ cursor: "pointer" }} onClick={() => setMsg('')}>{msg}</div>}

      <div className="card">
        <div className="card-body" style={{ padding: '8px 10px', display: 'grid', gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <b style={{ whiteSpace: 'nowrap' }}>Thử hỏi</b>
            <input className="input" style={{ flex: 1, maxWidth: 520 }} value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Gõ câu hỏi như người dùng sẽ hỏi robot, xem robot trả lời mục nào" />
          </div>
          {probe.trim() && (hits.length === 0
            ? <div className="muted">Robot chưa tìm thấy câu trả lời — nên thêm một mục, hoặc thêm từ khoá cho mục sẵn có.</div>
            : hits.map((h, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <span className={`badge ${h.id ? 'badge-ok' : 'badge-gray'}`}>{h.id ? 'Huấn luyện' : 'Tài liệu sẵn'}</span>
                {h.id ? <a href="#" onClick={(e) => { e.preventDefault(); open(rows.find((x) => x.id === h.id)); }}>{h.q}</a> : <span>{h.q}</span>}
                <span className="muted">điểm {h.s}</span>
              </div>
            )))}
        </div>
      </div>

      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={errorText(list.error)} /> : (
        <div className="card table-wrap">
          <table className="grid">
            <thead><tr><th style={{ width: 90 }}>Loại</th><th>Câu hỏi / hướng dẫn</th><th>Từ khoá</th><th style={{ width: 120 }}>Màn</th><th style={{ width: 90 }}>Trạng thái</th><th style={{ width: 170 }}>Sửa lần cuối</th></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id} className="clickable" onClick={() => open(x)} title={canWrite ? 'Bấm để sửa' : 'Bấm để xem'}>
                  <td>{KIND_TEXT[x.kind]}</td>
                  <td style={{ whiteSpace: 'normal' }}><b>{x.question}</b>{x.answer.includes('![') && <span className="muted"> · có ảnh</span>}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>{x.keywords.join(', ')}</td>
                  <td className="mono">{x.screens.join(', ')}</td>
                  <td>{x.active ? <span className="badge badge-ok">Đang dùng</span> : <span className="badge badge-gray">Tạm ẩn</span>}</td>
                  <td className="muted">{dt(x.updatedAt)} · {x.updatedBy}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="empty">{rows.length ? 'Không có mục phù hợp bộ lọc.' : canWrite ? 'Chưa có mục nào. Bấm "Thêm" để dạy robot câu hỏi đầu tiên.' : 'Chưa có mục nào.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {edit && <Editor value={edit} readOnly={!canWrite} onClose={() => setEdit(null)} />}
    </div>
  );
}
