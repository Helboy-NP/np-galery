-- NP_Galery MASTER V1.7 — Master Foto Produk + Invoice Snapshot
-- Jalankan sekali di Supabase SQL Editor. Tidak mengubah foto fisik unit pada product.image_url.

create table if not exists public.product_reference_images (
  product_id text primary key,
  image_url text,
  updated_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists product_id text,
  add column if not exists invoice_photo_url text;

create index if not exists idx_transactions_product_id on public.transactions(product_id);

-- Untuk transaksi lama, isi product_id dari id karena V1.6 memakai id product = id transaction.
update public.transactions
set product_id = id
where product_id is null;

-- RLS: baca master foto dan transaksi mengikuti pola aplikasi publik saat ini.
alter table public.product_reference_images enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_reference_images' and policyname='product reference images read') then
    create policy "product reference images read" on public.product_reference_images for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_reference_images' and policyname='product reference images insert') then
    create policy "product reference images insert" on public.product_reference_images for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_reference_images' and policyname='product reference images update') then
    create policy "product reference images update" on public.product_reference_images for update using (true) with check (true);
  end if;
end $$;

-- Catatan: isi product_reference_images sekali dengan URL foto resmi per product_id.
-- Foto ini adalah Master Foto Produk; jangan gunakan product.image_url (foto fisik unit).
