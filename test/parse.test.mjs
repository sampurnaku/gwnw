// Uji parser dengan PDF asli (butuh: npm i pdfjs-dist di folder kerja, lihat README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { extractLines, parsePackingList } from '../src/parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pdfjsPath = process.env.PDFJS_LEGACY || path.join(here, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pdfjs = await import(pathToFileURL(pdfjsPath).href);

const data = new Uint8Array(fs.readFileSync(path.join(here, 'welfull.pdf')));
const lines = await extractLines(pdfjs, data);
const result = parsePackingList(lines);

assert.equal(result.cartons.length, 335, 'jumlah karton');
assert.equal(result.lbr, '58', 'lebar terdeteksi');
assert.equal(result.tanggal, '24-09-2026');
assert.deepEqual(result.warnings, [], 'tidak ada peringatan');
assert.ok(result.cartons.every((c) => c.ok), 'semua karton cocok dengan total PDF');
assert.equal(result.cartons.reduce((a, c) => a + c.yards, 0), 58957, 'total yard');
assert.equal(result.cartons.reduce((a, c) => a + c.rolls, 0), 2313, 'total roll');
assert.deepEqual(result.grand, { yards: 58957, rolls: 2313 }, 'GRAND TOTAL terbaca');
assert.equal(result.grandOk, true, 'cocok dengan GRAND TOTAL');

const byNo = Object.fromEntries(result.cartons.map((c) => [c.no, c]));
assert.deepEqual([byNo[1].yards, byNo[1].rolls], [207, 8]);
assert.deepEqual([byNo[28].yards, byNo[28].rolls], [198, 8], 'karton campuran 2 desain');
assert.deepEqual(byNo[28].designs, ['LCHAR77', 'LCHAR.M68']);
assert.deepEqual([byNo[37].yards, byNo[37].rolls], [123, 5], 'karton campuran 2 desain');
assert.equal(byNo[79].designs[0], 'LCHZT.NUTMEG B', 'nama desain terpotong dua baris');

console.log('parse.test OK:', result.cartons.length, 'karton,', 'lebar', result.lbr);
