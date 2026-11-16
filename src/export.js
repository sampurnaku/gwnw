// Ekspor ke Excel (.xlsx) dengan tampilan seperti file HASIL TIMBANGAN.
//
// Sheet 1 "HASIL TIMBANGAN": No. Ctn | Bruto | Netto + total di atas, siap cetak A4.
// Sheet 2 "PERHITUNGAN"    : parameter + rumus per karton (Bruto, Tare, Netto), bisa diubah di Excel.
//
// `ExcelJS` dikirim sebagai argumen agar modul ini jalan di browser maupun Node.

import { brutoPerYard, totals } from './calc.js';

export const ROWS_PER_PAGE = 55;
const FIRST_DATA_ROW = 15; // baris pertama data di sheet HASIL TIMBANGAN
const CALC_FIRST_ROW = 12; // baris pertama data di sheet PERHITUNGAN
const ORANGE = 'FFE1871D';
const BLACK = 'FF000000';
const FMT = '#,##0.00';

const side = (style) => ({ style });
const box = (style) => ({ top: side(style), left: side(style), bottom: side(style), right: side(style) });

/** Isi sel rumus; `omitCache` dipakai untuk uji (memaksa program lain menghitung ulang). */
function formula(text, result, omitCache) {
  return omitCache ? { formula: text } : { formula: text, result };
}

/**
 * @param ExcelJS  library ExcelJS
 * @param opts { results, params, preset, meta, logo, omitCache }
 *   results : hasil calcAll() (no, designs, yards, rolls, pieces, bruto, tare, netto)
 *   params  : { ppt, yardCtn, beratCtn, ctnAcc }
 *   preset  : nama preset (teks)
 *   meta    : { buyer, item, formulir }
 *   logo    : opsional, objek untuk workbook.addImage ({ base64, extension } atau { buffer, extension })
 */
export function buildWorkbook(ExcelJS, { results, params, preset = '', meta = {}, logo = null, omitCache = false }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hitung GW/NW';
  wb.created = new Date();

  const lahan = wb.addWorksheet('HASIL TIMBANGAN', { views: [{ showGridLines: false }] });
  const calc = wb.addWorksheet('PERHITUNGAN', { views: [{ state: 'frozen', ySplit: CALC_FIRST_ROW - 1 }] });
  const sum = totals(results);
  const lastData = FIRST_DATA_ROW + results.length - 1;
  const lastCalc = CALC_FIRST_ROW + results.length - 1;

  buildCalcSheet(calc, { results, params, preset, sum, omitCache, lastCalc });
  buildLahanSheet(wb, lahan, { results, meta, logo, sum, omitCache, lastData });
  return wb;
}

function buildLahanSheet(wb, ws, { results, meta, logo, sum, omitCache, lastData }) {
  ws.columns = [{ width: 4.1 }, { width: 14.7 }, { width: 22 }, { width: 24.7 }];
  ws.getRow(1).height = 4.5;
  ws.getRow(6).height = 20.1;
  ws.getRow(7).height = 11.1;
  ws.getRow(8).height = 24;
  ws.getRow(9).height = 24;
  ws.getRow(10).height = 24;
  ws.getRow(11).height = 18.75;
  ws.getRow(12).height = 24;
  ws.getRow(13).height = 2.25;
  ws.getRow(14).height = 22.5;

  // Kop
  ws.mergeCells('B5:B7');
  ws.mergeCells('C5:C7');
  ws.mergeCells('D5:D7');
  ws.getCell('C5').value = 'PENGECEKAN NETTO / BRUTO';
  ws.getCell('D5').value = `Formulir :  ${meta.formulir || ''}`.trimEnd();
  for (const ref of ['B5', 'C5', 'D5']) ws.getCell(ref).border = box('thin');
  ws.getCell('C5').font = { name: 'Calibri', size: 12, bold: true };
  ws.getCell('D5').font = { name: 'Calibri', size: 12 };
  for (const ref of ['C5', 'D5']) ws.getCell(ref).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  if (logo) {
    const id = wb.addImage(logo);
    ws.addImage(id, { tl: { col: 1.12, row: 4.1 }, ext: { width: 50, height: 33 } });
  }

  ws.getCell('B8').value = 'Hasil Timbangan';
  ws.getCell('B8').font = { name: 'Calibri', size: 18, bold: true };

  // Kotak oranye: buyer + total
  ws.mergeCells('B9:D9');
  ws.mergeCells('B10:D10');
  ws.getCell('B9').value = meta.buyer ? `Buyer : ${meta.buyer}` : 'Buyer :';
  ws.getCell('B10').value = meta.item || '';
  for (const ref of ['B9', 'B10']) {
    ws.getCell(ref).font = { name: 'Calibri', size: 18, bold: true, color: { argb: BLACK } };
    ws.getCell(ref).alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
  }
  ws.getCell('B11').value = 'Total (Kg)';
  ws.getCell('C11').value = 'Bruto';
  ws.getCell('D11').value = 'Netto';
  ws.getCell('C12').value = formula(`SUM(C${FIRST_DATA_ROW}:C${lastData})`, sum.bruto, omitCache);
  ws.getCell('D12').value = formula(`SUM(D${FIRST_DATA_ROW}:D${lastData})`, sum.netto, omitCache);
  ws.getCell('C12').numFmt = FMT;
  ws.getCell('D12').numFmt = FMT;
  for (let r = 9; r <= 12; r += 1) {
    for (const col of ['B', 'C', 'D']) {
      const cell = ws.getCell(`${col}${r}`);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
      if (r >= 11) {
        cell.font = { name: 'Calibri', size: r === 11 && col !== 'B' ? 16 : 18, bold: true, color: { argb: BLACK } };
        cell.alignment = { horizontal: col === 'B' ? 'center' : r === 11 ? 'center' : 'right', vertical: 'middle' };
        cell.border = box('double');
      }
    }
  }
  ws.getCell('B9').border = { top: side('medium'), left: side('medium') };
  ws.getCell('C9').border = { top: side('medium') };
  ws.getCell('D9').border = { top: side('medium'), right: side('medium') };
  ws.getCell('B10').border = { left: side('medium'), bottom: side('medium') };
  ws.getCell('C10').border = { bottom: side('medium') };
  ws.getCell('D10').border = { right: side('medium'), bottom: side('medium') };

  // Judul tabel
  ['No. Ctn', 'Bruto', 'Netto'].forEach((text, i) => {
    const cell = ws.getCell(14, 2 + i);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 16, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: side('thin'), left: side('thin'), right: side('thin'), bottom: side('double') };
  });

  // Data
  results.forEach((r, i) => {
    const row = FIRST_DATA_ROW + i;
    const calcRow = CALC_FIRST_ROW + i;
    ws.getRow(row).height = 24;
    const no = ws.getCell(`B${row}`);
    const bruto = ws.getCell(`C${row}`);
    const netto = ws.getCell(`D${row}`);
    no.value = r.no;
    bruto.value = formula(`PERHITUNGAN!F${calcRow}`, r.bruto, omitCache);
    netto.value = formula(`PERHITUNGAN!H${calcRow}`, r.netto, omitCache);
    bruto.numFmt = FMT;
    netto.numFmt = FMT;
    for (const cell of [no, bruto, netto]) {
      cell.font = { name: 'Calibri', size: 18 };
      cell.border = { left: side('thin'), right: side('thin'), top: side('hair'), bottom: side('hair') };
    }
    no.alignment = { horizontal: 'center' };
    bruto.alignment = { horizontal: 'right' };
    netto.alignment = { horizontal: 'right' };
    // Pindah halaman setiap 55 karton
    if ((i + 1) % ROWS_PER_PAGE === 0 && i + 1 < results.length) ws.getRow(row).addPageBreak();
  });

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    scale: 49,
    printArea: `B5:D${lastData}`,
    printTitlesRow: '14:14',
    margins: { left: 0.2, right: 0.4, top: 0.16, bottom: 0.2, header: 0.1, footer: 0.1 },
  };
}

function buildCalcSheet(ws, { results, params, preset, sum, omitCache, lastCalc }) {
  ws.columns = [
    { width: 3 }, { width: 28 }, { width: 26 }, { width: 11 }, { width: 8 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 70 },
  ];
  ws.getCell('B1').value = 'Perhitungan Bruto / Netto';
  ws.getCell('B1').font = { name: 'Calibri', size: 16, bold: true };
  ws.getCell('B2').value = 'Bruto = Yard x Bruto per yard   |   Tare = Roll x PPT + Karton/aksesori   |   Netto = Bruto - Tare';
  ws.getCell('B2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF595959' } };

  const inputs = [
    ['Preset', preset || 'Kustom', null],
    ['1 PPT (kg / roll)', params.ppt, '0.00'],
    ['Karton + aksesori (kg)', params.ctnAcc, '0.00'],
    ['Yard 1 karton (acuan)', params.yardCtn, '#,##0.00'],
    ['Berat 1 karton (kg)', params.beratCtn, '#,##0.00'],
  ];
  inputs.forEach(([label, value, fmt], i) => {
    const row = 4 + i;
    ws.getCell(`B${row}`).value = label;
    const cell = ws.getCell(`C${row}`);
    cell.value = value;
    if (fmt) cell.numFmt = fmt;
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
    cell.border = box('thin');
    cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0000FF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  });
  ws.mergeCells('C4:E4');
  ws.getCell('B9').value = 'Bruto per yard (kg / yd)';
  ws.getCell('C9').value = formula('C8/C7', brutoPerYard(params), omitCache);
  ws.getCell('C9').numFmt = '0.000000';
  ws.getCell('C9').border = box('thin');
  ws.getCell('C9').font = { name: 'Calibri', size: 11, bold: true };
  ws.getCell('F5').value = 'Sel kuning bisa diubah; semua angka di bawah ikut menghitung ulang.';
  ws.getCell('F5').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF595959' } };

  const headers = ['No. Ctn', 'Desain', 'Yard', 'Roll', 'Bruto (kg)', 'Tare (kg)', 'Netto (kg)', 'Panjang tiap roll (yard)'];
  headers.forEach((text, i) => {
    const cell = ws.getCell(CALC_FIRST_ROW - 1, 2 + i);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF404040' } };
    cell.alignment = { horizontal: i >= 2 && i <= 6 ? 'right' : 'left', vertical: 'middle', indent: i === 7 ? 1 : 0 };
  });
  ws.getRow(CALC_FIRST_ROW - 1).height = 20;

  results.forEach((r, i) => {
    const row = CALC_FIRST_ROW + i;
    ws.getCell(`B${row}`).value = r.no;
    ws.getCell(`B${row}`).alignment = { horizontal: 'left' };
    ws.getCell(`C${row}`).value = (r.designs || []).join(' + ');
    ws.getCell(`D${row}`).value = r.yards;
    ws.getCell(`E${row}`).value = r.rolls;
    ws.getCell(`F${row}`).value = formula(`ROUND(D${row}*$C$9,2)`, r.bruto, omitCache);
    ws.getCell(`G${row}`).value = formula(`E${row}*$C$5+$C$6`, r.tare, omitCache);
    ws.getCell(`H${row}`).value = formula(`ROUND(F${row}-G${row},2)`, r.netto, omitCache);
    ws.getCell(`I${row}`).value = (r.pieces || []).join(', ');
    ws.getCell(`I${row}`).alignment = { horizontal: 'left', indent: 1 };
    for (const col of ['D', 'F', 'G', 'H']) ws.getCell(`${col}${row}`).numFmt = FMT;
    ws.getCell(`D${row}`).numFmt = '#,##0.##';
  });

  const totalRow = lastCalc + 1;
  ws.getCell(`B${totalRow}`).value = 'TOTAL';
  ws.getCell(`D${totalRow}`).value = formula(`SUM(D${CALC_FIRST_ROW}:D${lastCalc})`, sum.yards, omitCache);
  ws.getCell(`E${totalRow}`).value = formula(`SUM(E${CALC_FIRST_ROW}:E${lastCalc})`, sum.rolls, omitCache);
  ws.getCell(`F${totalRow}`).value = formula(`SUM(F${CALC_FIRST_ROW}:F${lastCalc})`, sum.bruto, omitCache);
  ws.getCell(`G${totalRow}`).value = formula(`SUM(G${CALC_FIRST_ROW}:G${lastCalc})`, sum.tare, omitCache);
  ws.getCell(`H${totalRow}`).value = formula(`SUM(H${CALC_FIRST_ROW}:H${lastCalc})`, sum.netto, omitCache);
  for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
    const cell = ws.getCell(`${col}${totalRow}`);
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.border = { top: side('thin'), bottom: side('double') };
  }
  for (const col of ['D', 'F', 'G', 'H']) ws.getCell(`${col}${totalRow}`).numFmt = FMT;
  ws.getCell(`D${totalRow}`).numFmt = '#,##0.##';

  ws.autoFilter = { from: { row: CALC_FIRST_ROW - 1, column: 2 }, to: { row: lastCalc, column: 9 } };
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${CALC_FIRST_ROW - 1}:${CALC_FIRST_ROW - 1}`,
  };
}
