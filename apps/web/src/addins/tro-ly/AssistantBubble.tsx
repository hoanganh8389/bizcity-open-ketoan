/**
 * Robot trợ lý nổi ở góc phải dưới mọi màn (add-in "tro-ly" bật mới hiện). Bấm để mở khung trò chuyện: gõ câu hỏi,
 * robot tìm trong hỏi đáp thường gặp, màn chức năng và hướng dẫn sử dụng (knowledge.ts) rồi trả lời kèm nút mở màn /
 * đọc hướng dẫn. Tầng 1, không dùng AI — câu trả lời lấy từ tài liệu soạn sẵn trong mã nguồn và dữ liệu huấn luyện
 * người dùng thêm ở trang Trợ lý (thẻ "Dữ liệu huấn luyện").
 * Cuộc trò chuyện nhớ trong phiên. Robot kéo thả đi chỗ khác được (nhớ vị trí trên máy); bấm "Ẩn" thì robot thu lên
 * thanh trên cùng (TroLyDock, nhớ trên máy), bấm biểu tượng ở đó để gọi ra lại. Mặc định đang thu gọn.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, X } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { HelpDrawer } from '@/components/HelpDrawer';
import { FAQ, safeMarkdown, screensByCode, searchFaq, searchGuides, searchScreens, trainedFaq, useTraining } from './knowledge';

interface Reply { faq: { q: string; a: string }[]; screens: { label: string; path: string; code?: string; group: string }[]; guides: { key: string; title: string }[] }
interface Msg { from: 'user' | 'bot'; text: string; reply?: Reply }

const STORE = 'ketoan.troly.chat';
const DOCK = 'ketoan.troly.docked';
const POS = 'ketoan.troly.pos';
const FAB = 56;
const EDGE = 8;

/* Trạng thái "thu lên thanh trên" dùng chung giữa robot và nút trên thanh trên cùng; lưu localStorage (nhớ trên máy). */
const dockListeners = new Set<() => void>();
// Mặc định THU GỌN (robot không nổi trên màn, chỉ có biểu tượng nhỏ trên thanh trên); người dùng gọi ra thì nhớ "0".
let docked = (() => { try { return localStorage.getItem(DOCK) !== '0'; } catch { return true; } })();
function setDocked(v: boolean) {
  docked = v;
  try { localStorage.setItem(DOCK, v ? '1' : '0'); } catch { /* bỏ qua */ }
  dockListeners.forEach((f) => f());
}
const useDocked = () => useSyncExternalStore((f) => { dockListeners.add(f); return () => { dockListeners.delete(f); }; }, () => docked);

/** Nút robot trên thanh trên cùng — chỉ hiện khi robot đang thu gọn lên đây. */
export function TroLyDock() {
  const isDocked = useDocked();
  if (!isDocked) return null;
  return (
    <button type="button" className="btn btn-sm btn-ghost troly-dock" onClick={() => window.dispatchEvent(new Event('troly:open'))} title="Trợ lý ERP — bấm để mở (robot đang thu gọn lên thanh trên)">
      <Bot size={18} /><span className="troly-fab-dot" />
    </button>
  );
}

/** Vị trí robot: khoảng cách tới mép phải / mép dưới màn hình (px), luôn nằm trong màn hình. */
type Pos = { right: number; bottom: number };
const clampPos = (p: Pos): Pos => ({
  right: Math.max(EDGE, Math.min(p.right, window.innerWidth - FAB - EDGE)),
  bottom: Math.max(EDGE, Math.min(p.bottom, window.innerHeight - FAB - EDGE)),
});
const loadPos = (): Pos => {
  try { const v = JSON.parse(localStorage.getItem(POS) ?? 'null'); if (v && Number.isFinite(v.right) && Number.isFinite(v.bottom)) return v; } catch { /* bỏ qua */ }
  return { right: 20, bottom: 20 };
};
const HELLO: Msg = { from: 'bot', text: 'Xin chào! Mình là trợ lý ERP. Bạn cần tìm màn nào, hay muốn hỏi về chứng từ, định khoản? Gõ câu hỏi hoặc bấm gợi ý bên dưới.' };
const SUGGEST = ['Chờ huỷ là gì?', 'Vì sao bút toán bị đảo?', 'Giá vốn tính khi nào?', 'Đổi trả tại quầy ghi thế nào?', 'Xem luồng bút toán', 'Sổ nhật ký chung'];

const load = (): Msg[] => { try { const v = JSON.parse(sessionStorage.getItem(STORE) ?? 'null'); return Array.isArray(v) && v.length ? v : [HELLO]; } catch { return [HELLO]; } };

export function AssistantBubble({ menu }: { menu: MenuItem[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isDocked = useDocked();
  const [pos, setPos] = useState<Pos>(() => clampPos(loadPos()));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: Pos; moved: boolean } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [text, setText] = useState('');
  const [guide, setGuide] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const trained = trainedFaq(useTraining().data);

  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch { /* bỏ qua */ } }, [msgs]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, open]);
  // Nút trên thanh trên / trang Trợ lý gọi robot ra.
  useEffect(() => {
    const show = () => { setDocked(false); setOpen(true); };
    window.addEventListener('troly:open', show);
    return () => window.removeEventListener('troly:open', show);
  }, []);
  // Đổi cỡ cửa sổ: kéo robot vào lại trong màn hình.
  useEffect(() => {
    const fit = () => setPos((p) => clampPos(p));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  /* Kéo thả robot: nhấn giữ rồi kéo; nhả ra mà gần như không di chuyển thì coi là bấm (mở khung trò chuyện). */
  const onDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, start: pos, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setPos(clampPos({ right: d.start.right - dx, bottom: d.start.bottom - dy }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setOpen(true); return; }
    setDragging(false);
    setPos((p) => { try { localStorage.setItem(POS, JSON.stringify(p)); } catch { /* bỏ qua */ } return p; });
  };
  // Khung trò chuyện mở ở góc của robot, co lại cho vừa màn hình.
  const chatW = Math.min(400, window.innerWidth - 24);
  const chatH = Math.min(600, window.innerHeight - 90);
  const chatStyle = {
    right: Math.max(EDGE, Math.min(pos.right, window.innerWidth - chatW - EDGE)),
    bottom: Math.max(EDGE, Math.min(pos.bottom, window.innerHeight - chatH - EDGE)),
  };

  const ask = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setText('');
    if (/luong but toan|luồng bút toán|dinh khoan the nao|định khoản thế nào/i.test(t)) {
      setMsgs((m) => [...m, { from: 'user', text: t }, { from: 'bot', text: 'Mở trang Trợ lý → thẻ "Luồng bút toán": chọn loại chứng từ, lý do… để xem bút toán Nợ / Có đúng theo cấu hình hiện tại.', reply: { faq: [], screens: [{ label: 'Trợ lý: luồng bút toán', path: '/addins/tro-ly', code: 'TI12', group: 'Tiện ích' }], guides: [] } }]);
      return;
    }
    const faq = searchFaq(t, 2, trained);
    // Màn gắn với câu trả lời huấn luyện đứng trước, rồi tới màn tìm theo tên.
    const linked = faq.flatMap((f) => screensByCode(menu, f.screens));
    const screens = [...linked, ...searchScreens(menu, t, 5)].filter((x, i, arr) => arr.findIndex((y) => y.path === x.path) === i).slice(0, 6);
    const reply: Reply = { faq: faq.map((f) => ({ q: f.q, a: f.a })), screens, guides: searchGuides(t, 2) };
    const found = reply.faq.length + reply.screens.length + reply.guides.length > 0;
    setMsgs((m) => [...m, { from: 'user', text: t }, {
      from: 'bot',
      text: found ? (reply.faq.length ? '' : 'Mình tìm thấy những mục này:') : 'Mình chưa tìm thấy câu trả lời. Bạn thử diễn đạt khác (ví dụ gõ tên màn, mã màn như ACC89, hoặc từ khoá: giá vốn, chờ huỷ, đối trừ…), hoặc xem danh sách hỏi đáp ở trang Trợ lý.',
      reply: found ? reply : { faq: [], screens: [{ label: 'Trợ lý: hỏi đáp thường gặp', path: '/addins/tro-ly', code: 'TI12', group: 'Tiện ích' }], guides: [] },
    }]);
  };

  if (isDocked) return null;
  return (
    <>
      {!open && (
        <button type="button" className={`troly-fab ${dragging ? 'dragging' : ''}`} style={{ right: pos.right, bottom: pos.bottom }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
          title="Trợ lý ERP — bấm để hỏi; nhấn giữ rồi kéo để đưa robot sang chỗ khác">
          <Bot size={26} />
          <span className="troly-fab-dot" />
        </button>
      )}
      {open && (
        <div className="troly-chat" role="dialog" aria-label="Trợ lý ERP" style={chatStyle}>
          <div className="troly-chat-head">
            <span className="troly-avatar"><Bot size={18} /></span>
            <div style={{ flex: 1 }}><b>Trợ lý ERP</b><div className="troly-sub">Hỏi đáp · tìm tính năng · {FAQ.length + trained.length} câu hỏi</div></div>
            <button type="button" className="troly-icon" title="Thu robot lên thanh trên cùng cho đỡ vướng (bấm biểu tượng robot ở đó để gọi lại)" onClick={() => { setOpen(false); setDocked(true); }}>Ẩn</button>
            <button type="button" className="troly-icon" title="Thu nhỏ" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="troly-chat-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`troly-msg ${m.from}`}>
                {m.text && <div className="troly-bubble">{m.text}</div>}
                {m.reply && (
                  <div className="troly-reply">
                    {m.reply.faq.map((f, j) => (
                      <div key={j} className="troly-bubble troly-answer">
                        <b>{f.q}</b>
                        {/* safeMarkdown: chặn HTML thô, chỉ nhận liên kết / ảnh an toàn (câu trả lời huấn luyện do người dùng nhập). */}
                        <div className="doc" title="Bấm vào ảnh để xem cỡ lớn" onClick={(e) => { const el = e.target as HTMLElement; if (el.tagName === 'IMG') window.open((el as HTMLImageElement).src, '_blank', 'noopener'); }} dangerouslySetInnerHTML={{ __html: safeMarkdown(f.a) }} />
                      </div>
                    ))}
                    {m.reply.screens.length > 0 && (
                      <div className="troly-links">
                        {m.reply.screens.map((s) => (
                          <button key={s.path} type="button" onClick={() => navigate(s.path)} title={s.group}>{s.code && <small>{s.code}</small>}{s.label}</button>
                        ))}
                      </div>
                    )}
                    {m.reply.guides.length > 0 && (
                      <div className="troly-links">
                        {m.reply.guides.map((g) => <button key={g.key} type="button" className="guide" onClick={() => setGuide(g.key)}>📖 {g.title}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="troly-suggest">
            {SUGGEST.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
          </div>
          <form className="troly-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Hỏi trợ lý… (ví dụ: phiếu xoá ở cửa hàng thì sao?)" autoFocus />
            <button type="submit" disabled={!text.trim()} title="Gửi"><Send size={16} /></button>
            {msgs.length > 1 && <button type="button" className="clear" title="Xoá cuộc trò chuyện" onClick={() => setMsgs([HELLO])}>Xoá</button>}
          </form>
        </div>
      )}
      {guide && <HelpDrawer guideKey={guide} onClose={() => setGuide(null)} />}
    </>
  );
}
