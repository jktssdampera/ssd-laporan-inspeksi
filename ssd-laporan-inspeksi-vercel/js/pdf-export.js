/**
 * pdf-export.js
 * Generates professional PDF report from current inspection data.
 * Uses html2pdf.js for client-side PDF generation.
 */

// ─── Generate PDF ────────────────────────────────────────────────────

async function generatePDF() {
  const btn = document.getElementById('btn-download-pdf');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Membuat PDF...';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }

  try {
    // Flush any pending changes to MongoDB before generating PDF
    if (typeof flushReportNow === 'function') await flushReportNow();

    const report = loadReportSync();
    const workshop = loadWorkshopInfo();
    
    // Fix Logo Issue: Convert relative logo path to base64 to ensure it renders in PDF
    try {
      const response = await fetch(workshop.logo);
      const blob = await response.blob();
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      workshop.logo = base64; // Temporarily overwrite with base64 for PDF generation
    } catch(e) {
      console.warn("Failed to convert logo to base64", e);
    }

    // Generate HTML content
    const htmlContent = buildPDFContent(report, workshop);
    
    // Create a temporary container to hold the HTML
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.width = '210mm'; // A4 width
    container.style.padding = '15mm';
    container.style.backgroundColor = 'white';
    
    // Wait for all images in the container to load before generating PDF
    const images = container.querySelectorAll('img');
    const imagePromises = Array.from(images).map(img => {
      return new Promise(resolve => {
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve; // Don't block on error
      });
    });
    await Promise.all(imagePromises);

    const fileName = generateFilename(report);

    // Options for html2pdf
    const opt = {
      margin:       0,
      filename:     fileName,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate PDF as Blob
    showToast('Sedang membuat PDF...', 'good');
    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');

    // 1. Download to user's device
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(pdfUrl);

    // 2. Upload to Nextcloud via Vercel API
    showToast('Mengunggah ke Nextcloud...', 'good');
    const uploadRes = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(fileName)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf'
      },
      body: pdfBlob
    });

    if (uploadRes.ok) {
      showToast('Berhasil diunduh dan disimpan ke Nextcloud!', 'good');
    } else {
      const errText = await uploadRes.text();
      console.error('Nextcloud upload error:', errText);
      showToast('PDF berhasil diunduh, namun gagal diunggah ke Nextcloud.', 'warning');
    }

  } catch (err) {
    console.error('[PDF] Generation failed:', err);
    showToast('Gagal membuat PDF. Coba lagi.', 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download"></i> Download PDF';
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
  }
}

// ─── Preview PDF ─────────────────────────────────────────────────────

function showPDFPreview() {
  const modal = document.getElementById('preview-modal');
  const container = document.getElementById('preview-pdf-container');
  
  if (!modal || !container) return;

  try {
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:#888;">Memuat preview...</p>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const report = loadReportSync();
    const workshop = loadWorkshopInfo();
    const pdfContent = buildPDFContent(report, workshop);

    // Use requestAnimationFrame to prevent UI blocking
    requestAnimationFrame(() => {
      container.innerHTML = pdfContent;
    });
  } catch (err) {
    console.error('[Preview] Failed to render preview:', err);
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:#f44;">Gagal merender preview. Silakan coba lagi.</p>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function hidePDFPreview() {
  const modal = document.getElementById('preview-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// ─── Build PDF HTML Content ──────────────────────────────────────────

function buildPDFContent(report, workshop) {
  return `
    <div class="pdf-document">
      ${buildPDFHeader(workshop)}
      ${buildPDFCustomerInfo(report)}
      ${buildPDFInspections(report)}
      ${buildPDFSummary(report)}
      ${buildPDFFooter(report, workshop)}
    </div>
  `;
}

// ─── PDF Header ──────────────────────────────────────────────────────

function buildPDFHeader(workshop) {
  return `
    <div class="pdf-header">
      <div class="pdf-header-text">
        <h1 class="pdf-workshop-name">${workshop.name}</h1>
        <p class="pdf-workshop-detail">${workshop.address}</p>
        <p class="pdf-workshop-detail"><i>Telp/Whatsapp. ${workshop.whatsapp} &nbsp;&nbsp;&nbsp; E-Mail : ${workshop.email}</i></p>
      </div>
      <div class="pdf-header-logo">
        <img src="${workshop.logo}" alt="Logo ${workshop.name}" class="pdf-logo">
      </div>
    </div>
    <div class="pdf-title-bar">
      <h2>LAPORAN INSPEKSI KENDARAAN</h2>
    </div>
  `;
}

// ─── PDF Customer Info ───────────────────────────────────────────────

function buildPDFCustomerInfo(report) {
  const c = report.customer || {};
  const fields = [
    ['Nama Customer', c.customerName],
    ['No. Telepon', c.customerPhone],
    ['Merek & Model', c.vehicleBrand],
    ['Tahun', c.vehicleYear],
    ['Nomor Polisi', c.vehiclePlate],
    ['Odometer', c.vehicleOdometer ? `${Number(c.vehicleOdometer).toLocaleString('id-ID')} KM` : ''],
    ['Tanggal Inspeksi', c.inspectionDate ? formatDate(c.inspectionDate) : ''],
    ['Mekanik', c.mechanicName]
  ];

  return `
    <div class="pdf-section">
      <h3 class="pdf-section-title">Data Customer & Kendaraan</h3>
      <table class="pdf-table pdf-customer-table">
        <tbody>
          ${fields.map(([label, val]) => `
            <tr>
              <td class="pdf-td-label">${label}</td>
              <td class="pdf-td-value">${val || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── PDF Inspections ─────────────────────────────────────────────────

function buildPDFInspections(report) {
  return INSPECTION_CATEGORIES.map(cat => {
    const items = cat.items.map(item => {
      const catData = report.inspections && report.inspections[cat.id] ? report.inspections[cat.id] : null;
      const data = (catData && catData[item.id]) ? catData[item.id] : {};
      const status = data.status || 'unchecked';
      const statusInfo = STATUS_OPTIONS.find(s => s.value === status);
      const photos = (data.photos || []).filter(Boolean);

      return `
        <tr class="pdf-item-row pdf-status-${status}">
          <td class="pdf-td-code">${item.id}</td>
          <td class="pdf-td-item">${item.label}</td>
          <td class="pdf-td-status">
            <span class="pdf-status-badge pdf-badge-${status}">
              ${statusInfo ? statusInfo.label : 'N/A'}
            </span>
          </td>
          <td class="pdf-td-note">${data.note || '-'}</td>
        </tr>
        ${photos.length > 0 ? `
          <tr class="pdf-photo-row">
            <td colspan="4">
              <div class="pdf-photos">
                ${photos.map((p, i) => `
                  <img src="${p}" alt="Foto ${item.id}-${i + 1}" class="pdf-photo">
                `).join('')}
              </div>
            </td>
          </tr>
        ` : ''}
      `;
    }).join('');

    return `
      <div class="pdf-section pdf-category-section">
        <h3 class="pdf-section-title">${cat.id}. ${cat.name}</h3>
        <table class="pdf-table pdf-inspection-table">
          <thead>
            <tr>
              <th class="pdf-th-code">#</th>
              <th class="pdf-th-item">Item Pengecekan</th>
              <th class="pdf-th-status">Status</th>
              <th class="pdf-th-note">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${items}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

// ─── PDF Summary ─────────────────────────────────────────────────────

function buildPDFSummary(report) {
  const s = report.summary || {};
  const stats = getInspectionStats();

  return `
    <div class="pdf-section">
      <h3 class="pdf-section-title">Ringkasan Inspeksi</h3>
      
      <div class="pdf-stats-bar">
        <span class="pdf-stat pdf-stat-good">Baik: ${stats.good}</span>
        <span class="pdf-stat pdf-stat-warning">Perlu Perhatian: ${stats.warning}</span>
        <span class="pdf-stat pdf-stat-danger">Rusak: ${stats.danger}</span>
        <span class="pdf-stat pdf-stat-unchecked">Tidak Diperiksa: ${stats.unchecked}</span>
      </div>

      ${s.summaryCondition ? `
        <div class="pdf-summary-block">
          <strong>Kondisi Umum Kendaraan:</strong>
          <p>${s.summaryCondition}</p>
        </div>
      ` : ''}
      
      ${s.summaryRecommend ? `
        <div class="pdf-summary-block">
          <strong>Rekomendasi Perbaikan:</strong>
          <p>${s.summaryRecommend}</p>
        </div>
      ` : ''}
      
      ${s.summaryNotes ? `
        <div class="pdf-summary-block">
          <strong>Catatan Tambahan:</strong>
          <p>${s.summaryNotes}</p>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── PDF Footer ──────────────────────────────────────────────────────

function buildPDFFooter(report, workshop) {
  const cust = report.customer || {};
  const dateStr = cust.inspectionDate ? formatDate(cust.inspectionDate) : formatDate(new Date().toISOString().split('T')[0]);
  const mechanic = cust.mechanicName || '_______________';

  return `
    <div class="pdf-footer">
      <div class="pdf-signature-area">
        <div class="pdf-signature-block">
          <p>Mengetahui,</p>
          <div class="pdf-signature-line"></div>
          <p class="pdf-signature-name">Customer</p>
        </div>
        <div class="pdf-signature-block">
          <p>Diperiksa oleh,</p>
          <div class="pdf-signature-line"></div>
          <p class="pdf-signature-name">${mechanic}</p>
          <p class="pdf-signature-role">Mekanik</p>
        </div>
      </div>
      <div class="pdf-footer-info">
        <p>${workshop.name} — ${dateStr}</p>
        <p class="pdf-disclaimer">Dokumen ini digenerate secara digital dan berlaku tanpa tanda tangan basah.</p>
      </div>
    </div>
  `;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function generateFilename(report) {
  const c = report.customer || {};
  const customer = c.customerName || 'Customer';
  const plate = c.vehiclePlate || 'NoPol';
  const date = c.inspectionDate || new Date().toISOString().split('T')[0];

  const clean = (str) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  return `Inspeksi_${clean(customer)}_${clean(plate)}_${date}.pdf`;
}

function formatDate(dateStr) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
