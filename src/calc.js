// Rumus bruto / netto, mengikuti file "BERAT BRUTO VS NETTO TEORI".
//
//   Bruto per yard = berat 1 karton / yard 1 karton        (GR/YD/CTN)
//   Bruto          = yard x bruto per yard
//   Tare           = (jumlah roll x PPT) + (karton + aksesori)
//   Netto          = Bruto - Tare
//
// Semua angka kg dibulatkan 2 desimal seperti tampilan di Excel.

/** Pembulatan 2 desimal ala Excel ROUND (setengah menjauhi nol, abaikan noise floating point). */
export function round2(value) {
  if (!Number.isFinite(value)) return 0;
  const x = Number(value.toPrecision(15));
  const abs = Math.abs(x);
  const text = String(abs);
  const rounded = text.includes('e')
    ? Math.round(abs * 100) / 100
    : Number(Math.round(Number(text + 'e2')) + 'e-2');
  return x < 0 ? -rounded : rounded;
}

/** Bruto per yard (kg/yard). */
export function brutoPerYard(p) {
  return p.beratCtn / p.yardCtn;
}

/** Hitung satu karton. `carton` = { yards, rolls }. */
export function calcCarton(carton, p) {
  const bruto = round2(carton.yards * brutoPerYard(p));
  const tare = carton.rolls * p.ppt + p.ctnAcc;
  const netto = round2(bruto - tare);
  return { bruto, tare: round2(tare), netto };
}

/** Hitung semua karton. Mengembalikan array baru: { no, yards, rolls, bruto, tare, netto, ... }. */
export function calcAll(cartons, p) {
  return cartons.map((c) => ({ ...c, ...calcCarton(c, p) }));
}

/** Total keseluruhan. */
export function totals(results) {
  const sum = (key) => round2(results.reduce((acc, r) => acc + r[key], 0));
  return {
    cartons: results.length,
    yards: sum('yards'),
    rolls: results.reduce((acc, r) => acc + r.rolls, 0),
    bruto: sum('bruto'),
    netto: sum('netto'),
    tare: round2(sum('bruto') - sum('netto')),
  };
}

/** Pastikan parameter valid. Mengembalikan daftar pesan galat (kosong = valid). */
export function validateParams(p) {
  const errors = [];
  if (!(p.yardCtn > 0)) errors.push('Yard per karton harus lebih dari 0.');
  if (!(p.beratCtn > 0)) errors.push('Berat 1 karton harus lebih dari 0.');
  if (!(p.ppt >= 0)) errors.push('Berat PPT tidak boleh negatif.');
  if (!(p.ctnAcc >= 0)) errors.push('Berat karton + aksesori tidak boleh negatif.');
  return errors;
}
