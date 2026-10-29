/**
 * Nút "In" có chọn mẫu: bấm "In" in theo mẫu mặc định của màn; mũi tên bên cạnh mở danh sách mẫu (tên, khổ giấy,
 * mẫu HTsoft tương ứng). Chọn một mẫu thì in ngay và nhớ làm mặc định của màn đó trên máy này.
 * Cấu hình ở màn Mẫu in (HT05) được áp trước: mẫu tắt bị ẩn, mẫu mặc định theo người dùng → chi nhánh → đơn vị (khi đã đặt thì
 * thắng lựa chọn nhớ trên máy), phần chỉnh nội dung (tiêu đề, số liên, khổ, chữ ký…) áp vào tờ in. Nút ☆ trong danh sách đặt mẫu
 * làm mặc định của riêng người đang dùng (lưu trên máy chủ, đổi máy vẫn giữ).
 *
 *   <PrintButton screen="BH10" templates={SALE_TEMPLATES} getDocs={() => [doc]} />
 *
 * getDocs có thể trả Promise (nạp đủ chi tiết phiếu trước khi in). Danh sách rỗng thì không in.
 * Danh sách mẫu vẽ ra ngoài (gắn vào body, vị trí cố định theo nút) để không bị khung hộp phiếu cắt mất: dưới nút
 * không đủ chỗ thì mở lên trên, sát mép phải thì dịch sang trái.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Printer, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { templateCode } from './catalog';
import { SCOPE_LABEL, resolveScreen, useEffectivePrintSettings } from './settings';
import { PAPER_LABEL, PrintJob, type PrintJobSpec, type PrintTemplate } from './PrintHost';

const KEY = (screen: string) => `print-default:${screen}`;
function readDefault(screen: string): string | null {
  try { return window.localStorage.getItem(KEY(screen)); } catch { return null; }
}
function writeDefault(screen: string, id: string) {
  try { window.localStorage.setItem(KEY(screen), id); } catch { /* trình duyệt chặn lưu: chỉ không nhớ mặc định */ }
}

export function PrintButton<T>({ screen, memoryKey, templates, getDocs, disabled, label = 'In', bare, small, title }: {
  screen: string;
  /** Khoá nhớ mẫu mặc định khi một màn có nhiều loại chứng từ (vd MH03:order); mặc định = mã màn. */
  memoryKey?: string;
  templates: PrintTemplate<T>[];
  getDocs: () => T[] | Promise<T[]>;
  disabled?: boolean;
  label?: string;
  /** Nút không có lớp .btn (thanh công cụ của hộp phiếu đã tự định dạng nút). */
  bare?: boolean;
  /** Cỡ nhỏ (btn-sm) khi đứng cạnh các nút nhỏ trên thanh công cụ. */
  small?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<PrintJobSpec<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const key = memoryKey ?? screen;
  const [defId, setDefId] = useState(() => readDefault(key));
  useEffect(() => setDefId(readDefault(key)), [key]);
  const box = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const qc = useQueryClient();
  const eff = useEffectivePrintSettings().data;
  const resolved = resolveScreen(screen, templates, eff);
  const list = resolved.templates;
  const pick = (id: string | null | undefined) => list.find((x) => x.template.id === id);
  const def = pick(resolved.defaultId) ?? pick(defId) ?? list[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    // Cuộn / đổi cỡ cửa sổ làm nút dời chỗ: đóng danh sách thay vì để nó lơ lửng sai vị trí.
    const shut = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', shut, true); window.removeEventListener('resize', shut); };
  }, [open]);

  // Đặt danh sách theo vị trí nút, đo xong mới hiện (tránh nháy sai chỗ).
  useLayoutEffect(() => {
    if (!open || !box.current || !menu.current) { setPos({ visibility: 'hidden' }); return; }
    const b = box.current.getBoundingClientRect();
    const mh = menu.current.offsetHeight, mw = menu.current.offsetWidth, gap = 4, pad = 8;
    const below = window.innerHeight - b.bottom - gap - pad, above = b.top - gap - pad;
    const up = mh > below && above > below;
    setPos({
      left: Math.max(pad, Math.min(b.left, window.innerWidth - mw - pad)),
      ...(up ? { bottom: window.innerHeight - b.top + gap } : { top: b.bottom + gap }),
      maxHeight: Math.max(120, up ? above : below),
    });
  }, [open]);

  const run = async (item: { template: PrintTemplate<T>; overrides: PrintJobSpec<T>['overrides'] }) => {
    const tpl = item.template;
    setOpen(false);
    if (tpl.id !== defId) { writeDefault(key, tpl.id); setDefId(tpl.id); }
    if (tpl.screen) { window.print(); return; }
    setBusy(true);
    try {
      const docs = await getDocs();
      if (docs.length) setJob({ template: tpl, docs, overrides: item.overrides });
    } catch (e) {
      window.alert(`Không nạp được chứng từ để in: ${errorText(e)}`);
    } finally { setBusy(false); }
  };

  /** ☆: đặt mẫu làm mặc định của riêng mình (giữ phần chỉnh riêng đã có của mẫu đó). */
  const makeMine = async (id: string) => {
    if (!eff?.userId) return;
    const code = templateCode(screen, id);
    const own = eff.settings.find((x) => x.scope === 'user' && x.templateCode === code);
    try {
      await api.put('/api/v1/print-templates/settings', { templateCode: code, scope: 'user', scopeRef: eff.userId, isEnabled: true, isDefault: true, overrides: own?.overrides ?? {} });
      await qc.invalidateQueries({ queryKey: ['print-settings'] });
    } catch (e) { window.alert(`Không lưu được mẫu mặc định: ${errorText(e)}`); }
  };

  const cls = bare ? undefined : small ? 'btn btn-sm' : 'btn';
  if (!def) return <button type="button" className={cls} disabled title="Mọi mẫu in của màn này đã bị tắt ở Hệ thống → Mẫu in (HT05)"><Printer size={15} /> {label}</button>;
  return (
    <span className="pbtn" ref={box}>
      <button type="button" className={cls} disabled={disabled || busy} title={title ?? `In theo mẫu: ${def.template.name}`} onClick={() => void run(def)}>
        <Printer size={15} /> {label}
      </button>
      {list.length > 1 && (
        <button type="button" className={`${cls ?? ''} pbtn-caret`} disabled={disabled || busy} title="Chọn mẫu in" onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={14} />
        </button>
      )}
      {open && createPortal(
        <div className="pbtn-menu" role="menu" ref={menu} style={pos} data-view-ok>
          {list.map((x) => {
            const t = x.template;
            const copies = x.overrides.copies ?? t.copies;
            return (
              <div key={t.id} className="pbtn-row">
                <button type="button" role="menuitem" className={t.id === def.template.id ? 'on' : undefined} onClick={() => void run(x)}>
                  <b>{t.name}</b>
                  <span>{PAPER_LABEL[x.overrides.paper ?? t.paper]}{copies && copies > 1 ? ` · ${copies} liên` : ''}</span>
                </button>
                {eff?.userId && !t.screen && <button type="button" className="pbtn-star" title="Đặt làm mẫu mặc định của tôi (lưu theo tài khoản)" onClick={() => void makeMine(t.id)}><Star size={13} /></button>}
              </div>
            );
          })}
          <div className="pbtn-note">
            {resolved.defaultScope ? `Mẫu mặc định do ${SCOPE_LABEL[resolved.defaultScope]} đặt (Hệ thống → Mẫu in, HT05).` : `Mẫu vừa chọn được nhớ làm mặc định của màn ${screen} trên máy này.`}
            {resolved.hidden ? ` ${resolved.hidden} mẫu đang tắt.` : ''}
          </div>
        </div>,
        document.body,
      )}
      {job && <PrintJob job={job} onDone={() => setJob(null)} />}
    </span>
  );
}
