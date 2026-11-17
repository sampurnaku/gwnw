// Bangun Excel dari PDF asli. Menulis dua file ke folder OUT_DIR:
//   hasil.xlsx        -> versi final (nilai tersimpan)
//   hasil_nocache.xlsx -> tanpa nilai tersimpan, untuk uji hitung ulang di LibreOffice
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractLines, parsePackingList } from '../src/parser.js';
import { calcAll, totals } from '../src/calc.js';
import { findPreset, paramsOf } from '../src/presets.js';
import { buildWorkbook } from '../src/export.js';
import { summarizeSamples, effectiveParams } from '../src/samples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require(process.env.EXCELJS || 'exceljs');
const pdfjs = await import(pathToFileURL(process.env.PDFJS_LEGACY || path.join(here, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const outDir = process.env.OUT_DIR || path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const lines = await extractLines(pdfjs, new Uint8Array(fs.readFileSync(path.join(here, 'welfull.pdf'))));
const { cartons } = parsePackingList(lines);
const preset = findPreset('l68-1');
const params = paramsOf(preset);
const results = calcAll(cartons, params);
const meta = { buyer: 'WELFULL / 58', item: 'DETAIL PACKING LIST 24-09-2026', formulir: 'FMKA-IK-09-26-0' };
const logo = { buffer: fs.readFileSync(path.join(here, '../assets/logo.jpeg')), extension: 'jpeg' };

for (const [name, omitCache] of [['hasil.xlsx', false], ['hasil_nocache.xlsx', true]]) {
  const wb = buildWorkbook(ExcelJS, { results, params, preset: `${preset.group} - ${preset.name}`, meta, logo, omitCache });
  await wb.xlsx.writeFile(path.join(outDir, name));
}

// Versi dengan timbangan sampel (rata-rata berbobot menggantikan angka preset)
const sampleInput = [
  { no: 1, yards: 207, rolls: 8, bruto: 69.5, src: 'bruto' },
  { no: 2, yards: 250, rolls: 10, netto: 76, src: 'netto' },
  { no: 3, yards: 198, rolls: 8, bruto: 66, src: 'bruto' },
];
const summary = summarizeSamples(sampleInput, params);
const effParams = effectiveParams(params, summary, true);
const resultsS = calcAll(cartons, effParams);
const validRows = summary.rows.filter((r) => r.valid);
for (const [name, omitCache] of [['hasil_sampel.xlsx', false], ['hasil_sampel_nocache.xlsx', true]]) {
  const wb = buildWorkbook(ExcelJS, { results: resultsS, params: effParams, preset: 'Rata-rata 3 sampel', meta, logo, samples: { enabled: true, rows: validRows }, omitCache });
  await wb.xlsx.writeFile(path.join(outDir, name));
}
fs.writeFileSync(path.join(outDir, 'expected_sampel.json'), JSON.stringify({ results: resultsS, totals: totals(resultsS), rate: summary.rate }));
fs.writeFileSync(path.join(outDir, 'expected.json'), JSON.stringify({ results, totals: totals(results) }));
console.log('export.test OK ->', outDir, JSON.stringify(totals(results)));
