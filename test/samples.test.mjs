import assert from 'node:assert/strict';
import { evalSample, summarizeSamples, effectiveParams } from '../src/samples.js';
import { calcCarton, brutoPerYard } from '../src/calc.js';

const p = { ppt: 0.65, ctnAcc: 2.94, yardCtn: 250, beratCtn: 82.5 }; // preset 68" blok 1: 0,33 kg/yard

// Sampel isi bruto: karton 250 yd / 10 roll ditimbang 82,5 kg -> netto 73,06, 0,33 kg/yd
let r = evalSample({ yards: 250, rolls: 10, bruto: 82.5, src: 'bruto' }, p);
assert.ok(r.valid); assert.equal(r.netto, 73.06); assert.equal(r.rate, 0.33);

// Sampel isi netto: netto 73,06 -> bruto 82,5
r = evalSample({ yards: 250, rolls: 10, netto: 73.06, src: 'netto' }, p);
assert.ok(r.valid); assert.equal(r.bruto, 82.5);

// Validasi
assert.equal(evalSample({ yards: '', rolls: 10, bruto: 80, src: 'bruto' }, p).valid, false);
assert.equal(evalSample({ yards: 250, rolls: 10, bruto: '', src: 'bruto' }, p).valid, false);
assert.equal(evalSample({ yards: 250, rolls: '', netto: 70, src: 'netto' }, p).valid, false, 'netto butuh roll');
assert.equal(evalSample({ yards: 250, rolls: '', bruto: 80, src: 'bruto' }, p).valid, true, 'bruto tidak butuh roll');
assert.ok(Number.isNaN(evalSample({ yards: 250, rolls: '', bruto: 80, src: 'bruto' }, p).netto));

// Rata-rata berbobot dari 4 sampel (satu kosong diabaikan)
const samples = [
  { yards: 250, rolls: 10, bruto: 83.0, src: 'bruto' },
  { yards: 255, rolls: 10, bruto: 84.0, src: 'bruto' },
  { yards: 240, rolls: 9, bruto: 79.0, src: 'bruto' },
  { yards: 250, rolls: 10, bruto: 82.0, src: 'bruto' },
  { yards: '', rolls: '', bruto: '', src: 'bruto' },
];
const s = summarizeSamples(samples, p);
assert.equal(s.count, 4);
assert.equal(s.sumYards, 995);
assert.equal(s.sumBruto, 328);
assert.ok(Math.abs(s.rate - 328 / 995) < 1e-12);
assert.ok(s.spreadPct > 0 && s.spreadPct < 2);

// Parameter efektif: rata-rata dipakai -> kg/yard = 328/995; dimatikan -> preset
const eff = effectiveParams(p, s, true);
assert.equal(brutoPerYard(eff), 328 / 995);
assert.equal(eff.ppt, 0.65); assert.equal(eff.ctnAcc, 2.94);
assert.equal(effectiveParams(p, s, false), p);
assert.equal(effectiveParams(p, { rows: [], count: 0 }, true), p, 'tanpa sampel valid -> preset');

// Dipakai ke karton: 250 yard / 10 roll
const c = calcCarton({ yards: 250, rolls: 10 }, eff);
assert.equal(c.bruto, 82.41);
console.log('samples.test OK');
