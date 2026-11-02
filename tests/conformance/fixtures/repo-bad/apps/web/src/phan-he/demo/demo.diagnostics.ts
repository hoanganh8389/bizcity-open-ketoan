// SC-FIX-1: một kiểm thiếu remedy, một kiểm dẫn màn không có trong sổ màn.
export const DEMO_DIAGNOSTICS = [
  { code: 'NO_REMEDY_CHECK', layer: 'L3', level: 'warn', title: 'x', fix: 'x' },
  { code: 'BAD_SCREEN_CHECK', layer: 'L3', level: 'warn', title: 'x', fix: 'x',
    remedy: { steps: [{ text: 'Mở màn', screen: SCREENS.NOPE }], owner: 'accountant', verify: { code: 'BAD_SCREEN_CHECK' } } },
];
