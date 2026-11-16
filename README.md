# Hitung GW / NW

Aplikasi web untuk menghitung berat **bruto (GW)** dan **netto (NW)** per karton dari file
*Detail Packing List* (PDF), lalu mengunduh hasilnya sebagai Excel dengan tampilan seperti
file **HASIL TIMBANGAN**.

Berjalan penuh di browser (tanpa server, tanpa unggah file). Bisa dipasang sebagai aplikasi di
Android dan desktop (PWA) dan tetap jalan tanpa internet setelah dibuka sekali.

## Cara pakai

1. Pilih file PDF packing list. Aplikasi membaca nomor karton, panjang tiap roll, total yard, dan jumlah roll.
2. Pilih **preset berat kemasan** (diambil dari file *BERAT BRUTO VS NETTO TEORI*) atau isi angkanya sendiri.
3. Isi buyer / keterangan bila perlu, lalu klik **Unduh Excel**.

Satu nomor di PDF = satu karton.

## Rumus

```
Bruto per yard = berat 1 karton contoh / yard 1 karton contoh     (GR/YD/CTN)
Bruto          = yard karton x bruto per yard
Tare           = (jumlah roll x PPT) + (karton + aksesori)
Netto          = Bruto - Tare
```

Angka kg dibulatkan 2 desimal seperti Excel. Rumus ini sudah dicocokkan dengan 55 baris contoh
di file HASIL TIMBANGAN (tanpa selisih).

## Isi file Excel

- **HASIL TIMBANGAN**: kop, buyer, total bruto/netto, lalu tabel No. Ctn / Bruto / Netto. Siap cetak A4,
  55 karton per halaman, judul tabel berulang di tiap halaman.
- **PERHITUNGAN**: parameter (sel kuning bisa diubah) dan rumus per karton (yard, roll, bruto, tare, netto,
  panjang tiap roll). Sheet pertama membaca angkanya dari sini, jadi ikut berubah.

## Menjalankan di komputer

Perlu server statis (modul ES dan service worker tidak jalan dari `file://`):

```bash
python3 -m http.server 8080
# buka http://localhost:8080
```

## Menayangkan lewat GitHub Pages

1. Push seluruh folder ini ke repo GitHub.
2. Settings > Pages > Build and deployment > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Buka alamat Pages yang muncul. Semua path di aplikasi relatif, jadi aman di sub-folder repo.

## Memasang sebagai aplikasi

- **Android (Chrome)**: menu titik tiga > *Tambahkan ke layar utama* / *Instal aplikasi*.
- **Desktop (Chrome / Edge)**: tombol *Instal* di address bar.

Setelah rilis baru, naikkan `CACHE` di `sw.js` (mis. `gwnw-v2`) agar perangkat mengambil versi terbaru.

## Mengubah atau menambah preset

Edit `src/presets.js`. Tiap preset: `ppt`, `yardCtn`, `pcsCtn`, `beratCtn`, `ctnAcc`.
Pengguna juga bisa menyimpan preset sendiri dari aplikasi (tersimpan di browser perangkat itu).

## Pengujian

```bash
npm install
npm test
```

- `calc.test.mjs`: rumus dan pembulatan, dicocokkan dengan angka di file HASIL TIMBANGAN.
- `parse.test.mjs`: membaca `test/welfull.pdf` (335 karton, 58.957 yard, 2.313 roll, semua cocok dengan total PDF).
- `export.test.mjs`: membuat Excel ke `test/out/`. Versi `hasil_nocache.xlsx` tidak menyimpan nilai
  sehingga bisa dibuka di LibreOffice untuk memastikan semua rumus menghitung sama dengan aplikasi.

## Struktur

```
index.html, styles.css      tampilan
src/app.js                  alur aplikasi
src/parser.js               baca PDF -> daftar karton
src/calc.js                 rumus bruto / netto
src/presets.js              preset berat kemasan
src/export.js               pembuat file Excel
vendor/                     pdf.js dan ExcelJS (disertakan agar bisa offline)
sw.js, manifest.webmanifest PWA
test/                       pengujian + PDF contoh
```

## Catatan

- Parser membaca PDF Detail Packing List dari sistem (teks, bukan hasil scan). Bila ada nomor karton yang
  totalnya tidak cocok dengan panjang roll, aplikasi menandainya (*cek*) dan menampilkan daftarnya.
- Di Excel teori, sheet **Lebar 36** blok 2 memakai PPT blok 1 (0,3) di rumusnya, padahal blok 2 berisi 0,18.
  Preset di sini memakai PPT blok masing-masing.
- Pustaka pihak ketiga di `vendor/`: [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) dan
  [ExcelJS](https://github.com/exceljs/exceljs) (MIT); lisensinya disertakan.
