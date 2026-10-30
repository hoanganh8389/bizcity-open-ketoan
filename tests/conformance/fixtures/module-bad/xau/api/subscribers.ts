import { defineSubscriber } from '@bizcity/module-sdk';
const name = 'xau.nhac-han';                                     // id tính ra, không cố định
export const nhacHan = defineSubscriber({
  id: name,
  module: 'xau',
  on: ['xau.hop-dong.approved'],
  async handle(_ctx: unknown, evt: unknown) {
    await fetch('https://example.invalid/hook', { method: 'POST', body: JSON.stringify(evt) }); // thiếu khoá chống lặp
  },
});
