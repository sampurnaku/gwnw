// Parser "DETAIL PACKING LIST" (PDF) -> daftar karton.
//
// Satu nomor di PDF = satu karton. Tiap karton punya panjang roll (yard) dan
// total "NNN,00 YARDS = N Roll". Karton campuran (beberapa desain dalam satu
// nomor) punya beberapa sub-baris dan satu baris total gabungan.

// "175,00 YARDS = 7 Roll" atau "175,00 YARD = 7" (kata "Roll" bisa turun ke baris berikutnya).
const TOTAL_RE = /([\d.]+,\d+)\s+YARDS?\s*=\s*(\d+)(?!\d)/i;
// Baris awal karton: nomor lalu nama desain. "229 Roll" (jumlah roll di GRAND TOTAL) bukan karton.
const START_RE = /^\s*(\d{1,4})\s+(?!Rolls?\b)[A-Za-z]/i;
const GRAND_RE = /GRAND\s*TOTAL/i;
// Tulisan "GRAND TOTAL :" bisa terselip di antara angka yard, jumlah roll, dan kata "Roll".
const GRAND_VALUE_RE = /([\d.]+,\d+)\s+YARDS?\s*=\s*(?:GRAND\s*TOTAL\s*:?\s*)?(\d+)\s*(?:GRAND\s*TOTAL\s*:?\s*)?Roll/i;
const END_RE = /^\s*List\s+Karton/i;
const PIECE_RE = /(?<![\d,])\d+\.\d{2}(?![\d,])/g;
const SKIP_PREFIX = ['DETAIL PACKING LIST', 'Tanggal', 'NO.', 'Page', 'Printed'];

function parseIdNumber(text) {
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

/** Gabungkan item teks pdf.js menjadi baris-baris teks (urut atas ke bawah, kiri ke kanan). */
export function linesFromTextItems(items, tolerance = 2) {
  const words = items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
    .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }));
  words.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const w of words) {
    const row = rows.find((r) => Math.abs(r.y - w.y) <= tolerance);
    if (row) row.words.push(w);
    else rows.push({ y: w.y, words: [w] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.words.sort((a, b) => a.x - b.x).map((w) => w.str).join(' '));
}

/** Baca seluruh halaman PDF. `pdfjs` = modul pdf.js, `data` = Uint8Array. */
export async function extractLines(pdfjs, data, onProgress) {
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...linesFromTextItems(content.items));
    if (onProgress) onProgress(p, doc.numPages);
  }
  return lines;
}

/**
 * Ubah baris teks menjadi daftar karton.
 * Hasil: { cartons: [{ no, designs, yards, rolls, pieces, ok }], lbr, tanggal, warnings }
 */
export function parsePackingList(lines) {
  const raw = new Map();
  const lbrCount = new Map();
  let tanggal = '';
  let current = null;
  let ended = false; // mulai dari baris GRAND TOTAL / List Karton tidak ada karton lagi

  // Cari GRAND TOTAL lebih dulu: barisnya (mis. "58.957,00 YARD = 2313") muncul tepat
  // sebelum tulisan "GRAND TOTAL :" dan tidak boleh dihitung sebagai total karton terakhir.
  const grand = findGrandTotal(lines);

  for (const [index, line] of lines.entries()) {
    if (grand && index >= grand.line) ended = true;
    const text = line.trim();
    if (!text || text === ':') continue;
    const dateMatch = text.match(/^Tanggal\s*:\s*(\d{2}-\d{2}-\d{4})/);
    if (dateMatch && !tanggal) tanggal = dateMatch[1];
    if (SKIP_PREFIX.some((prefix) => text.startsWith(prefix))) continue;
    if (GRAND_RE.test(text) || END_RE.test(text)) ended = true;
    if (ended) continue;

    const start = line.match(START_RE);
    if (start) {
      current = Number(start[1]);
      if (!raw.has(current)) raw.set(current, { pieces: [], subtotals: [], grand: null, designs: [] });
      const rest = line.slice(line.indexOf(start[1]) + start[1].length).trim();
      const design = rest.match(/^([^/]+?)\s*\//);
      if (design) raw.get(current).designs.push(design[1].trim());
      const lbr = rest.match(/[/-]\s+(\d{2,3})\s/);
      if (lbr) lbrCount.set(lbr[1], (lbrCount.get(lbr[1]) || 0) + 1);
    }
    if (current === null) continue;

    const entry = raw.get(current);
    const total = line.match(TOTAL_RE);
    const body = line.replace(/[\d.]+,\d+\s+YARDS?\b.*$/i, '');
    const pieces = (body.match(PIECE_RE) || []).map(Number);
    entry.pieces.push(...pieces);

    if (!start && pieces.length) {
      const sub = body.trim().match(/^([A-Za-z][^/]*?)\s*\//);
      if (sub) entry.designs.push(sub[1].trim());
    }
    if (total) {
      const value = { yards: parseIdNumber(total[1]), rolls: Number(total[2]) };
      if (pieces.length) entry.subtotals.push(value);
      else entry.grand = value;
    }
  }

  const warnings = [];
  const cartons = [...raw.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([no, entry]) => {
      const sumPieces = Math.round(entry.pieces.reduce((a, b) => a + b, 0) * 100) / 100;
      let expected = entry.grand;
      if (!expected && entry.subtotals.length === 1) expected = entry.subtotals[0];
      if (!expected && entry.subtotals.length > 1) {
        expected = {
          yards: entry.subtotals.reduce((a, s) => a + s.yards, 0),
          rolls: entry.subtotals.reduce((a, s) => a + s.rolls, 0),
        };
      }
      const ok = Boolean(expected) && Math.abs(expected.yards - sumPieces) < 0.005 && expected.rolls === entry.pieces.length;
      if (!ok) {
        warnings.push(
          expected
            ? `Karton ${no}: total PDF ${expected.yards} yd / ${expected.rolls} roll, tetapi panjang roll terbaca ${sumPieces} yd / ${entry.pieces.length} roll.`
            : `Karton ${no}: baris total tidak ditemukan.`,
        );
      }
      return {
        no,
        designs: [...new Set(entry.designs)],
        // Utamakan total yang tertulis di PDF; bila tidak ada pakai jumlah panjang roll.
        yards: expected ? expected.yards : sumPieces,
        rolls: expected ? expected.rolls : entry.pieces.length,
        pieces: entry.pieces,
        ok,
      };
    });

  const gaps = [];
  for (let i = 1; i < cartons.length; i += 1) {
    for (let n = cartons[i - 1].no + 1; n < cartons[i].no; n += 1) gaps.push(n);
  }
  if (gaps.length) warnings.push(`Nomor karton yang tidak ditemukan: ${gaps.join(', ')}.`);

  // GRAND TOTAL di akhir PDF: dipakai sebagai pemeriksaan silang, bukan sebagai karton.
  let grandOk = null;
  if (grand) {
    const sumYards = Math.round(cartons.reduce((a, c) => a + c.yards, 0) * 100) / 100;
    const sumRolls = cartons.reduce((a, c) => a + c.rolls, 0);
    grandOk = Math.abs(grand.yards - sumYards) < 0.005 && grand.rolls === sumRolls;
    if (!grandOk) {
      warnings.push(`Jumlah semua karton ${sumYards} yd / ${sumRolls} roll, tetapi GRAND TOTAL di PDF ${grand.yards} yd / ${grand.rolls} roll.`);
    }
  }

  let lbr = '';
  let best = 0;
  for (const [key, count] of lbrCount) if (count > best) { best = count; lbr = key; }

  return { cartons, lbr, tanggal, warnings, grand: grand && { yards: grand.yards, rolls: grand.rolls }, grandOk };
}

/**
 * Cari "NNN,00 YARD = N Roll" di sekitar tulisan GRAND TOTAL.
 * Hasil: { yards, rolls, line } (line = nomor baris tempat angka yard grand total mulai) atau null.
 */
function findGrandTotal(lines) {
  const at = lines.findIndex((l) => GRAND_RE.test(l));
  if (at < 0) return null;
  const from = Math.max(0, at - 3);
  const slice = lines.slice(from, at + 4);
  // Gabung baris dengan spasi sambil mencatat posisi awal tiap baris.
  const starts = [];
  let joined = '';
  for (const l of slice) {
    starts.push(joined.length);
    joined += `${l} `;
  }
  const matches = [...joined.matchAll(new RegExp(GRAND_VALUE_RE.source, 'gi'))];
  if (!matches.length) return null;
  const last = matches[matches.length - 1]; // yang terakhir = grand total, bukan total karton terakhir
  let lineInSlice = 0;
  for (let i = 0; i < starts.length; i += 1) if (starts[i] <= last.index) lineInSlice = i;
  return { yards: parseIdNumber(last[1]), rolls: Number(last[2]), line: from + lineInSlice };
}
