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

  if (!supabaseClient) {
    console.error("Supabase tidak tersedia!");
    _cache.report = createEmptyReport();
    return _cache.report;
  }

  try {
    const user = getCurrentUser();
    const username = user ? user.username : '';

    // Cari report yang isCurrent = true untuk user ini
    let query = supabaseClient
      .from('reports')
      .select('*')
      .eq('isCurrent', true);
    
    // Filter by username if column exists (graceful fallback)
    if (username) {
      query = query.eq('username', username);
    }

    let { data: reports, error } = await query.limit(1);

    let report = reports && reports.length > 0 ? reports[0] : null;

    if (!report || error) {
      // Buat report baru dengan username dan auto-fill fields
      const newReportData = {
        isCurrent: true,
        inspections: createEmptyReport().inspections,
        customer: {
          mechanicName: user ? user.displayName : '',
          inspectionDate: new Date().toISOString().split('T')[0]
        }
      };
      // Try to include username (column might not exist yet)
      if (username) newReportData.username = username;

      const { data: newReport, error: insertError } = await supabaseClient
        .from('reports')
        .insert([newReportData])
        .select()
        .single();
        
      if (insertError) {
        // If username column doesn't exist, retry without it
        if (insertError.code === '42703') {
          console.warn('[Storage] username column not found, creating report without it');
          delete newReportData.username;
          const { data: fallbackReport, error: fallbackError } = await supabaseClient
            .from('reports')
            .insert([newReportData])
            .select()
            .single();
          if (fallbackError) throw fallbackError;
          report = fallbackReport;
        } else {
          throw insertError;
        }
      } else {
        report = newReport;
      }
    }
    
    _currentReportId = report.id;
    
    // Ensure inspections structure exists
    if (!report.inspections || Object.keys(report.inspections).length === 0) {
      report.inspections = createEmptyReport().inspections;
      _cache.report = report;
      _flushToBackend();
    }

    // Auto-fill mechanicName and inspectionDate if missing
    if (!report.customer) report.customer = {};
    const user2 = getCurrentUser();
    if (!report.customer.mechanicName && user2) {
      report.customer.mechanicName = user2.displayName;
    }
    if (!report.customer.inspectionDate) {
      report.customer.inspectionDate = new Date().toISOString().split('T')[0];
    }
    
    _cache.report = report;
    return _cache.report;
  } catch (err) {
    console.error('[Storage] Failed to load report from API:', err);
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
  if (!_currentReportId || !_cache.report || !supabaseClient) return;

  try {
    const { error } = await supabaseClient
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

    if (!supabaseClient) throw new Error("Supabase is not initialized");

    const user = getCurrentUser();
    const username = user ? user.username : '';

    // Deactivate old current reports (only for this user)
    let deactivateQuery = supabaseClient
      .from('reports')
      .update({ isCurrent: false })
      .eq('isCurrent', true);
    
    if (username) {
      deactivateQuery = deactivateQuery.eq('username', username);
    }
    await deactivateQuery;

    // Create new report with user info
    const newReportData = {
      isCurrent: true,
      inspections: createEmptyReport().inspections,
      customer: {
        mechanicName: user ? user.displayName : '',
        inspectionDate: new Date().toISOString().split('T')[0]
      }
    };
    if (username) newReportData.username = username;

    const { data: newReport, error } = await supabaseClient
      .from('reports')
      .insert([newReportData])
      .select()
      .single();

    if (error) {
      // Fallback if username column doesn't exist
      if (error.code === '42703') {
        delete newReportData.username;
        const { data: fb, error: fbErr } = await supabaseClient
          .from('reports')
          .insert([newReportData])
          .select()
          .single();
        if (fbErr) throw fbErr;
        _currentReportId = fb.id;
        _cache.report = fb;
        return _cache.report;
      }
      throw error;
    }

    _currentReportId = newReport.id;
    _cache.report = newReport;

    return _cache.report;
  } catch (err) {
    console.error('[Storage] Failed to reset report:', err);
    showToast('Gagal mereset report. Periksa koneksi server.', 'danger');
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
  return !!sessionStorage.getItem('cir_username');
}

/**
 * Get the currently logged-in user.
 * @returns {{ username: string, displayName: string } | null}
 */
function getCurrentUser() {
  const username = sessionStorage.getItem('cir_username');
  const displayName = sessionStorage.getItem('cir_displayName');
  if (!username) return null;
  return { username, displayName: displayName || username };
}

function setLoggedIn(val, username, displayName) {
  if (val) {
    sessionStorage.setItem(STORAGE_KEYS.SESSION, 'true');
    sessionStorage.setItem('cir_username', username || '');
    sessionStorage.setItem('cir_displayName', displayName || username || '');
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    sessionStorage.removeItem('cir_username');
    sessionStorage.removeItem('cir_displayName');
  }
}

function authenticate(username, password) {
  const match = AUTH_CREDENTIALS.find(
    acc => acc.username === username && acc.password === password
  );
  if (match) {
    setLoggedIn(true, match.username, match.displayName || match.username);
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
