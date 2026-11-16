import * as pdfjs from '../vendor/pdf.min.mjs';
import { extractLines, parsePackingList } from './parser.js';
import { calcAll, totals, brutoPerYard, validateParams } from './calc.js';
import { PRESETS, DEFAULT_PRESET_ID, findPreset, paramsOf } from './presets.js';
import { buildWorkbook } from './export.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const STORE_KEY = 'gwnw.v1';
const CUSTOM = 'custom';
const $ = (id) => document.getElementById(id);
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

const state = {
  fileName: '',
  cartons: [],
  lbr: '',
  tanggal: '',
  presetId: DEFAULT_PRESET_ID,
  customPresets: [],
  results: [],
};

// ---------- Penyimpanan lokal ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      presetId: state.presetId,
      params: readParams(),
      meta: readMeta(),
      customPresets: state.customPresets,
    }));
  } catch {
    /* penyimpanan penuh atau diblokir: abaikan */
  }
}

// ---------- Form ----------
const PARAM_FIELDS = ['ppt', 'ctnAcc', 'yardCtn', 'beratCtn'];

function readParams() {
  const out = {};
  for (const key of PARAM_FIELDS) out[key] = $(key).value === '' ? NaN : Number($(key).value);
  return out;
}
function writeParams(p) {
  for (const key of PARAM_FIELDS) $(key).value = p[key];
}
function readMeta() {
  return { buyer: $('buyer').value.trim(), item: $('item').value.trim(), formulir: $('formulir').value.trim() };
}

function fillPresetSelect() {
  const select = $('preset');
  select.innerHTML = '';
  const groups = new Map();
  for (const p of PRESETS) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  if (state.customPresets.length) groups.set('Preset saya', state.customPresets);
  for (const [group, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const p of list) og.append(new Option(`${p.name}, ${nf0.format(p.beratCtn / p.yardCtn)} kg/yard`, p.id));
    select.append(og);
  }
  const custom = document.createElement('optgroup');
  custom.label = 'Lainnya';
  custom.append(new Option('Isi sendiri', CUSTOM));
  select.append(custom);
  select.value = state.presetId;
}

function presetLabel() {
  const p = findPreset(state.presetId, state.customPresets);
  return p ? `${p.group} - ${p.name}` : 'Isi sendiri';
}

function showPresetNote() {
  const p = findPreset(state.presetId, state.customPresets);
  const note = $('presetNote');
  const messages = [];
  if (p && p.note) messages.push(p.note);
  const width = p && /^Lebar (\d+)/.exec(p.group);
  if (state.lbr && width && width[1] !== state.lbr) {
    messages.push(`PDF ini lebar ${state.lbr}", sedangkan preset terpilih ${p.group}. Pastikan angkanya memang untuk kain ini.`);
  }
  note.hidden = messages.length === 0;
  note.textContent = messages.join(' ');
  note.classList.toggle('caution', messages.length > 0 && Boolean(width) && state.lbr !== '' && width[1] !== state.lbr);
  $('deletePreset').hidden = !state.customPresets.some((c) => c.id === state.presetId);
}

function onPresetChange() {
  state.presetId = $('preset').value;
  const p = findPreset(state.presetId, state.customPresets);
  if (p) writeParams(paramsOf(p));
  recalc();
}

function onParamInput() {
  // Angka diubah tangan: cocokkan lagi dengan preset, kalau tidak ada berarti "Isi sendiri".
  const cur = readParams();
  const match = [...PRESETS, ...state.customPresets].find((p) => PARAM_FIELDS.every((k) => p[k] === cur[k]));
  state.presetId = match ? match.id : CUSTOM;
  $('preset').value = state.presetId;
  recalc();
}

// ---------- Perhitungan dan tampilan ----------
function recalc() {
  const params = readParams();
  const errors = validateParams(params);
  for (const key of PARAM_FIELDS) $(key).classList.toggle('invalid', !(params[key] >= 0) || ((key === 'yardCtn' || key === 'beratCtn') && !(params[key] > 0)));
  $('paramError').hidden = errors.length === 0;
  $('paramError').textContent = errors.join(' ');
  $('rate').textContent = errors.length ? '-' : brutoPerYard(params).toFixed(6).replace('.', ',');
  showPresetNote();
  save();

  if (!state.cartons.length || errors.length) {
    state.results = [];
    $('result').hidden = !state.cartons.length;
    if (errors.length) $('rows').innerHTML = '';
    $('download').disabled = true;
    return;
  }
  $('download').disabled = false;
  state.results = calcAll(state.cartons, params);
  renderTotals();
  renderRows();
}

function renderTotals() {
  const t = totals(state.results);
  $('totBruto').textContent = nf2.format(t.bruto);
  $('totNetto').textContent = nf2.format(t.netto);
  $('totCartons').textContent = nf0.format(t.cartons);
  $('totRolls').textContent = nf0.format(t.rolls);
  $('totYards').textContent = nf0.format(t.yards);
  $('totTare').textContent = `${nf2.format(t.tare)} kg`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

function renderRows() {
  const q = $('search').value.trim().toLowerCase();
  const list = q
    ? state.results.filter((r) => String(r.no) === q || r.designs.join(' ').toLowerCase().includes(q))
    : state.results;
  $('rows').innerHTML = list
    .map((r) => `<tr${r.ok ? '' : ' class="check"'}><td class="no">${r.no}</td><td class="design" title="${escapeHtml(r.designs.join(' + '))}">${escapeHtml(r.designs.join(' + '))}</td><td class="num">${nf0.format(r.yards)}</td><td class="num">${r.rolls}</td><td class="num">${nf2.format(r.bruto)}</td><td class="num netto">${nf2.format(r.netto)}</td></tr>`)
    .join('');
  $('noMatch').hidden = list.length > 0;
}

// ---------- Baca PDF ----------
function setStatus(text, kind = '') {
  const el = $('fileStatus');
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStatus('File ini bukan PDF. Pilih file Detail Packing List berformat PDF.', 'bad');
    return;
  }
  setStatus('Membaca PDF...');
  $('warnBox').hidden = true;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const lines = await extractLines(pdfjs, data, (page, total) => setStatus(`Membaca halaman ${page} dari ${total}...`));
    const parsed = parsePackingList(lines);
    if (!parsed.cartons.length) {
      state.cartons = [];
      recalc();
      setStatus('Tidak ada nomor karton yang terbaca. Pastikan ini PDF Detail Packing List dari sistem, bukan hasil scan atau foto.', 'bad');
      return;
    }
    state.fileName = file.name;
    state.cartons = parsed.cartons;
    state.lbr = parsed.lbr;
    state.tanggal = parsed.tanggal;
    if (!$('item').value.trim() && parsed.tanggal) $('item').value = `Detail packing list ${parsed.tanggal}`;

    const t = totals(parsed.cartons.map((c) => ({ ...c, bruto: 0, netto: 0 })));
    const allOk = parsed.warnings.length === 0;
    setStatus(
      `${file.name}: ${nf0.format(t.cartons)} karton, ${nf0.format(t.rolls)} roll, ${nf0.format(t.yards)} yard${parsed.lbr ? `, lebar ${parsed.lbr}"` : ''}.${allOk ? ' Semua nomor cocok dengan total di PDF.' : ''}`,
      allOk ? 'ok' : '',
    );
    if (!allOk) {
      $('warnSummary').textContent = `${parsed.warnings.length} hal perlu dicek`;
      $('warnList').innerHTML = parsed.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
      $('warnBox').hidden = false;
    }
    $('search').value = '';
    $('result').hidden = false;
    recalc();
  } catch (err) {
    console.error(err);
    setStatus('PDF tidak bisa dibaca. Coba buka ulang file-nya atau pilih file lain.', 'bad');
  }
}

// ---------- Unduh Excel ----------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.append(el);
  });
}

async function logoImage() {
  try {
    const res = await fetch('assets/logo.jpeg');
    if (!res.ok) return null;
    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { base64, extension: 'jpeg' };
  } catch {
    return null; // tanpa logo pun Excel tetap jadi
  }
}

async function download() {
  if (!state.results.length) return;
  const button = $('download');
  const status = $('downloadStatus');
  button.disabled = true;
  status.className = 'status';
  status.textContent = 'Menyiapkan Excel...';
  try {
    if (!window.ExcelJS) await loadScript('vendor/exceljs.min.js');
    const wb = buildWorkbook(window.ExcelJS, {
      results: state.results,
      params: readParams(),
      preset: presetLabel(),
      meta: readMeta(),
      logo: await logoImage(),
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const slug = (readMeta().buyer || state.fileName.replace(/\.pdf$/i, '') || 'hasil')
      .replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `HASIL_TIMBANGAN_${slug}.xlsx`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    status.className = 'status ok';
    status.textContent = `Excel diunduh: ${a.download}`;
  } catch (err) {
    console.error(err);
    status.className = 'status bad';
    status.textContent = 'Excel gagal dibuat. Coba lagi; kalau tetap gagal, muat ulang halaman.';
  } finally {
    button.disabled = false;
  }
}

// ---------- Preset saya ----------
function savePreset() {
  const params = readParams();
  if (validateParams(params).length) {
    $('paramError').hidden = false;
    $('paramError').textContent = 'Isi keempat angka dengan benar sebelum menyimpan preset.';
    return;
  }
  const name = window.prompt('Nama preset (mis. buyer atau artikel):');
  if (!name || !name.trim()) return;
  const id = `u-${Date.now()}`;
  state.customPresets.push({ id, group: 'Preset saya', name: name.trim(), ...params, pcsCtn: 0, dim: '' });
  state.presetId = id;
  fillPresetSelect();
  recalc();
}

function deletePreset() {
  const p = state.customPresets.find((c) => c.id === state.presetId);
  if (!p || !window.confirm(`Hapus preset "${p.name}"?`)) return;
  state.customPresets = state.customPresets.filter((c) => c.id !== p.id);
  state.presetId = DEFAULT_PRESET_ID;
  fillPresetSelect();
  writeParams(paramsOf(findPreset(DEFAULT_PRESET_ID)));
  recalc();
}

// ---------- Mulai ----------
function init() {
  const saved = load();
  state.customPresets = Array.isArray(saved.customPresets) ? saved.customPresets : [];
  state.presetId = findPreset(saved.presetId, state.customPresets) || saved.presetId === CUSTOM ? saved.presetId : DEFAULT_PRESET_ID;
  fillPresetSelect();
  const startPreset = findPreset(state.presetId, state.customPresets);
  writeParams(state.presetId === CUSTOM && saved.params ? saved.params : paramsOf(startPreset || findPreset(DEFAULT_PRESET_ID)));
  const meta = saved.meta || {};
  $('buyer').value = meta.buyer || '';
  $('item').value = meta.item || '';
  $('formulir').value = meta.formulir ?? 'FMKA-IK-09-26-0';

  $('preset').addEventListener('change', onPresetChange);
  for (const key of PARAM_FIELDS) $(key).addEventListener('input', onParamInput);
  for (const key of ['buyer', 'item', 'formulir']) $(key).addEventListener('input', save);
  $('search').addEventListener('input', renderRows);
  $('download').addEventListener('click', download);
  $('savePreset').addEventListener('click', savePreset);
  $('deletePreset').addEventListener('click', deletePreset);

  const drop = $('drop');
  $('file').addEventListener('change', (e) => handleFile(e.target.files[0]));
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  recalc();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
