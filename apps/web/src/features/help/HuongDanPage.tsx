// [2026-11-12 Nguyễn Văn Thủy] HT17 Thẻ hướng dẫn: danh sách thẻ, soạn tự do (chữ, màu, bảng, ảnh), nơi gắn (0113) (đóng góp)
/**
 * THẺ HƯỚNG DẪN (HT17): mỗi thẻ là một trang hướng dẫn; màn / hộp thoại nào hiện thẻ nào thì gắn ở nút Hướng dẫn của màn đó.
 *   Trái: danh sách thẻ (tìm, + Thẻ mới, Chép tài liệu có sẵn). Phải: tiêu đề + trình soạn tự do + nơi đang gắn.
 *   Mở thẳng một thẻ: /he-thong/huong-dan?the=<id>.
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { helpHtml, type HelpCard } from '@/components/HelpDrawer';
import { listGuides, getGuide } from '@/help/guides';
import './huong-dan.css';

export function HuongDanPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const sel = params.get('the') ?? '';
  const cards = useQuery({ queryKey: ['help', 'cards'], queryFn: () => api.get<HelpCard[]>('/api/v1/help/cards') });
  const [find, setFind] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pick = (id: string) => setParams(id ? { the: id } : {});
  const list = (cards.data ?? []).filter((c) => !find || `${c.title} ${c.places?.map((p) => `${p.label} ${p.key}`).join(' ')}`.toLowerCase().includes(find.toLowerCase()));

  const add = async () => {
    const c = await api.post<HelpCard>('/api/v1/help/cards', { title: 'Thẻ hướng dẫn mới', body: '', format: 'html' });
    await qc.invalidateQueries({ queryKey: ['help', 'cards'] }); pick(c.id);
  };
  const importAll = async () => {
    setMsg(null);
    try {
      const docs = listGuides().map((g) => ({ key: g.key, title: g.title, body: getGuide(g.key) ?? '' }));
      const r = await api.post<{ added: number; bound: number }>('/api/v1/help/import', { docs });
      setMsg({ ok: true, text: `Đã chép ${r.added} tài liệu thành thẻ, gắn ${r.bound} màn.` });
      await qc.invalidateQueries({ queryKey: ['help'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <>
      <PageHeader title="Thẻ hướng dẫn" code="HT17" helpKey="the-huong-dan" subtitle="Soạn hướng dẫn sử dụng; gắn thẻ vào từng màn / hộp thoại ở nút Hướng dẫn của màn đó" />
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ marginBottom: 8 }}>{msg.text}</div>}
      <div className="hd-wrap">
        <div className="card hd-list">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => void add()}>+ Thẻ mới</button>
            <button className="btn btn-sm" onClick={() => void importAll()} title="Chép mọi tài liệu hướng dẫn có sẵn thành thẻ (đã chép thì bỏ qua) và gắn vào màn tương ứng">Chép tài liệu có sẵn</button>
          </div>
          <input className="input" placeholder="Tìm tiêu đề, màn đang gắn" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="hd-items">
            {list.map((c) => (
              <button key={c.id} type="button" className={`hd-item${c.id === sel ? ' on' : ''}`} onClick={() => pick(c.id)} title={c.places?.map((p) => p.label || p.key).join(', ')}>
                <b>{c.title || `Thẻ #${c.id}`}</b>
                <small className="muted">{c.places?.length ? `${c.places.length} nơi gắn` : 'chưa gắn'} · {c.updatedBy}</small>
              </button>
            ))}
            {!cards.isLoading && !list.length && <div className="muted" style={{ padding: 8 }}>Chưa có thẻ. Bấm <b>Chép tài liệu có sẵn</b> hoặc <b>+ Thẻ mới</b>.</div>}
          </div>
        </div>
        <div className="card hd-edit">{sel ? <SoanThe key={sel} id={sel} onDeleted={() => pick('')} /> : <div className="muted" style={{ padding: 16 }}>Chọn một thẻ bên trái để xem, sửa.</div>}</div>
      </div>
    </>
  );
}

function SoanThe({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['help', 'card', id], queryFn: () => api.get<HelpCard>(`/api/v1/help/cards/${id}`) });
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ed = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => (q.data ? helpHtml(q.data) : ''), [q.data]);
  useEffect(() => { if (q.data) { setTitle(q.data.title); if (ed.current) ed.current.innerHTML = initial; setDirty(false); } }, [q.data, initial]);

  const save = async () => {
    setMsg(null);
    try {
      await api.patch(`/api/v1/help/cards/${id}`, { title, body: ed.current?.innerHTML ?? '', format: 'html' });
      setDirty(false); setMsg({ ok: true, text: 'Đã ghi.' });
      void qc.invalidateQueries({ queryKey: ['help'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  const del = async () => {
    if (!window.confirm('Xoá thẻ này? Các màn đang gắn thẻ sẽ thành chưa gắn.')) return;
    try { await api.delete(`/api/v1/help/cards/${id}`); void qc.invalidateQueries({ queryKey: ['help'] }); onDeleted(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="muted" style={{ padding: 16 }}>Đang tải…</div>;
  if (!q.data) return <div className="alert alert-bad">{q.error ? errorText(q.error) : 'Không có thẻ'}</div>;
  return (
    <div className="hd-soan">
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <input className="input hd-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="Tiêu đề thẻ" />
        <button className="btn btn-primary" onClick={() => void save()} title="Ctrl + S">Ghi{dirty ? ' *' : ''}</button>
        <button className="btn" onClick={() => void del()}>Xoá</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '6px 0' }}>{msg.text}</div>}
      <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
        Đang gắn ở: {q.data.places?.length ? q.data.places.map((p) => <span key={p.key} className="badge badge-gray" style={{ marginRight: 4 }} title={p.key}>{p.label || p.key}</span>) : 'chưa màn nào — mở màn cần gắn, bấm Hướng dẫn, chọn thẻ này'}
      </div>
      <ThanhCongCu ed={ed} onChange={() => setDirty(true)} />
      <div ref={ed} className="doc hd-editor" contentEditable suppressContentEditableWarning onInput={() => setDirty(true)} onPaste={(e) => onPasteImage(e, () => setDirty(true))} />
    </div>
  );
}

const cmd = (c: string, v?: string) => document.execCommand(c, false, v);
function insertImage(src: string) { cmd('insertHTML', `<img src="${src}" style="max-width:100%" />`); }
function onPasteImage(e: ClipboardEvent<HTMLDivElement>, changed: () => void) {
  // Dán từ Word / web (có HTML): giữ nguyên nội dung, định dạng. Chỉ ảnh rời (chụp màn hình) mới chèn thành ảnh.
  if (e.clipboardData.types.includes('text/html')) return;
  const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'));
  if (!f) return;
  e.preventDefault();
  const r = new FileReader(); r.onload = () => { insertImage(String(r.result)); changed(); }; r.readAsDataURL(f);
}

function ThanhCongCu({ ed, onChange }: { ed: React.RefObject<HTMLDivElement>; onChange: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const run = (f: () => void) => (e: React.MouseEvent) => { e.preventDefault(); ed.current?.focus(); f(); onChange(); };
  const table = () => {
    const rc = window.prompt('Số dòng × số cột (vd 3x3)', '3x3'); if (!rc) return;
    const [r, c] = rc.toLowerCase().split(/[x×*]/).map((n) => Math.max(1, Math.min(30, Number(n) || 0)));
    const row = (tag: string) => `<tr>${Array.from({ length: c! }, () => `<${tag}>&nbsp;</${tag}>`).join('')}</tr>`;
    cmd('insertHTML', `<table class="hd-table"><thead>${row('th')}</thead><tbody>${Array.from({ length: Math.max(0, r! - 1) }, () => row('td')).join('')}</tbody></table><p></p>`);
  };
  return (
    <div className="hd-tools">
      <select className="select input" defaultValue="" onChange={(e) => { ed.current?.focus(); cmd('formatBlock', e.target.value); e.target.value = ''; onChange(); }} title="Kiểu đoạn">
        <option value="" disabled>Kiểu đoạn</option><option value="p">Đoạn thường</option><option value="h2">Tiêu đề lớn</option><option value="h3">Tiêu đề nhỏ</option><option value="blockquote">Khung ghi chú</option>
      </select>
      <select className="select input" defaultValue="" onChange={(e) => { ed.current?.focus(); cmd('fontSize', e.target.value); e.target.value = ''; onChange(); }} title="Cỡ chữ">
        <option value="" disabled>Cỡ chữ</option><option value="2">Nhỏ</option><option value="3">Vừa</option><option value="4">Lớn</option><option value="5">Rất lớn</option><option value="6">Cực lớn</option>
      </select>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('bold'))} title="Đậm (Ctrl+B)"><b>Đ</b></button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('italic'))} title="Nghiêng (Ctrl+I)"><i>N</i></button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('underline'))} title="Gạch chân (Ctrl+U)"><u>G</u></button>
      <label className="btn btn-sm hd-color" title="Màu chữ">A<input type="color" onChange={(e) => { ed.current?.focus(); cmd('foreColor', e.target.value); onChange(); }} /></label>
      <label className="btn btn-sm hd-color" title="Tô nền chữ"><span style={{ background: '#fff59d', padding: '0 3px' }}>A</span><input type="color" defaultValue="#fff59d" onChange={(e) => { ed.current?.focus(); cmd('hiliteColor', e.target.value); onChange(); }} /></label>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('insertUnorderedList'))} title="Danh sách chấm">• Danh sách</button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('insertOrderedList'))} title="Danh sách số">1. Danh sách</button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('justifyLeft'))} title="Căn trái">⯇</button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('justifyCenter'))} title="Căn giữa">≡</button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('justifyRight'))} title="Căn phải">⯈</button>
      <button className="btn btn-sm" onMouseDown={run(table)} title="Chèn bảng">Bảng</button>
      <button className="btn btn-sm" onMouseDown={run(() => { const u = window.prompt('Đường dẫn ảnh (https://…)'); if (u) insertImage(u); })} title="Chèn ảnh theo đường dẫn">Ảnh (link)</button>
      <button className="btn btn-sm" onMouseDown={(e) => { e.preventDefault(); file.current?.click(); }} title="Chèn ảnh từ máy (hoặc dán ảnh thẳng vào nội dung)">Ảnh (máy)</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ed.current?.focus(); insertImage(String(r.result)); onChange(); }; r.readAsDataURL(f); e.target.value = ''; }} />
      <button className="btn btn-sm" onMouseDown={run(() => { const u = window.prompt('Đường dẫn liên kết'); if (u) cmd('createLink', u); })} title="Gắn liên kết">Liên kết</button>
      <button className="btn btn-sm" onMouseDown={run(() => cmd('removeFormat'))} title="Xoá định dạng đoạn đang chọn">Xoá định dạng</button>
    </div>
  );
}
