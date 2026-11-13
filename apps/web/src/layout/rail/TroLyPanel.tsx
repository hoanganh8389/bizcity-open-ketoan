// [2026-11-06 01:30 AM Nguyễn Văn Thủy] MENU — bảng Trợ lý kết hợp: việc nên làm theo nhóm, lối tắt, ô hỏi tìm màn và hướng dẫn (đóng góp)
/**
 * TRỢ LÝ theo nhóm đang làm: trên cùng là việc nên làm, tiếp theo là lối tắt của nhóm, dưới là ô hỏi.
 * Câu hỏi tìm trong tên màn và hướng dẫn sử dụng, màn của nhóm đang làm đứng trước. Chưa dùng mô hình AI.
 * Cuộc trò chuyện nhớ trong phiên, đổi nhóm không mất.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import type { MenuItem } from '@ketoan/contracts';
import { HelpDrawer } from '@/components/HelpDrawer';
import { fold, searchGuides, searchScreens } from '../../addins/tro-ly/knowledge';
import type { GonGroup } from '../menu-gon';
import { ViecRow } from './ViecPanel';
import { viecOf, type Viec } from './useViec';

interface Reply { screens: { label: string; path: string; code?: string; group: string }[]; guides: { key: string; title: string }[] }
interface Msg { from: 'user' | 'bot'; text: string; reply?: Reply }

const STORE = 'ketoan.troly.gon';
const load = (): Msg[] => { try { const v = JSON.parse(sessionStorage.getItem(STORE) ?? 'null'); return Array.isArray(v) ? v : []; } catch { return []; } };

export function TroLyPanel({ menu, items, group, onShowViec, onGo }: { menu: MenuItem[]; items: Viec[]; group?: GonGroup; onShowViec: () => void; onGo: () => void }) {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [text, setText] = useState('');
  const [guide, setGuide] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch { /* chế độ riêng tư */ } }, [msgs]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  const viec = viecOf(items, group?.key);
  const inGroup = new Set(group ? [...group.sections, ...group.reports].flatMap((s) => s.items.map((i) => i.path)) : []);
  const ask = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setText('');
    // Có màn chứa đủ cụm từ đã gõ thì chỉ lấy các màn đó; màn của nhóm đang làm đứng trước. Hướng dẫn trùng tên màn hoặc lạc chủ đề thì bỏ.
    const key = fold(t);
    const found0 = searchScreens(menu, t, 20);
    const exact = found0.filter((s) => fold(s.label).includes(key));
    const screens = (exact.length ? exact : found0).sort((a, b) => Number(inGroup.has(b.path)) - Number(inGroup.has(a.path))).slice(0, 6);
    const names = new Set(screens.map((s) => fold(s.label)));
    const guides = searchGuides(t, 4).filter((g) => ![...names].some((n) => fold(g.title).startsWith(n)) && (!exact.length || fold(g.title).includes(key))).slice(0, 2);
    const found = screens.length + guides.length > 0;
    setMsgs((m) => [...m, { from: 'user', text: t }, { from: 'bot', text: found ? 'Mình tìm thấy:' : 'Chưa tìm thấy. Bạn thử gõ tên màn hoặc tên chứng từ.', reply: found ? { screens, guides } : undefined }]);
  };

  return (
    <>
      <div className="rail-scroll" ref={body}>
        {viec.length > 0 && (
          <>
            <div className="rail-sec-head"><b>Nên làm ngay</b>{viec.length > 3 && <button type="button" className="rail-link" onClick={onShowViec}>Xem cả {viec.length}</button>}</div>
            {viec.slice(0, 3).map((v) => <ViecRow key={v.key} v={v} onGo={onGo} />)}
          </>
        )}
        {group && group.the.length > 0 && (
          <>
            <div className="rail-sec-head"><b>Lối tắt {group.label}</b></div>
            <div className="troly-links rail-tat">{group.the.slice(0, 6).map((m) => <button key={m.key} type="button" onClick={() => { navigate(m.path!); onGo(); }}>{m.label}</button>)}</div>
          </>
        )}
        {!msgs.length && !viec.length && <div className="rail-ai-hello"><Sparkles size={26} /><b>{group ? `Đang làm: ${group.label}` : 'Bạn cần gì?'}</b><span>Gõ tên màn hoặc điều cần làm</span></div>}
        {msgs.length > 0 && <div className="rail-sec-head"><b>Hỏi đáp</b><button type="button" className="rail-link" onClick={() => setMsgs([])}>Làm mới</button></div>}
        <div className="rail-chat">
          {msgs.map((m, i) => (
            <div key={i} className={`troly-msg ${m.from}`}>
              <div className="troly-bubble">{m.text}</div>
              {m.reply && (
                <div className="troly-reply">
                  {m.reply.screens.length > 0 && <div className="troly-links">{m.reply.screens.map((s) => <button key={s.path} type="button" title={s.group} onClick={() => { navigate(s.path); onGo(); }}>{s.label}</button>)}</div>}
                  {m.reply.guides.length > 0 && <div className="troly-links">{m.reply.guides.map((g) => <button key={g.key} type="button" className="guide" onClick={() => setGuide(g.key)}>{g.title}</button>)}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <form className="troly-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={group ? `Tìm màn, hỏi về ${group.label}…` : 'Tìm màn, hỏi cách làm…'} />
        <button type="submit" disabled={!text.trim()} title="Gửi"><Send size={16} /></button>
      </form>
      {guide && <HelpDrawer guideKey={guide} onClose={() => setGuide(null)} />}
    </>
  );
}
