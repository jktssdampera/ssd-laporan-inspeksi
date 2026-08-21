/**
 * form-data.js
 * Centralized data store — single source of truth for all inspection categories,
 * workshop defaults, and login credentials.
 */

// ─── Supabase Configuration ────────────────────────────────────────────
const SUPABASE_URL = 'https://ussmphccrvrylaqtljri.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzc21waGNjcnZyeWxhcXRsanJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjYwMzUsImV4cCI6MjA3NTYwMjAzNX0.yTlk3zSE0MZZ4WKpY5JIS1HHRpvc5mfKriLij3XbhCQ';
let supabaseClient = null;
try {
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Supabase] Client initialized successfully');
  } else {
    console.warn('[Supabase] Library not loaded, running in offline mode');
  }
} catch (e) {
  console.error('[Supabase] Failed to initialize client:', e);
}

// ─── Login Credentials (client-side only) ────────────────────────────
const AUTH_CREDENTIALS = [
  { username: 'admin', password: 'Komponen0285' },
  { username: 'ssdampera', password: 'ampera0285' },
  { username: 'sm0285', password: 'ampera0285' }
];

// ─── Default Workshop Info ───────────────────────────────────────────
const DEFAULT_WORKSHOP = {
  logo: 'Assets/logo.png',
  name: 'Super Shop&Drive Ampera',
  address: 'Jl. Ampera Raya No. 138 Ragunan, Pasar Minggu',
  phone: '(021)-7823844',
  whatsapp: '+62217823844',
  email: 'jkt.ssdampera@shopanddrive.com'
};

// ─── Customer Form Fields ────────────────────────────────────────────
const CUSTOMER_FIELDS = [
  { id: 'customerName', label: 'Nama Customer', type: 'text', placeholder: 'Nama pemilik kendaraan', required: true },
  { id: 'customerPhone', label: 'No. Telepon Customer', type: 'tel', placeholder: '08xxxxxxxxxx', required: false },
  { id: 'vehicleBrand', label: 'Merek & Model Mobil', type: 'text', placeholder: 'Toyota Avanza 1.3 G', required: true },
  { id: 'vehicleYear', label: 'Tahun Kendaraan', type: 'number', placeholder: '2024', required: false },
  { id: 'vehiclePlate', label: 'Nomor Polisi', type: 'text', placeholder: 'B 1234 ABC', required: true },
  { id: 'vehicleOdometer', label: 'Odometer (KM)', type: 'number', placeholder: '50000', required: false },
  { id: 'inspectionDate', label: 'Tanggal Inspeksi', type: 'date', placeholder: '', required: true },
  { id: 'mechanicName', label: 'Nama Mekanik', type: 'text', placeholder: 'Nama mekanik yang memeriksa', required: true }
];

// ─── Inspection Status Options ───────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'good', label: 'Baik', icon: 'check-circle', colorClass: 'status-good' },
  { value: 'warning', label: 'Perlu Perhatian', icon: 'alert-triangle', colorClass: 'status-warning' },
  { value: 'danger', label: 'Rusak', icon: 'x-circle', colorClass: 'status-danger' },
  { value: 'unchecked', label: 'Tidak Diperiksa', icon: 'minus-circle', colorClass: 'status-unchecked' }
];

// ─── Inspection Categories & Items ───────────────────────────────────
const INSPECTION_CATEGORIES = [
  {
    id: 'A',
    name: 'Mesin (Engine)',
    icon: 'settings',
    items: [
      { id: 'A1', label: 'Kondisi Oli Mesin (warna, level, kekentalan)' },
      { id: 'A2', label: 'Kondisi Filter Udara' },
      { id: 'A3', label: 'Kondisi Radiator & Coolant' },
      { id: 'A4', label: 'Kondisi Fan Belt / V-Belt' },
      { id: 'A5', label: 'Mounting Mesin' },
      { id: 'A6', label: 'Kebocoran Oli / Cairan' },
      { id: 'A7', label: 'Suara Mesin Abnormal' },
      { id: 'A8', label: 'Idle RPM / Stabilitas Mesin' },
      { id: 'A9', label: 'Cek Kondisi Filter AC' },
      { id: 'A10', label: 'Oli Transmisi (matic/manual) — level & kondisi' }
    ]
  },
  {
    id: 'B',
    name: 'Kelistrikan (Electrical)',
    icon: 'zap',
    items: [
      { id: 'B1', label: 'Kondisi Aki / Baterai (voltase, terminal)' },
      { id: 'B2', label: 'Alternator / Pengisian' },
      { id: 'B4', label: 'Lampu Utama (dekat & jauh)' },
      { id: 'B5', label: 'Lampu Sein / Hazard' },
      { id: 'B6', label: 'Lampu Rem' },
      { id: 'B7', label: 'Lampu Mundur' },
      { id: 'B8', label: 'Lampu Dashboard / Indikator' },
      { id: 'B9', label: 'Wiper & Washer' }
    ]
  },
  {
    id: 'C',
    name: 'Kaki-Kaki (Suspension & Steering)',
    icon: 'disc',
    items: [
      { id: 'C1', label: 'Shock Absorber Depan' },
      { id: 'C2', label: 'Shock Absorber Belakang' },
      { id: 'C3', label: 'Ball Joint' },
      { id: 'C4', label: 'Tie Rod & Tie Rod End' },
      { id: 'C5', label: 'Rack Steer / Steering Rack' },
      { id: 'C6', label: 'Long Tie Rod / Drag Link' },
      { id: 'C7', label: 'Bushing-bushing Arm' },
      { id: 'C8', label: 'Stabilizer Link & Bushing' },
      { id: 'C9', label: 'CV Joint / Boot Karet' },
      { id: 'C10', label: 'Bearing Roda' },
      { id: 'C11', label: 'Per / Spring (depan & belakang)' }
    ]
  },
  {
    id: 'D',
    name: 'Rem (Brake System)',
    icon: 'octagon',
    items: [
      { id: 'D1', label: 'Kampas Rem Depan' },
      { id: 'D2', label: 'Kampas Rem Belakang' },
      { id: 'D3', label: 'Disc / Piringan Rem Depan' },
      { id: 'D4', label: 'Disc / Drum Rem Belakang' },
      { id: 'D5', label: 'Selang Rem' },
      { id: 'D6', label: 'Master Rem' },
      { id: 'D7', label: 'Minyak Rem (level & kondisi)' }
    ]
  },
  {
    id: 'E',
    name: 'Ban & Velg (Tires & Wheels)',
    icon: 'circle',
    items: [
      { id: 'E1', label: 'Ban Depan Kiri (Tahun Produksi, Kondisi)' },
      { id: 'E2', label: 'Ban Depan Kanan' },
      { id: 'E3', label: 'Ban Belakang Kiri' },
      { id: 'E4', label: 'Ban Belakang Kanan' },
      { id: 'E5', label: 'Kondisi Velg (retak, peyang, aus)' },
      { id: 'E6', label: 'Tekanan Angin Ban' }
    ]
  }
];

// ─── Summary Fields ──────────────────────────────────────────────────
const SUMMARY_FIELDS = [
  { id: 'summaryCondition', label: 'Kondisi Umum Kendaraan', type: 'textarea', placeholder: 'Deskripsikan kondisi umum kendaraan...' },
  { id: 'summaryRecommend', label: 'Rekomendasi Perbaikan', type: 'textarea', placeholder: 'Tuliskan rekomendasi perbaikan untuk customer...' },
  { id: 'summaryNotes', label: 'Catatan Tambahan', type: 'textarea', placeholder: 'Catatan lain jika ada...' }
];

// ─── Max photos per inspection item ──────────────────────────────────
const MAX_PHOTOS_PER_ITEM = 2;
