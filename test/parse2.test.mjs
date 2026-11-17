// PDF kedua (0000004448_1): format "YARD =" tanpa S, kata "Roll" di baris lain, ada GRAND TOTAL dan List Karton.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { extractLines, parsePackingList } from '../src/parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pdfjs = await import(pathToFileURL(process.env.PDFJS_LEGACY || path.join(here, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const lines = await extractLines(pdfjs, new Uint8Array(fs.readFileSync(path.join(here, '0000004448_1.pdf'))));
const r = parsePackingList(lines);

assert.equal(r.cartons.length, 23, 'jumlah karton = 23, bukan 229 (229 adalah jumlah roll di GRAND TOTAL)');
assert.deepEqual(r.cartons.map((c) => c.no), Array.from({ length: 23 }, (_, i) => i + 1));
assert.deepEqual(r.warnings, [], 'tanpa peringatan');
assert.ok(r.cartons.every((c) => c.ok));
assert.deepEqual(r.grand, { yards: 5810, rolls: 229 }, 'GRAND TOTAL terbaca');
assert.equal(r.grandOk, true, 'jumlah karton cocok dengan GRAND TOTAL');
assert.equal(r.cartons.reduce((a, c) => a + c.yards, 0), 5810);
assert.equal(r.cartons.reduce((a, c) => a + c.rolls, 0), 229);

const by = Object.fromEntries(r.cartons.map((c) => [c.no, c]));
assert.deepEqual([by[1].yards, by[1].rolls], [250, 10], 'karton 1 = 7 roll + 3 roll');
assert.deepEqual([by[22].yards, by[22].rolls], [255, 10]);
assert.deepEqual([by[23].yards, by[23].rolls], [240, 9]);
assert.equal(by[229], undefined, 'tidak ada karton 229');
console.log('parse2.test OK:', r.cartons.length, 'karton, grand', JSON.stringify(r.grand));
