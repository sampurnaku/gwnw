// Preset parameter, disalin dari "BERAT BRUTO VS NETTO TEORI.xlsx".
//   ppt      : berat 1 PPT (kg) per roll
//   yardCtn  : yard dalam 1 karton contoh
//   pcsCtn   : jumlah roll dalam 1 karton contoh (informasi saja)
//   beratCtn : berat 1 karton contoh (kg), sudah termasuk kemasan
//   ctnAcc   : berat karton + aksesori (kg)

export const PRESETS = [
  { id: 'l36-1', group: 'Lebar 36"', name: 'Blok 1', ppt: 0.3, yardCtn: 500, pcsCtn: 20, beratCtn: 45.99, ctnAcc: 2.7, dim: '96 x 71 x 29' },
  {
    id: 'l36-2', group: 'Lebar 36"', name: 'Blok 2', ppt: 0.18, yardCtn: 497, pcsCtn: 10, beratCtn: 77.62, ctnAcc: 2.42, dim: '116 x 22 x 54',
    note: 'Di Excel teori, rumus blok ini memakai PPT blok 1 (0,3). Di sini dipakai PPT blok ini (0,18).',
  },
  { id: 'l44-1', group: 'Lebar 44"', name: 'Blok 1', ppt: 0.35, yardCtn: 303, pcsCtn: 12, beratCtn: 31.66, ctnAcc: 1.88, dim: '118 x 41 x 50' },
  { id: 'l44-2', group: 'Lebar 44"', name: 'Blok 2', ppt: 0.36, yardCtn: 262, pcsCtn: 10, beratCtn: 28.2, ctnAcc: 0.58, dim: '116 x 22 x 54' },
  { id: 'l58-1', group: 'Lebar 58"', name: 'Stock Cobra pd / ABEER', ppt: 0.6, yardCtn: 100, pcsCtn: 4, beratCtn: 45.3, ctnAcc: 2.9, dim: '153 x 41 x 50' },
  { id: 'l58-2', group: 'Lebar 58"', name: 'Vision / RHU', ppt: 0.48, yardCtn: 250, pcsCtn: 3, beratCtn: 58.5, ctnAcc: 3.3, dim: '153 x 32 x 50' },
  { id: 'l58-3', group: 'Lebar 58"', name: 'ACURATE LPMGX', ppt: 0.48, yardCtn: 265.61, pcsCtn: 12, beratCtn: 61.32, ctnAcc: 3.78, dim: '153 x 22 x 54' },
  { id: 'l62-1', group: 'Lebar 62"', name: 'Blok 1', ppt: 0.6, yardCtn: 92, pcsCtn: 4, beratCtn: 46.04, ctnAcc: 2.96, dim: '162 x 52 x 40' },
  {
    id: 'l68-1', group: 'Lebar 68"', name: 'Blok 1 (250 yd / 10 roll)', ppt: 0.65, yardCtn: 250, pcsCtn: 10, beratCtn: 82.5, ctnAcc: 2.94, dim: '177 x 23 x 61',
    note: 'Angka ini sama dengan yang dipakai pada contoh file HASIL TIMBANGAN.',
  },
  { id: 'l68-2', group: 'Lebar 68"', name: 'Blok 2', ppt: 0.48, yardCtn: 151, pcsCtn: 3, beratCtn: 40.76, ctnAcc: 3.3, dim: '177 x 23 x 61' },
  { id: 'l68-3', group: 'Lebar 68"', name: 'ACURATE LPMGX', ppt: 0.48, yardCtn: 265.61, pcsCtn: 12, beratCtn: 61.32, ctnAcc: 3.78, dim: '153 x 22 x 54' },
  { id: 'l72-1', group: 'Lebar 72"', name: '19284-72', ppt: 0.65, yardCtn: 252, pcsCtn: 10, beratCtn: 66.42, ctnAcc: 3.06, dim: '191 x 56 x 25' },
  {
    id: 'l72-2', group: 'Lebar 72"', name: '19284-58', ppt: 0.58, yardCtn: 250, pcsCtn: 10, beratCtn: 44.56, ctnAcc: 0, dim: '191 x 56 x 25',
    note: 'Berat karton + aksesori kosong di Excel teori, jadi dianggap 0. Isi sendiri bila ada.',
  },
  { id: 'zr-1', group: 'ZIBDA', name: 'Rolling (SIMGETEX)', ppt: 0.4, yardCtn: 256, pcsCtn: 8, beratCtn: 59.2, ctnAcc: 2.74, dim: '153 x 41 x 50' },
  { id: 'zl-1', group: 'ZIBDA', name: 'Lipat', ppt: 0.31, yardCtn: 250, pcsCtn: 10, beratCtn: 51, ctnAcc: 1.97, dim: '153 x 41 x 50' },
];

/** Preset bawaan: yang sama dengan contoh file HASIL TIMBANGAN. */
export const DEFAULT_PRESET_ID = 'l68-1';

export function findPreset(id, custom = []) {
  return [...PRESETS, ...custom].find((p) => p.id === id) || null;
}

/** Ambil hanya 4 parameter yang dipakai rumus. */
export function paramsOf(preset) {
  return { ppt: preset.ppt, yardCtn: preset.yardCtn, beratCtn: preset.beratCtn, ctnAcc: preset.ctnAcc };
}
