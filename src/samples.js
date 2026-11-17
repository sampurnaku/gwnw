// Timbangan sampel: timbang 3 sampai 5 karton dulu, ambil rata-rata berat aktualnya per yard,
// lalu pakai angka itu untuk menghitung semua karton (menggantikan "berat 1 karton contoh /
// yard 1 karton contoh" dari preset).
//
// Tiap sampel berisi: no (opsional), yards, rolls, dan SALAH SATU dari bruto / netto.
//   src = 'bruto' : bruto = hasil timbang karton utuh; netto = bruto - tare
//   src = 'netto' : netto = hasil timbang; bruto = netto + tare
//   tare          = roll x PPT + karton/aksesori
//
// Rata-rata dihitung berbobot: jumlah bruto / jumlah yard (karton yang lebih panjang
// berpengaruh lebih besar), sama dengan memakai satu karton contoh besar di Excel teori.

import { round2 } from './calc.js';

export const MAX_SAMPLES = 10;
export const RECOMMENDED_SAMPLES = '3 sampai 5';

const toNumber = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function emptySample() {
  return { no: '', yards: '', rolls: '', bruto: '', netto: '', src: 'bruto', auto: false };
}

/** Hitung satu sampel. `p` = { ppt, ctnAcc }. */
export function evalSample(sample, p) {
  const yards = toNumber(sample.yards);
  const rolls = toNumber(sample.rolls);
  const rawTare = rolls >= 0 ? rolls * p.ppt + p.ctnAcc : NaN;
  const tareOk = Number.isFinite(rawTare);
  const tare = rawTare;
  const out = { valid: false, reason: '', bruto: NaN, netto: NaN, rate: NaN, tare: tareOk ? round2(rawTare) : NaN };

  if (!(yards > 0)) { out.reason = 'Isi yard.'; return out; }
  if (sample.src === 'netto') {
    const netto = toNumber(sample.netto);
    if (!(netto > 0)) { out.reason = 'Isi berat netto.'; return out; }
    if (!(rolls >= 1)) { out.reason = 'Isi jumlah roll agar bruto bisa dihitung.'; return out; }
    if (!tareOk) { out.reason = 'Isi berat PPT dan karton + aksesori di atas.'; return out; }
    out.netto = netto;
    out.bruto = round2(netto + tare);
  } else {
    const bruto = toNumber(sample.bruto);
    if (!(bruto > 0)) { out.reason = 'Isi berat bruto.'; return out; }
    out.bruto = bruto;
    out.netto = rolls >= 1 && tareOk ? round2(bruto - tare) : NaN;
  }
  out.rate = out.bruto / yards;
  out.valid = true;
  return out;
}

/** Ringkasan semua sampel. */
export function summarizeSamples(samples, p) {
  const rows = samples.map((s) => ({ ...s, ...evalSample(s, p) }));
  const valid = rows.filter((r) => r.valid);
  if (!valid.length) return { rows, count: 0 };
  const sumYards = round2(valid.reduce((a, r) => a + toNumber(r.yards), 0));
  const sumBruto = round2(valid.reduce((a, r) => a + r.bruto, 0));
  const rates = valid.map((r) => r.rate);
  const rate = sumBruto / sumYards;
  return {
    rows,
    count: valid.length,
    sumYards,
    sumBruto,
    rate,
    minRate: Math.min(...rates),
    maxRate: Math.max(...rates),
    spreadPct: valid.length > 1 ? ((Math.max(...rates) - Math.min(...rates)) / rate) * 100 : 0,
  };
}

/**
 * Parameter yang dipakai untuk menghitung semua karton.
 * Bila rata-rata sampel dipakai: yardCtn = jumlah yard sampel, beratCtn = jumlah bruto sampel,
 * sehingga bruto per yard = rata-rata berbobot. PPT dan karton/aksesori tetap dari form.
 */
export function effectiveParams(p, summary, useSamples) {
  if (useSamples && summary && summary.count > 0) {
    return { ppt: p.ppt, ctnAcc: p.ctnAcc, yardCtn: summary.sumYards, beratCtn: summary.sumBruto };
  }
  return p;
}
