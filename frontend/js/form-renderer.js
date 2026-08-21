/**
 * form-renderer.js
 * Dynamically renders all inspection forms from form-data.js.
 * Renders customer fields, inspection categories with accordion,
 * status radio buttons, notes, photo slots, and summary fields.
 */

// ─── Render Customer Form ────────────────────────────────────────────

function renderCustomerForm() {
  const container = document.getElementById('customer-fields');
  if (!container) return;

  const report = loadReportSync();
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

  container.innerHTML = CUSTOMER_FIELDS.map(field => {
    let value = (report.customer && report.customer[field.id]) ? report.customer[field.id] : '';

    // Auto-fill logic
    if (field.id === 'inspectionDate' && !value) {
      value = new Date().toISOString().split('T')[0];
      if (typeof updateReportField === 'function') {
        updateReportField('customer.inspectionDate', value);
      }
    }
    if (field.id === 'mechanicName' && (!value || value === '-')) {
      if (user && user.displayName) {
        value = user.displayName;
        if (typeof updateReportField === 'function') {
          updateReportField('customer.mechanicName', value);
        }
      }
    }

    const isReadOnly = (field.id === 'mechanicName' || field.id === 'inspectionDate');

    return `
      <div class="form-group">
        <label for="${field.id}" class="form-label">
          ${field.label}${field.required ? ' <span class="required">*</span>' : ''}
        </label>
        <input type="${field.type}" id="${field.id}" name="${field.id}"
               class="form-input" placeholder="${field.placeholder}"
               value="${value}"
               ${isReadOnly ? 'readonly style="opacity: 0.85; cursor: default;"' : ''}
               ${field.required ? 'required' : ''}>
      </div>
    `;
  }).join('');

  // Bind change events
  container.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('change', () => {
      updateReportField(`customer.${input.id}`, input.value);
    });
    input.addEventListener('input', debounce(() => {
      updateReportField(`customer.${input.id}`, input.value);
    }, 500));
  });
}

// ─── Render Inspection Categories ────────────────────────────────────

function renderInspectionForms() {
  const container = document.getElementById('inspection-categories');
  if (!container) return;

  container.innerHTML = INSPECTION_CATEGORIES.map(cat => {
    const stats = getCategoryStats(cat.id);
    return `
      <div class="accordion-section" id="category-${cat.id}">
        <button type="button" class="accordion-header" 
                data-category="${cat.id}"
                aria-expanded="false"
                aria-controls="accordion-body-${cat.id}">
          <div class="accordion-header-left">
            <i data-lucide="${cat.icon}" class="accordion-icon"></i>
            <span class="accordion-title">${cat.id}. ${cat.name}</span>
            <span class="accordion-badge">${cat.items.length} item</span>
          </div>
          <div class="accordion-header-right">
            ${renderCategoryBadges(stats)}
            <i data-lucide="chevron-down" class="accordion-chevron"></i>
          </div>
        </button>
        <div class="accordion-body" id="accordion-body-${cat.id}">
          <div class="inspection-items">
            ${cat.items.map(item => renderInspectionItem(cat.id, item)).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Initialize accordion behavior
  initAccordions();

  // Initialize Lucide icons
  if (window.lucide) lucide.createIcons();
}

function renderCategoryBadges(stats) {
  let html = '';
  if (stats.good > 0) html += `<span class="stat-badge stat-good">${stats.good}</span>`;
  if (stats.warning > 0) html += `<span class="stat-badge stat-warning">${stats.warning}</span>`;
  if (stats.danger > 0) html += `<span class="stat-badge stat-danger">${stats.danger}</span>`;
  return html;
}

// ─── Render Single Inspection Item ───────────────────────────────────

function renderInspectionItem(categoryId, item) {
  const report = loadReportSync();
  const catData = report.inspections && report.inspections[categoryId] ? report.inspections[categoryId] : null;
  const data = (catData && catData[item.id]) ? catData[item.id] : { status: 'unchecked', note: '', photos: [] };
  const hasPhotos = data.photos && data.photos.length > 0 && data.photos.some(p => p !== null);
  const statusOptions = item.customStatusOptions || STATUS_OPTIONS;

  return `
    <div class="inspection-item" id="item-${item.id}" data-item-id="${item.id}">
      <div class="item-header">
        <span class="item-code">${item.id}</span>
        <span class="item-label">${item.label}</span>
      </div>
      
      <div class="item-controls">
        <div class="status-group" role="radiogroup" aria-label="Status ${item.label}">
          ${statusOptions.map(opt => `
            <label class="status-radio ${opt.colorClass} ${data.status === opt.value ? 'selected' : ''}"
                   tabindex="0" role="radio" aria-checked="${data.status === opt.value}">
              <input type="radio" name="status-${item.id}" value="${opt.value}"
                     ${data.status === opt.value ? 'checked' : ''}
                     class="sr-only">
              <i data-lucide="${opt.icon}" class="status-icon"></i>
              <span class="status-label">${opt.label}</span>
            </label>
          `).join('')}
        </div>

        ${item.hasBatteryHealth ? `
        <div class="battery-health-wrapper">
          <label for="battery-health-${item.id}" class="battery-health-label">
            <i data-lucide="zap" class="inline-icon" style="color: var(--color-accent);"></i> Health Battery (SOH)
          </label>
          <div class="battery-health-input-group">
            <input type="number" id="battery-health-${item.id}" class="battery-health-input"
                   min="0" max="100" placeholder="0-100"
                   value="${escapeHtml(data.batteryHealth || '')}">
            <span class="battery-health-unit">%</span>
          </div>
        </div>
        ` : ''}
        
        <div class="item-note-wrapper">
          <label for="note-${item.id}" class="sr-only">Catatan untuk ${item.label}</label>
          <input type="text" id="note-${item.id}" class="item-note-input"
                 placeholder="Catatan..." value="${escapeHtml(data.note || '')}">
        </div>

        <button type="button" class="btn-toggle-photo" aria-expanded="${hasPhotos ? 'true' : 'false'}"
                aria-controls="photos-${item.id}" onclick="togglePhotos('${item.id}')">
          <i data-lucide="camera" class="inline-icon"></i>
          <span>${hasPhotos ? 'Sembunyikan Foto' : 'Lampirkan Foto'}</span>
        </button>
        
        <div class="item-photos ${hasPhotos ? '' : 'hidden'}" id="photos-${item.id}">
          <!-- Photo slots rendered by JS -->
        </div>
      </div>
    </div>
  `;
}

// ─── Photo Toggle Handler ────────────────────────────────────────────

window.togglePhotos = function(itemId) {
  const container = document.getElementById(`photos-${itemId}`);
  const btn = document.querySelector(`button[aria-controls="photos-${itemId}"]`);
  
  if (container && btn) {
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.querySelector('span').textContent = 'Sembunyikan Foto';
    } else {
      container.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      btn.querySelector('span').textContent = 'Lampirkan Foto';
    }
  }
};

// ─── Initialize Inspection Item Events ───────────────────────────────

function initInspectionEvents() {
  // Status radio buttons
  document.querySelectorAll('.status-radio').forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    
    label.addEventListener('click', () => {
      handleStatusChange(radio);
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        radio.checked = true;
        handleStatusChange(radio);
      }
    });
  });

  // Battery health inputs
  document.querySelectorAll('.battery-health-input').forEach(input => {
    input.addEventListener('input', debounce(() => {
      const itemId = input.id.replace('battery-health-', '');
      const catId = itemId.charAt(0);
      updateReportField(`inspections.${catId}.${itemId}.batteryHealth`, input.value);
    }, 400));
  });

  // Note inputs
  document.querySelectorAll('.item-note-input').forEach(input => {
    input.addEventListener('input', debounce(() => {
      const itemId = input.id.replace('note-', '');
      const catId = itemId.charAt(0);
      updateReportField(`inspections.${catId}.${itemId}.note`, input.value);
    }, 500));
  });

  // Photo slots
  INSPECTION_CATEGORIES.forEach(cat => {
    cat.items.forEach(item => {
      const photosContainer = document.getElementById(`photos-${item.id}`);
      if (photosContainer) {
        const report = loadReportSync();
        const catData = report.inspections && report.inspections[cat.id] ? report.inspections[cat.id] : null;
        const photos = (catData && catData[item.id] && catData[item.id].photos) ? catData[item.id].photos : [];

        for (let i = 0; i < MAX_PHOTOS_PER_ITEM; i++) {
          const slot = createPhotoSlot(item.id, i, photos[i] || null);
          photosContainer.appendChild(slot);
        }
      }
    });
  });
}

function handleStatusChange(radio) {
  if (!radio) return;
  radio.checked = true;
  
  const name = radio.name;
  const itemId = name.replace('status-', '');
  const catId = itemId.charAt(0);
  const value = radio.value;

  // Update visual state
  const group = radio.closest('.status-group');
  group.querySelectorAll('.status-radio').forEach(label => {
    const r = label.querySelector('input');
    label.classList.toggle('selected', r.value === value);
    label.setAttribute('aria-checked', r.value === value);
  });

  // Update item visual indicator
  const itemEl = document.getElementById(`item-${itemId}`);
  if (itemEl) {
    itemEl.className = 'inspection-item';
    itemEl.classList.add(`item-${value}`);
  }

  // Save to storage
  updateReportField(`inspections.${catId}.${itemId}.status`, value);

  // Update category badge
  updateCategoryBadge(catId);

  // Update progress bar
  if (typeof updateProgressBar === 'function') {
    updateProgressBar();
  }
}

function updateCategoryBadge(categoryId) {
  const stats = getCategoryStats(categoryId);
  const header = document.querySelector(`[data-category="${categoryId}"]`);
  if (header) {
    const rightSection = header.querySelector('.accordion-header-right');
    const chevron = rightSection.querySelector('.accordion-chevron');
    // Remove old badges
    rightSection.querySelectorAll('.stat-badge').forEach(b => b.remove());
    // Insert new badges before chevron
    const badgeHtml = renderCategoryBadges(stats);
    chevron.insertAdjacentHTML('beforebegin', badgeHtml);
  }
}

// ─── Render Summary Form ─────────────────────────────────────────────

function renderSummaryForm() {
  const container = document.getElementById('summary-fields');
  if (!container) return;

  const report = loadReportSync();

  container.innerHTML = SUMMARY_FIELDS.map(field => {
    const value = (report.summary && report.summary[field.id]) ? report.summary[field.id] : '';
    
    if (field.type === 'textarea') {
      return `
        <div class="form-group form-group-full">
          <label for="${field.id}" class="form-label">${field.label}</label>
          <textarea id="${field.id}" name="${field.id}" class="form-textarea"
                    placeholder="${field.placeholder}" rows="4">${escapeHtml(value)}</textarea>
        </div>
      `;
    }
    return `
      <div class="form-group">
        <label for="${field.id}" class="form-label">${field.label}</label>
        <input type="${field.type}" id="${field.id}" name="${field.id}"
               class="form-input" placeholder="${field.placeholder}"
               value="${escapeHtml(String(value))}">
      </div>
    `;
  }).join('');

  // Bind events
  container.querySelectorAll('.form-input, .form-textarea').forEach(input => {
    input.addEventListener('input', debounce(() => {
      updateReportField(`summary.${input.id}`, input.value);
    }, 500));
  });
}

// ─── Progress Bar ────────────────────────────────────────────────────

window.updateProgressBar = function() {
  const report = loadReportSync();
  const inspections = report.inspections || {};
  let totalItems = 0;
  let completedItems = 0;

  INSPECTION_CATEGORIES.forEach(cat => {
    totalItems += cat.items.length;
    cat.items.forEach(item => {
      const catData = inspections && inspections[cat.id] ? inspections[cat.id] : null;
      const status = (catData && catData[item.id]) ? catData[item.id].status : undefined;
      if (status && status !== 'unchecked') {
        completedItems++;
      }
    });
  });

  const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  
  if (fill) fill.style.width = `${percentage}%`;
  if (text) text.textContent = `${completedItems} / ${totalItems} (${percentage}%)`;
};

// ─── Utility ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
