import assert from 'node:assert/strict';
import { calcCarton, calcAll, totals, round2, brutoPerYard } from '../src/calc.js';
import { findPreset, paramsOf } from '../src/presets.js';

const p = paramsOf(findPreset('l68-1'));
assert.equal(brutoPerYard(p), 0.33);

// Pasangan (yard, roll) -> (bruto, netto) yang tercatat di contoh HASIL TIMBANGAN.
const known = [
  [250, 10, 82.5, 73.06],
  [175, 7, 57.75, 50.26],
  [210, 9, 69.3, 60.51],
  [163, 7, 53.79, 46.3],
  [156, 6, 51.48, 44.64],
  [150, 6, 49.5, 42.66],
  [246, 9, 81.18, 72.39],
  [148, 6, 48.84, 42],
];
for (const [yards, rolls, bruto, netto] of known) {
  const r = calcCarton({ yards, rolls }, p);
  assert.equal(r.bruto, bruto, `bruto ${yards}`);
  assert.equal(r.netto, netto, `netto ${yards}/${rolls}`);
}

// Pembulatan ala Excel: 2.265 -> 2.27, -2.265 -> -2.27
assert.equal(round2(2.265), 2.27);
assert.equal(round2(0.453 * 5), 2.27);
assert.equal(round2(-2.265), -2.27);
assert.equal(round2(1.004), 1);

const rs = calcAll([{ no: 1, yards: 250, rolls: 10 }, { no: 2, yards: 175, rolls: 7 }], p);
const t = totals(rs);
assert.equal(t.bruto, 140.25);
assert.equal(t.netto, 123.32);
assert.equal(t.tare, 16.93);
assert.equal(t.rolls, 17);
console.log('calc.test OK');
