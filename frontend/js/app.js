/**
 * app.js
 * Entry point & orchestrator.
 * Initializes all modules, manages login flow, and wires up events.
 */

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Init Theme
  initTheme();

  // Init Login Mode Switcher
  initLoginModeSwitcher();

  // Check login state
  if (isLoggedIn()) {
    showAppView();
    bootstrapApp();
  } else {
    showLoginView();
  }

  // Login form handler
  initLoginForm();
}

// ─── Login Mode Switcher ─────────────────────────────────────────────

function initLoginModeSwitcher() {
  const tabs = document.querySelectorAll('.mode-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      selectLoginMode(mode);
    });
  });

  // Initialize with active mode (default SIK)
  const currentMode = (typeof getActiveSystemMode === 'function') ? getActiveSystemMode() : 'SIK';
  selectLoginMode(currentMode);
}

function selectLoginMode(mode) {
  const tabs = document.querySelectorAll('.mode-tab');
  const loginView = document.getElementById('login-view');
  const systemTitle = document.getElementById('login-system-title');

  tabs.forEach(t => {
    const isActive = t.dataset.mode === mode;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  if (mode === 'BHD') {
    if (loginView) loginView.classList.add('bhd-mode');
    if (systemTitle) systemTitle.textContent = 'Sistem Inspeksi BHD (Battery Home Delivery)';
  } else {
    if (loginView) loginView.classList.remove('bhd-mode');
    if (systemTitle) systemTitle.textContent = 'Sistem Inspeksi Kendaraan';
  }

  if (typeof setActiveSystemMode === 'function') {
    setActiveSystemMode(mode);
  }

  if (window.lucide) lucide.createIcons();
}

// ─── Login ───────────────────────────────────────────────────────────

function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      errorEl.textContent = 'Username dan password harus diisi.';
      errorEl.classList.add('visible');
      return;
    }

    if (authenticate(username, password)) {
      errorEl.classList.remove('visible');
      showAppView();
      bootstrapApp();
    } else {
      errorEl.textContent = 'Username atau password salah.';
      errorEl.classList.add('visible');
      // Shake animation
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 500);
    }
  });

  // Password visibility toggle
  const toggleBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('login-password');
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      toggleBtn.setAttribute('aria-label', type === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
      // Update icon
      const icon = toggleBtn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
        if (window.lucide) lucide.createIcons({ nodes: [toggleBtn] });
      }
    });
  }
}

// ─── Bootstrap App ───────────────────────────────────────────────────

async function bootstrapApp() {
  const activeMode = (typeof getActiveSystemMode === 'function') ? getActiveSystemMode() : 'SIK';
  
  // Apply theme class to body
  if (activeMode === 'BHD') {
    document.body.classList.add('bhd-theme');
  } else {
    document.body.classList.remove('bhd-theme');
  }

  // Update sidebar brand title
  const sidebarTitle = document.getElementById('sidebar-system-title');
  if (sidebarTitle) {
    sidebarTitle.textContent = activeMode === 'BHD' ? 'Inspeksi BHD' : 'Inspeksi Kendaraan';
  }

  // Render dynamic sidebar inspection links
  renderSidebarLinks();

  // Load report from MongoDB / Supabase (async)
  await loadReport();

  // Load & render workshop header
  const workshop = loadWorkshopInfo();
  
  // Force update logo path to the configured default logo (Assets/logo.png)
  if (workshop.logo !== DEFAULT_WORKSHOP.logo) {
    workshop.logo = DEFAULT_WORKSHOP.logo;
    saveWorkshopInfo(workshop);
  }

  renderWorkshopHeader();

  // Render customer form
  renderCustomerForm();

  // Render inspection forms
  renderInspectionForms();

  // Initialize inspection events (status, notes, photos)
  initInspectionEvents();

  // Render summary form
  renderSummaryForm();

  // Initialize sidebar navigation
  initSidebarNav();
  initMobileSidebar();

  // Initialize progress bar
  if (typeof updateProgressBar === 'function') {
    updateProgressBar();
  }

  // Initialize Lucide icons
  if (window.lucide) lucide.createIcons();

  // Wire up global actions
  initGlobalActions();
}

function renderSidebarLinks() {
  const container = document.getElementById('sidebar-inspection-links');
  if (!container) return;

  const categories = (typeof getActiveCategories === 'function') ? getActiveCategories() : INSPECTION_CATEGORIES;
  container.innerHTML = categories.map(cat => `
    <a href="#category-${cat.id}" class="sidebar-link">
      <i data-lucide="${cat.icon}"></i> ${cat.id}. ${cat.name.split('(')[0].trim()}
    </a>
  `).join('');

  if (window.lucide) lucide.createIcons({ nodes: [container] });
}

// ─── Workshop Header ─────────────────────────────────────────────────

function renderWorkshopHeader() {
  const workshop = loadWorkshopInfo();
  const container = document.getElementById('workshop-header-info');
  if (!container) return;

  const logoEl = document.getElementById('workshop-logo');
  if (logoEl) logoEl.src = workshop.logo;

  const nameEl = document.getElementById('workshop-name');
  if (nameEl) nameEl.textContent = workshop.name;

  const detailEl = document.getElementById('workshop-details');
  if (detailEl) {
    detailEl.innerHTML = `
      <p>${workshop.address}</p>
      <p>
        <i data-lucide="phone" class="inline-icon"></i> ${workshop.phone}
        <span class="separator">|</span>
        <i data-lucide="message-circle" class="inline-icon"></i> WA: ${workshop.whatsapp}
      </p>
      <p>
        <i data-lucide="mail" class="inline-icon"></i> ${workshop.email}
      </p>
    `;
    if (window.lucide) lucide.createIcons({ nodes: [detailEl] });
  }
}

// ─── Global Actions ──────────────────────────────────────────────────

function initGlobalActions() {
  // Download PDF
  const pdfBtn = document.getElementById('btn-download-pdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => generatePDF());
  }

  // Save to Nextcloud / Komputer
  const nextcloudBtn = document.getElementById('btn-save-nextcloud');
  if (nextcloudBtn) {
    nextcloudBtn.addEventListener('click', () => saveToNextcloudOnly());
  }

  // Preview PDF
  const previewBtn = document.getElementById('btn-preview-pdf');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => showPDFPreview());
  }

  // Close Preview
  const closePreviewBtn = document.getElementById('btn-close-preview');
  if (closePreviewBtn) {
    closePreviewBtn.addEventListener('click', () => hidePDFPreview());
  }

  // Download from Preview
  const previewDownloadBtn = document.getElementById('btn-preview-download');
  if (previewDownloadBtn) {
    previewDownloadBtn.addEventListener('click', () => {
      hidePDFPreview();
      generatePDF();
    });
  }

  // Reset Report
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      showConfirmModal(
        'Reset Report',
        'Semua data inspeksi akan dihapus dan form akan dikosongkan. Lanjutkan?',
        async () => {
          await resetReport();
          await bootstrapApp();
          showToast('Report berhasil direset.', 'info');
        }
      );
    });
  }

  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      showLoginView();
      selectLoginMode('SIK');
      showToast('Berhasil logout.', 'info');
    });
  }
}
