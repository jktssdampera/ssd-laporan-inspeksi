/**
 * storage.js
 * API-backed storage with in-memory cache for workshop info,
 * current report data, and login session management.
 * 
 * Report data: stored in MongoDB via backend API
 * Workshop info: still in localStorage (rarely changes)
 * Theme/Session: still in localStorage/sessionStorage
 */

const STORAGE_KEYS = {
  WORKSHOP: 'cir_workshop_info',
  SESSION: 'cir_session',
  THEME: 'cir_theme'
};

// Backend API base URL (auto-detect based on current hostname)
const API_BASE = ''; // NGINX reverse proxies /api/

// ─── In-memory cache (cache-first pattern) ───────────────────────────
let _cache = {
  workshop: null,
  report: null
};

// Current report MongoDB _id
let _currentReportId = null;

// Debounce timer for write-behind saves
let _saveTimer = null;
const SAVE_DEBOUNCE_MS = 1000;

// ─── Theme Management ──────────────────────────────────────────────────

function getTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  } catch (e) {
    return 'dark';
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (e) {
    console.warn('[Storage] Failed to save theme');
  }
}

// ─── Utility ─────────────────────────────────────────────────────────

function safeJSONParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function safeJSONStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    console.error('[Storage] Failed to stringify data');
    return null;
  }
}

// ─── Workshop Info (still localStorage) ──────────────────────────────

function loadWorkshopInfo() {
  if (_cache.workshop) return _cache.workshop;

  const stored = localStorage.getItem(STORAGE_KEYS.WORKSHOP);
  if (stored) {
    _cache.workshop = safeJSONParse(stored);
    return _cache.workshop;
  }

  // First time — use defaults from form-data.js
  _cache.workshop = { ...DEFAULT_WORKSHOP };
  saveWorkshopInfo(_cache.workshop);
  return _cache.workshop;
}

function saveWorkshopInfo(data) {
  _cache.workshop = data;
  const json = safeJSONStringify(data);
  if (json) {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSHOP, json);
    } catch (e) {
      console.error('[Storage] Failed to save workshop info:', e);
    }
  }
}

// ─── Current Report (MongoDB via API) ────────────────────────────────

function createEmptyReport() {
  const inspections = {};
  INSPECTION_CATEGORIES.forEach(cat => {
    inspections[cat.id] = {};
    cat.items.forEach(item => {
      inspections[cat.id][item.id] = {
        status: 'unchecked',
        note: '',
        photos: []
      };
    });
  });

  return {
    customer: {},
    inspections: inspections,
    summary: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Load report from backend API (async).
 * Uses cache-first: if cache exists, return immediately.
 * On first call, fetches from MongoDB.
 */
async function loadReport() {
  if (_cache.report) return _cache.report;

  if (!window.supabase) {
    console.error("Supabase tidak tersedia!");
    _cache.report = createEmptyReport();
    return _cache.report;
  }

  try {
    // Cari report yang isCurrent = true
    let { data: reports, error } = await window.supabase
      .from('reports')
      .select('*')
      .eq('isCurrent', true)
      .limit(1);

    let report = reports && reports.length > 0 ? reports[0] : null;

    if (!report || error) {
      // Jika tidak ada, buat baru
      const { data: newReport, error: insertError } = await window.supabase
        .from('reports')
        .insert([{ isCurrent: true, inspections: createEmptyReport().inspections }])
        .select()
        .single();
        
      if (insertError) throw insertError;
      report = newReport;
    }
    
    _currentReportId = report.id;
    
    // Ensure inspections structure exists (new reports from DB may be empty)
    if (!report.inspections || Object.keys(report.inspections).length === 0) {
      report.inspections = createEmptyReport().inspections;
      // Persist the initial structure
      _cache.report = report;
      _flushToBackend();
    }
    
    _cache.report = report;
    return _cache.report;
  } catch (err) {
    console.error('[Storage] Failed to load report from API:', err);
    // Fallback: create an empty report in memory
    _cache.report = createEmptyReport();
    return _cache.report;
  }
}

/**
 * Synchronous version for code that can't be async.
 * Returns cached report. Must call loadReport() at least once before this.
 */
function loadReportSync() {
  if (_cache.report) return _cache.report;
  // If somehow called before async load, return empty
  console.warn('[Storage] loadReportSync called before async load. Returning empty report.');
  _cache.report = createEmptyReport();
  return _cache.report;
}

/**
 * Save report: update cache immediately, then debounce-flush to backend.
 */
function saveReport(data) {
  if (!data) return;
  data.updatedAt = new Date().toISOString();
  _cache.report = data;

  // Debounced write-behind to MongoDB
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _flushToBackend(), SAVE_DEBOUNCE_MS);
}

/**
 * Flush cached report to backend via PATCH.
 */
async function _flushToBackend() {
  if (!_currentReportId || !_cache.report || !window.supabase) return;

  try {
    const { error } = await window.supabase
      .from('reports')
      .update({
        customer: _cache.report.customer,
        inspections: _cache.report.inspections,
        summary: _cache.report.summary,
        updatedAt: new Date().toISOString()
      })
      .eq('id', _currentReportId);

    if (error) {
      console.error('[Storage] Failed to save report to backend', error);
      throw error;
    }
  } catch (err) {
    console.error('[Storage] Network error saving report:', err);
    showToast('Gagal menyimpan ke server. Periksa koneksi.', 'danger');
  }
}

/**
 * Force immediate flush (useful before PDF generation).
 */
async function flushReportNow() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  await _flushToBackend();
}

function updateReportField(path, value) {
  const report = loadReportSync();
  const keys = path.split('.');
  let obj = report;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;

  saveReport(report);
  return report;
}

/**
 * Reset report: create new in MongoDB, deactivate old one.
 */
async function resetReport() {
  try {
    // Flush any pending changes first
    await flushReportNow();

    if (!window.supabase) throw new Error("Supabase is not initialized");

    // Deactivate old current reports
    await window.supabase
      .from('reports')
      .update({ isCurrent: false })
      .eq('isCurrent', true);

    // Create new report
    const { data: newReport, error } = await window.supabase
      .from('reports')
      .insert([{ isCurrent: true, inspections: createEmptyReport().inspections }])
      .select()
      .single();

    if (error) throw error;

    _currentReportId = newReport.id;
    _cache.report = newReport;

    return _cache.report;
  } catch (err) {
    console.error('[Storage] Failed to reset report:', err);
    showToast('Gagal mereset report. Periksa koneksi server.', 'danger');
    // Fallback to local reset
    _cache.report = createEmptyReport();
    return _cache.report;
  }
}

/**
 * Get the current report's MongoDB _id.
 */
function getReportId() {
  return _currentReportId;
}

// ─── Login Session ───────────────────────────────────────────────────

function isLoggedIn() {
  return sessionStorage.getItem(STORAGE_KEYS.SESSION) === 'true';
}

function setLoggedIn(val) {
  if (val) {
    sessionStorage.setItem(STORAGE_KEYS.SESSION, 'true');
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
  }
}

function authenticate(username, password) {
  const match = AUTH_CREDENTIALS.some(
    acc => acc.username === username && acc.password === password
  );
  if (match) {
    setLoggedIn(true);
    return true;
  }
  return false;
}

function logout() {
  setLoggedIn(false);
}

// ─── Derived State Helpers ───────────────────────────────────────────

function getInspectionStats() {
  const report = loadReportSync();
  const stats = { good: 0, warning: 0, danger: 0, unchecked: 0, total: 0 };

  INSPECTION_CATEGORIES.forEach(cat => {
    cat.items.forEach(item => {
      const data = report.inspections && report.inspections[cat.id] ? report.inspections[cat.id][item.id] : undefined;
      const status = (data && data.status) ? data.status : 'unchecked';
      stats[status]++;
      stats.total++;
    });
  });

  return stats;
}

function getCategoryStats(categoryId) {
  const report = loadReportSync();
  const stats = { good: 0, warning: 0, danger: 0, unchecked: 0, total: 0 };
  const catData = report.inspections ? report.inspections[categoryId] : undefined;

  if (catData) {
    Object.values(catData).forEach(item => {
      const status = item.status || 'unchecked';
      stats[status]++;
      stats.total++;
    });
  }

  return stats;
}
