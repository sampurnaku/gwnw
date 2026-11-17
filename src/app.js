import * as pdfjs from '../vendor/pdf.min.mjs';
import { extractLines, parsePackingList } from './parser.js';
import { calcAll, totals, brutoPerYard, validateParams } from './calc.js';
import { PRESETS, DEFAULT_PRESET_ID, findPreset, paramsOf } from './presets.js';
import { buildWorkbook } from './export.js';
import { MAX_SAMPLES, emptySample, summarizeSamples, effectiveParams } from './samples.js';
import { VERSION } from './version.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const STORE_KEY = 'gwnw.v1';
const CUSTOM = 'custom';
const $ = (id) => document.getElementById(id);
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

const state = {
  fileName: '',
  cartons: [],
  lbr: '',
  tanggal: '',
  presetId: DEFAULT_PRESET_ID,
  customPresets: [],
  results: [],
  samples: [],
  useSamples: true,
  summary: { rows: [], count: 0 },
  effective: null,
  usingSamples: false,
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
      useSamples: state.useSamples,
      samples: state.samples.map(({ no, yards, rolls, bruto, netto, src, auto }) => ({ no, yards, rolls, bruto, netto, src, auto })),
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
  refreshSamples(params);
  const eff = effectiveParams(params, state.summary, state.useSamples);
  const usingSamples = eff !== params;
  state.effective = eff;
  state.usingSamples = usingSamples;

  const errors = validateParams(eff);
  for (const key of PARAM_FIELDS) {
    const bad = !(params[key] >= 0) || ((key === 'yardCtn' || key === 'beratCtn') && !(params[key] > 0));
    const ignored = usingSamples && (key === 'yardCtn' || key === 'beratCtn');
    $(key).classList.toggle('invalid', bad && !ignored);
  }
  for (const key of ['yardCtn', 'beratCtn']) $(key).closest('.field').classList.toggle('overridden', usingSamples);
  $('paramError').hidden = errors.length === 0;
  $('paramError').textContent = errors.join(' ');
  $('rate').textContent = errors.length ? '-' : brutoPerYard(eff).toFixed(6).replace('.', ',');
  $('rateSource').textContent = usingSamples ? ` (rata-rata ${state.summary.count} sampel timbangan, bukan angka preset)` : '';
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
  state.results = calcAll(state.cartons, eff);
  renderTotals();
  renderRows();
}

// ---------- Timbangan sampel ----------
const escapeAttr = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

function sampleField(id, f, label, value, step, mode) {
  return `<div class="field"><label for="${id}-${f}">${label}</label><input id="${id}-${f}" data-f="${f}" type="number" inputmode="${mode}" step="${step}" min="0" value="${escapeAttr(value)}"${f === 'no' ? ' placeholder="boleh kosong"' : ''}></div>`;
}

function renderSamples() {
  $('samples').innerHTML = state.samples.map((s, i) => {
    const id = `s${i}`;
    return `<div class="sample">
      <div class="sample-head"><h3>Sampel ${i + 1}</h3><span class="sample-rate" data-rate></span><button type="button" class="link" data-remove aria-label="Hapus sampel ${i + 1}">Hapus</button></div>
      <div class="sample-fields">
        ${sampleField(id, 'no', 'No. karton', s.no, '1', 'numeric')}
        ${sampleField(id, 'yards', 'Yard', s.yards, 'any', 'decimal')}
        ${sampleField(id, 'rolls', 'Roll', s.rolls, '1', 'numeric')}
        ${sampleField(id, 'bruto', 'Bruto (kg)', s.bruto, 'any', 'decimal')}
        ${sampleField(id, 'netto', 'Netto (kg)', s.netto, 'any', 'decimal')}
      </div>
      <p class="sample-msg" data-msg></p>
    </div>`;
  }).join('');
}

/** Hitung ulang semua sampel; perbarui kolom turunan, rata-rata per baris, dan ringkasan. */
function refreshSamples(params) {
  const summary = summarizeSamples(state.samples, { ppt: params.ppt, ctnAcc: params.ctnAcc });
  state.summary = summary;
  const rows = $('samples').children;
  summary.rows.forEach((r, i) => {
    const el = rows[i];
    if (!el) return;
    const bruto = el.querySelector('[data-f="bruto"]');
    const netto = el.querySelector('[data-f="netto"]');
    const [source, derived, derivedValue] = r.src === 'netto' ? [netto, bruto, r.bruto] : [bruto, netto, r.netto];
    source.classList.remove('derived');
    derived.classList.add('derived');
    derived.value = Number.isFinite(derivedValue) ? derivedValue : '';
    el.querySelector('[data-rate]').textContent = r.valid ? `${nf4.format(r.rate)} kg/yard` : '';
    const filled = ['no', 'yards', 'rolls', r.src].some((f) => state.samples[i][f] !== '');
    el.querySelector('[data-msg]').textContent = state.samples[i].noMsg || (!r.valid && filled ? r.reason : '');
  });

  const box = $('sampleSummary');
  if (!summary.count) {
    box.className = 'sample-summary empty';
    box.textContent = 'Belum ada sampel yang lengkap. Isi yard dan berat untuk minimal satu sampel.';
    return;
  }
  const presetRate = params.yardCtn > 0 && params.beratCtn > 0 ? params.beratCtn / params.yardCtn : NaN;
  let text = `Rata-rata ${nf4.format(summary.rate)} kg/yard dari ${summary.count} sampel`;
  if (summary.count > 1) text += `, selisih antar sampel ${nf1.format(summary.spreadPct)}%`;
  text += '.';
  if (Number.isFinite(presetRate)) {
    const diff = (summary.rate / presetRate - 1) * 100;
    text += ` Angka preset ${nf4.format(presetRate)} kg/yard (${diff >= 0 ? '+' : ''}${nf1.format(diff)}%).`;
  }
  if (summary.count < 3) text += ' Disarankan 3 sampai 5 sampel.';
  if (summary.count > 1 && summary.spreadPct > 3) text += ' Selisih antar sampel cukup besar, cek lagi timbangannya.';
  box.className = 'sample-summary';
  box.textContent = text;
}

function fillSampleFromPdf(sample, rowEl) {
  const no = Number(sample.no);
  const carton = sample.no === '' ? null : state.cartons.find((c) => c.no === no);
  if (carton) {
    sample.yards = carton.yards;
    sample.rolls = carton.rolls;
    sample.auto = true;
    if (rowEl) {
      rowEl.querySelector('[data-f="yards"]').value = carton.yards;
      rowEl.querySelector('[data-f="rolls"]').value = carton.rolls;
    }
  } else if (sample.no !== '' && state.cartons.length) {
    sample.noMsg = `Nomor ${sample.no} tidak ada di PDF. Isi yard dan roll sendiri.`;
  }
}

function onSampleInput(e) {
  const input = e.target.closest('input[data-f]');
  if (!input) return;
  const rowEl = input.closest('.sample');
  const sample = state.samples[[...$('samples').children].indexOf(rowEl)];
  const field = input.dataset.f;
  sample[field] = input.value;
  sample.noMsg = '';
  if (field === 'bruto' || field === 'netto') sample.src = field;
  if (field === 'yards' || field === 'rolls') sample.auto = false;
  if (field === 'no') fillSampleFromPdf(sample, rowEl);
  recalc();
}

function onSampleClick(e) {
  const button = e.target.closest('[data-remove]');
  if (!button) return;
  const index = [...$('samples').children].indexOf(button.closest('.sample'));
  state.samples.splice(index, 1);
  if (!state.samples.length) state.samples.push(emptySample());
  renderSamples();
  recalc();
}

function addSample() {
  if (state.samples.length >= MAX_SAMPLES) return;
  state.samples.push(emptySample());
  renderSamples();
  recalc();
  const last = $('samples').lastElementChild;
  if (last) last.querySelector('[data-f="no"]').focus();
}

function clearSamples() {
  if (state.samples.some((s) => s.yards !== '' || s.bruto !== '' || s.netto !== '') && !window.confirm('Kosongkan semua sampel?')) return;
  state.samples = [emptySample(), emptySample(), emptySample()];
  renderSamples();
  recalc();
}

function cleanSamples(list) {
  if (!Array.isArray(list)) return null;
  const clean = list.slice(0, MAX_SAMPLES).map((s) => ({
    ...emptySample(),
    no: s.no ?? '', yards: s.yards ?? '', rolls: s.rolls ?? '', bruto: s.bruto ?? '', netto: s.netto ?? '',
    src: s.src === 'netto' ? 'netto' : 'bruto', auto: Boolean(s.auto),
  }));
  return clean.length ? clean : null;
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
      `${file.name}: ${nf0.format(t.cartons)} karton, ${nf0.format(t.rolls)} roll, ${nf0.format(t.yards)} yard${parsed.lbr ? `, lebar ${parsed.lbr}"` : ''}.${allOk ? (parsed.grandOk ? ' Semua karton dan GRAND TOTAL cocok dengan PDF.' : ' Semua nomor cocok dengan total di PDF.') : ''}`,
      allOk ? 'ok' : '',
    );
    if (!allOk) {
      $('warnSummary').textContent = `${parsed.warnings.length} hal perlu dicek`;
      $('warnList').innerHTML = parsed.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
      $('warnBox').hidden = false;
    }
    for (const sample of state.samples) if (sample.no !== '' && (sample.yards === '' || sample.auto)) fillSampleFromPdf(sample, null);
    renderSamples();
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
      params: state.effective,
      preset: state.usingSamples ? `Rata-rata ${state.summary.count} sampel timbangan (kemasan: ${presetLabel()})` : presetLabel(),
      meta: readMeta(),
      samples: state.usingSamples ? { enabled: true, rows: state.summary.rows.filter((r) => r.valid) } : null,
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
  state.samples = cleanSamples(saved.samples) || [emptySample(), emptySample(), emptySample()];
  state.useSamples = saved.useSamples !== false;
  $('useSamples').checked = state.useSamples;
  $('version').textContent = `Versi ${VERSION}`;
  renderSamples();

  $('preset').addEventListener('change', onPresetChange);
  for (const key of PARAM_FIELDS) $(key).addEventListener('input', onParamInput);
  for (const key of ['buyer', 'item', 'formulir']) $(key).addEventListener('input', save);
  $('search').addEventListener('input', renderRows);
  $('download').addEventListener('click', download);
  $('savePreset').addEventListener('click', savePreset);
  $('deletePreset').addEventListener('click', deletePreset);
  $('samples').addEventListener('input', onSampleInput);
  $('samples').addEventListener('click', onSampleClick);
  $('addSample').addEventListener('click', addSample);
  $('clearSamples').addEventListener('click', clearSamples);
  $('useSamples').addEventListener('change', (e) => { state.useSamples = e.target.checked; recalc(); });

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
