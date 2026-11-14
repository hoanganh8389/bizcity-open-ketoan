// @bizcity-layer P ui-kit
// [2026-11-14 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-5 (00 §12): Steps — thanh chỉ báo bước cho hộp thoại nhiều bước; cùng kiểu thanh bước nhập Excel (TI14, lớp .nx-steps), không thêm CSS
/**
 * Thanh chỉ báo bước dùng chung (hộp thoại Thiết lập nhanh TI15, nhập Excel TI14):
 *
 *   <Steps steps={['Bắt đầu', 'Công ty', 'Nạp gì', 'Xong']} current={step} />
 *
 * Bước trước `current` là xong (số tô màu), bước `current` đang làm (gạch dưới). Chỉ hiển thị — bước nào bấm được là việc của màn.
 * Vẽ bằng lớp `.nx-steps` của khung giao diện (apps/web/src/styles/giao-dien-xanh.css) để hai màn một kiểu.
 */
import { createElement } from 'react';

export interface StepsProps {
  steps: string[];
  /** Chỉ số bước đang làm (0 = bước đầu). Lớn hơn số bước = mọi bước xong. */
  current: number;
}

/** Trạng thái một bước: thuần, để test không cần React. */
export function stepState(i: number, current: number): 'xong' | 'on' | 'cho' {
  return i < current ? 'xong' : i === current ? 'on' : 'cho';
}

export function Steps({ steps, current }: StepsProps) {
  return createElement('div', { className: 'nx-steps', role: 'list', 'aria-label': 'Các bước' },
    steps.map((label, i) => {
      const st = stepState(i, current);
      return createElement('span', { key: `${i}-${label}`, role: 'listitem', className: st === 'cho' ? undefined : st, 'aria-current': st === 'on' ? 'step' : undefined },
        createElement('b', null, String(i + 1)), label);
    }));
}
