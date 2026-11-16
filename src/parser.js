// Parser "DETAIL PACKING LIST" (PDF) -> daftar karton.
//
// Satu nomor di PDF = satu karton. Tiap karton punya panjang roll (yard) dan
// total "NNN,00 YARDS = N Roll". Karton campuran (beberapa desain dalam satu
// nomor) punya beberapa sub-baris dan satu baris total gabungan.

const TOTAL_RE = /([\d.]+,\d+)\s+YARDS\s*=\s*(\d+)\s*Roll/i;
const START_RE = /^\s*(\d{1,4})\s+[A-Za-z]/;
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

  for (const line of lines) {
    const text = line.trim();
    if (!text || text === ':') continue;
    const dateMatch = text.match(/^Tanggal\s*:\s*(\d{2}-\d{2}-\d{4})/);
    if (dateMatch && !tanggal) tanggal = dateMatch[1];
    if (SKIP_PREFIX.some((prefix) => text.startsWith(prefix))) continue;

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
    const body = line.replace(/[\d.]+,\d+\s+YARDS.*$/i, '');
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

  let lbr = '';
  let best = 0;
  for (const [key, count] of lbrCount) if (count > best) { best = count; lbr = key; }

  return { cartons, lbr, tanggal, warnings };
}
