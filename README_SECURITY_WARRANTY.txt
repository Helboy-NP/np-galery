NP_Galery UPDATE Security & E-Garansi V3.3.8

Basis: V3.3.7

Perubahan:
- Public warranty lookup kini memakai RPC baru lookup_warranty_public_safe.
- Nama pelanggan tidak dikembalikan; sertifikat publik menampilkan label umum.
- IMEI pada sertifikat publik disamarkan, hanya 4 digit terakhir yang terlihat.
- Barcode lama tetap memakai parameter ?warranty=<ID> dan tetap diterima.
- RPC lama lookup_warranty_public harus dinonaktifkan untuk anon/authenticated dengan SQL pendamping.

WAJIB:
1. Jalankan SQL pendamping di Supabase sebelum deploy ZIP.
2. Deploy file aplikasi dari ZIP ini.
3. Uji barcode lama tanpa login, pastikan sertifikat tampil dengan IMEI tersamarkan dan nama umum.
4. Uji login, penjualan, stok, foto produk, dan Realtime.

Catatan: ID barcode lama masih dapat ditebak. Migrasi ke token acak per sertifikat adalah tahap keamanan lanjutan; perubahan ini mengurangi paparan data pribadi tetapi tidak menggantikan token acak.
