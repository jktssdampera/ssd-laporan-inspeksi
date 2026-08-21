/**
 * ui.js
 * UI interactions: accordion, toast notifications, sidebar nav,
 * modal dialogs, and login/logout view toggling.
 */

// ─── Accordion ───────────────────────────────────────────────────────

function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => toggleAccordion(header));
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAccordion(header);
      }
    });
  });
}

function toggleAccordion(header) {
  const content = header.nextElementSibling;
  const isOpen = header.classList.contains('accordion-open');

  if (isOpen) {
    // Set explicit pixel height before collapsing to allow CSS transition
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.overflow = 'hidden';
    // Force reflow
    void content.offsetHeight;
    content.style.maxHeight = '0';
    header.classList.remove('accordion-open');
    header.setAttribute('aria-expanded', 'false');
  } else {
    content.style.maxHeight = content.scrollHeight + 'px';
    header.classList.add('accordion-open');
    header.setAttribute('aria-expanded', 'true');

    // After animation finishes, release height restriction so it expands/shrinks dynamically
    setTimeout(() => {
      if (header.classList.contains('accordion-open')) {
        content.style.maxHeight = 'none';
        content.style.overflow = 'visible';
      }
    }, 350);
  }
}

function openAccordion(header) {
  const content = header.nextElementSibling;
  header.classList.add('accordion-open');
  header.setAttribute('aria-expanded', 'true');
  content.style.maxHeight = 'none';
  content.style.overflow = 'visible';
}

function recalcAccordionHeight(categoryId) {
  const header = document.querySelector(`[data-category="${categoryId}"]`);
  if (header && header.classList.contains('accordion-open')) {
    const content = header.nextElementSibling;
    content.style.maxHeight = 'none';
    content.style.overflow = 'visible';
  }
}

// ─── Toast Notification ──────────────────────────────────────────────

let _toastTimeout = null;

function showToast(message, type = 'good') {
  // Remove existing
  const existing = document.getElementById('toast-notification');
  if (existing) existing.remove();
  if (_toastTimeout) clearTimeout(_toastTimeout);

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const iconMap = {
    good: 'check-circle',
    warning: 'alert-triangle',
    danger: 'x-circle',
    info: 'info'
  };

  toast.innerHTML = `
    <i data-lucide="${iconMap[type] || 'info'}"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons({ nodes: [toast] });

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Auto dismiss
  _toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Sidebar Navigation ─────────────────────────────────────────────

function initSidebarNav() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Update active state
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  });

  // Scroll spy
  initScrollSpy();
}

function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        document.querySelectorAll('.sidebar-link').forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-20% 0px -60% 0px' });

  sections.forEach(section => observer.observe(section));
}

// ─── Confirm Modal ───────────────────────────────────────────────────

function showConfirmModal(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'confirm-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML = `
    <div class="modal-content">
      <h3 class="modal-title">${title}</h3>
      <p class="modal-message">${message}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">Batal</button>
        <button type="button" class="btn btn-danger modal-confirm">Ya, Lanjutkan</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Focus first button
  const confirmBtn = overlay.querySelector('.modal-confirm');
  const cancelBtn = overlay.querySelector('.modal-cancel');
  cancelBtn.focus();

  function closeModal() {
    overlay.classList.remove('modal-visible');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 200);
  }

  cancelBtn.addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', () => {
    closeModal();
    if (onConfirm) onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  requestAnimationFrame(() => overlay.classList.add('modal-visible'));
}

// ─── Login / App View Toggle ─────────────────────────────────────────

function showLoginView() {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  if (loginView) loginView.classList.remove('hidden');
  if (appView) appView.classList.add('hidden');
}

function showAppView() {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  if (loginView) loginView.classList.add('hidden');
  if (appView) appView.classList.remove('hidden');
}

// ─── Mobile Sidebar Toggle ──────────────────────────────────────────

function initMobileSidebar() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar-nav');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar-open');
      const isOpen = sidebar.classList.contains('sidebar-open');
      toggleBtn.setAttribute('aria-expanded', isOpen);
    });

    // Close sidebar when a link is clicked (mobile)
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          sidebar.classList.remove('sidebar-open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }
}

// ─── Theme Toggle ──────────────────────────────────────────────────────

function initTheme() {
  const currentTheme = getTheme();
  applyTheme(currentTheme);

  const toggleBtn = document.getElementById('btn-toggle-theme');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light-theme');
      const newTheme = isLight ? 'dark' : 'light';
      applyTheme(newTheme);
      saveTheme(newTheme);
    });
  }
}

function applyTheme(theme) {
  const toggleBtn = document.getElementById('btn-toggle-theme');
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    if (toggleBtn) toggleBtn.innerHTML = '<i data-lucide="moon"></i> Dark Mode';
  } else {
    document.body.classList.remove('light-theme');
    if (toggleBtn) toggleBtn.innerHTML = '<i data-lucide="sun"></i> Light Mode';
  }

  if (window.lucide && toggleBtn) {
    lucide.createIcons({ nodes: [toggleBtn] });
  }
}
