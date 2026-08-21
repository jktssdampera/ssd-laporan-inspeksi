/**
 * pdf-export.js
 * Generates professional PDF report using jsPDF + autoTable.
 * No html2canvas – builds PDF programmatically (text, tables, images).
 */

// ─── Color palette ────────────────────────────────────────
const PDF_COLORS = {
  orange:    [249, 115, 22],
  white:     [255, 255, 255],
  black:     [0, 0, 0],
  darkGray:  [30, 30, 40],
  midGray:   [100, 116, 139],
  lightGray: [241, 245, 249],
  border:    [226, 232, 240],
  goodBg:    [220, 252, 231], goodText:    [22, 101, 52],
  warningBg: [254, 249, 195], warningText: [133, 77, 14],
  dangerBg:  [254, 226, 226], dangerText:  [153, 27, 27],
  uncheckedBg: [243, 244, 246], uncheckedText: [107, 114, 128],
  blueBorder: [0, 0, 204]
};

/**
 * Main entry point – called from app.js when user clicks "Download PDF".
 */
async function generatePDF() {
  const btn = document.getElementById('btn-download-pdf');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Membuat PDF...';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }

  try {
    if (typeof flushReportNow === 'function') await flushReportNow();

    showToast('Sedang membuat PDF...', 'good');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    
    await buildPDF(doc);

    const report = loadReportSync();
    const fileName = generateFilename(report);
    doc.save(fileName);
    showToast('PDF berhasil didownload!', 'good');
  } catch (err) {
    console.error('[PDF] Generation failed:', err);
    showToast('Gagal membuat PDF: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download"></i> Download PDF';
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
  }
}

/**
 * Shared PDF generation logic - populates a jsPDF instance.
 */
async function buildPDF(doc) {
  const report = loadReportSync();
  const workshop = loadWorkshopInfo();
  const stats = getInspectionStats();

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 12;
  const marginRight = 12;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let cursorY = 12;

  // Helper – add a new page when needed
  function ensureSpace(needed) {
    if (cursorY + needed > pageHeight - 15) {
      doc.addPage();
      cursorY = 12;
    }
  }

  // Helper – convert image URL to base64 (logo & photos)
  async function toBase64(url) {
    try {
      if (!url) return null;
      if (url.startsWith('data:')) return url.replace('image/webp', 'image/jpeg');
      const resp = await fetch(url, { mode: 'cors' });
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          let result = reader.result;
          if (typeof result === 'string') {
            result = result.replace('data:image/webp;', 'data:image/jpeg;');
          }
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('toBase64 failed for', url, e);
      return null;
    }
  }

  // ─── Header (logo + workshop details) ────────────────────
  doc.setDrawColor(...PDF_COLORS.blueBorder);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, cursorY, contentWidth, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.black);
  doc.text(workshop.name || 'Workshop', marginLeft + 4, cursorY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.midGray);
  doc.text(workshop.address || '', marginLeft + 4, cursorY + 13);
  doc.text(`Telp/Whatsapp: ${workshop.whatsapp || ''} | E-Mail: ${workshop.email || ''}`,
    marginLeft + 4, cursorY + 17.5);

  try {
    const logoBase64 = await toBase64(workshop.logo);
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', pageWidth - marginRight - 30, cursorY + 2, 28, 20, undefined, 'FAST');
    }
  } catch (e) { console.warn('Logo embed failed:', e); }

  cursorY += 27;

  // ─── Title bar ────────────────────────────────────────
  doc.setFillColor(...PDF_COLORS.orange);
  doc.rect(marginLeft, cursorY, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text('LAPORAN INSPEKSI KENDARAAN', pageWidth / 2, cursorY + 5.5, { align: 'center' });
  cursorY += 12;

  // ─── Customer & vehicle table ───────────────────────
  const c = report.customer || {};
  drawSectionTitle(doc, 'Data Customer & Kendaraan', marginLeft, cursorY, contentWidth);
  cursorY += 8;

  const customerData = [
    ['Nama Customer',   c.customerName || '-'],
    ['No. Telepon',     c.customerPhone || '-'],
    ['Merek & Model',   c.vehicleBrand || '-'],
    ['Tahun',           c.vehicleYear || '-'],
    ['Nomor Polisi',    c.vehiclePlate || '-'],
    ['Odometer',        c.vehicleOdometer ? `${Number(c.vehicleOdometer).toLocaleString('id-ID')} KM` : '-'],
    ['Tanggal Inspeksi', c.inspectionDate ? formatDate(c.inspectionDate) : '-'],
    ['Mekanik',         c.mechanicName || '-']
  ];

  doc.autoTable({
    body: customerData,
    startY: cursorY,
    margin: { left: marginLeft, right: marginRight },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, textColor: PDF_COLORS.black, lineColor: PDF_COLORS.border, lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, fillColor: PDF_COLORS.lightGray, textColor: [71, 85, 105] }, 1: { cellWidth: 'auto' } }
  });
  cursorY = doc.lastAutoTable.finalY + 6;

  // ─── Inspection tables per category ───────────────────
  for (const cat of INSPECTION_CATEGORIES) {
    ensureSpace(25);
    drawSectionTitle(doc, `${cat.id}. ${cat.name}`, marginLeft, cursorY, contentWidth);
    cursorY += 8;

    const tableBody = [];
    cat.items.forEach(item => {
      const catData = report.inspections && report.inspections[cat.id] ? report.inspections[cat.id] : null;
      const data = (catData && catData[item.id]) ? catData[item.id] : {};
      const status = data.status || 'unchecked';
      const statusInfo = STATUS_OPTIONS.find(s => s.value === status);
      const photos = (data.photos || []).filter(Boolean);
      tableBody.push({
        id: item.id,
        label: item.label,
        status,
        statusLabel: statusInfo ? statusInfo.label : 'N/A',
        note: data.note || '-',
        photos
      });
    });

    doc.autoTable({
      head: [['#', 'Item Pengecekan', 'Status', 'Catatan']],
      body: tableBody.map(r => [r.id, r.label, r.statusLabel, r.note]),
      startY: cursorY,
      margin: { left: marginLeft, right: marginRight },
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.lightGray, textColor: [51, 65, 85], fontStyle: 'bold', fontSize: 7.5, cellPadding: 2 },
      styles: { fontSize: 8, cellPadding: 2, textColor: PDF_COLORS.black, lineColor: PDF_COLORS.border, lineWidth: 0.2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold', textColor: PDF_COLORS.orange },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 40 }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 2) {
          const row = tableBody[data.row.index];
          if (row) {
            const s = row.status;
            if (s === 'good') { data.cell.styles.fillColor = PDF_COLORS.goodBg; data.cell.styles.textColor = PDF_COLORS.goodText; }
            else if (s === 'warning') { data.cell.styles.fillColor = PDF_COLORS.warningBg; data.cell.styles.textColor = PDF_COLORS.warningText; }
            else if (s === 'danger') { data.cell.styles.fillColor = PDF_COLORS.dangerBg; data.cell.styles.textColor = PDF_COLORS.dangerText; }
            else { data.cell.styles.fillColor = PDF_COLORS.uncheckedBg; data.cell.styles.textColor = PDF_COLORS.uncheckedText; }
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    cursorY = doc.lastAutoTable.finalY + 2;

    // Embed photos (if any) under the row
    for (const row of tableBody) {
      if (row.photos.length) {
        ensureSpace(30);
        doc.setFontSize(7);
        doc.setTextColor(...PDF_COLORS.midGray);
        doc.text(`Foto ${row.id}:`, marginLeft + 2, cursorY + 3);
        cursorY += 4;
        let photoX = marginLeft + 2;
        for (const photoUrl of row.photos) {
          try {
            const base64 = await toBase64(photoUrl);
            if (base64) {
              ensureSpace(28);
              doc.addImage(base64, 'JPEG', photoX, cursorY, 30, 22, undefined, 'FAST');
              photoX += 33;
              if (photoX + 30 > pageWidth - marginRight) { photoX = marginLeft + 2; cursorY += 24; }
            }
          } catch (e) { console.warn('Photo embed failed:', photoUrl, e); }
        }
        cursorY += 26;
      }
    }
    cursorY += 4;
  }

  // ─── Summary bar (statistics) ───────────────────────
  ensureSpace(40);
  drawSectionTitle(doc, 'Ringkasan Inspeksi', marginLeft, cursorY, contentWidth);
  cursorY += 8;
  const statsItems = [
    { label: `Baik: ${stats.good}`, bg: PDF_COLORS.goodBg, text: PDF_COLORS.goodText },
    { label: `Perlu Perhatian: ${stats.warning}`, bg: PDF_COLORS.warningBg, text: PDF_COLORS.warningText },
    { label: `Rusak: ${stats.danger}`, bg: PDF_COLORS.dangerBg, text: PDF_COLORS.dangerText },
    { label: `Tidak Diperiksa: ${stats.unchecked}`, bg: PDF_COLORS.uncheckedBg, text: PDF_COLORS.uncheckedText }
  ];
  let statX = marginLeft;
  statsItems.forEach(it => {
    const w = doc.getTextWidth(it.label) + 6;
    doc.setFillColor(...it.bg);
    doc.roundedRect(statX, cursorY, w, 6, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...it.text);
    doc.text(it.label, statX + 3, cursorY + 4);
    statX += w + 3;
  });
  cursorY += 10;

  // ─── Optional textual summary blocks ──────────────────
  const s = report.summary || {};
  if (s.summaryCondition) { ensureSpace(15); drawSummaryBlock(doc, 'Kondisi Umum Kendaraan:', s.summaryCondition, marginLeft, cursorY, contentWidth); cursorY += getBlockHeight(doc, s.summaryCondition, contentWidth - 8) + 10; }
  if (s.summaryRecommend) { ensureSpace(15); drawSummaryBlock(doc, 'Rekomendasi Perbaikan:', s.summaryRecommend, marginLeft, cursorY, contentWidth); cursorY += getBlockHeight(doc, s.summaryRecommend, contentWidth - 8) + 10; }
  if (s.summaryNotes) { ensureSpace(15); drawSummaryBlock(doc, 'Catatan Tambahan:', s.summaryNotes, marginLeft, cursorY, contentWidth); cursorY += getBlockHeight(doc, s.summaryNotes, contentWidth - 8) + 10; }

  // ─── Footer with signatures ────────────────────────
  ensureSpace(55);
  const mechanic = c.mechanicName || '_______________';
  const dateStr = c.inspectionDate ? formatDate(c.inspectionDate) : formatDate(new Date().toISOString().split('T')[0]);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, cursorY, pageWidth - marginRight, cursorY);
  cursorY += 8;
  const sigLeftX = marginLeft + 20;
  const sigRightX = pageWidth - marginRight - 60;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.midGray);
  doc.text('Mengetahui,', sigLeftX, cursorY, { align: 'center' });
  doc.text('Diperiksa oleh,', sigRightX, cursorY, { align: 'center' });
  cursorY += 25;
  doc.setDrawColor(...PDF_COLORS.black);
  doc.setLineWidth(0.3);
  doc.line(sigLeftX - 20, cursorY, sigLeftX + 20, cursorY);
  doc.line(sigRightX - 20, cursorY, sigRightX + 20, cursorY);
  cursorY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.black);
  doc.text('Customer', sigLeftX, cursorY, { align: 'center' });
  doc.text(mechanic, sigRightX, cursorY, { align: 'center' });
  cursorY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.midGray);
  doc.text('Mekanik', sigRightX, cursorY, { align: 'center' });
  cursorY += 10;
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.midGray);
  doc.text(`${workshop.name} - ${dateStr}`, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 4;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.text('Dokumen ini digenerate secara digital dan berlaku tanpa tanda tangan basah.', pageWidth / 2, cursorY, { align: 'center' });
}

/**
 * Show the PDF preview inside the modal.
 */
async function showPDFPreview() {
  const modal = document.getElementById('preview-modal');
  const container = document.getElementById('preview-pdf-container');
  if (!modal || !container) return;

  try {
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:#888;">Memuat preview...</p>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (typeof flushReportNow === 'function') await flushReportNow();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    
    await buildPDF(doc);

    const blob = doc.output('blob');
    const blobURL = URL.createObjectURL(blob);
    
    container.innerHTML = `<iframe src="${blobURL}" style="width:100%; height:600px; border:none; border-radius:8px;"></iframe>`;
  } catch (err) {
    console.error('[Preview] Failed to render preview:', err);
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:#f44;">Gagal merender preview: ' + err.message + '</p>';
  }
}

/**
 * Hide the PDF preview modal.
 */
function hidePDFPreview() {
  const modal = document.getElementById('preview-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

/** Helper: draw a section title bar */
function drawSectionTitle(doc, title, x, y, width) {
  doc.setFillColor(...PDF_COLORS.lightGray);
  doc.rect(x, y, width, 6, 'F');
  doc.setFillColor(...PDF_COLORS.orange);
  doc.rect(x, y, 2, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.darkGray);
  doc.text(title, x + 5, y + 4.2);
}

/** Helper: draw a text block with a gray background */
function drawSummaryBlock(doc, title, content, x, y, width) {
  const blockHeight = getBlockHeight(doc, content, width - 8) + 8;
  doc.setFillColor(...PDF_COLORS.lightGray);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, blockHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor([51, 65, 85]);
  doc.text(title, x + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor([71, 85, 105]);
  const lines = doc.splitTextToSize(content, width - 8);
  doc.text(lines, x + 4, y + 10);
}

function getBlockHeight(doc, text, maxWidth) {
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(text || '', maxWidth);
  return lines.length * 4 + 4;
}

function generateFilename(report) {
  const c = report.customer || {};
  const customer = c.customerName || 'Customer';
  const plate = c.vehiclePlate || 'NoPol';
  const date = c.inspectionDate || new Date().toISOString().split('T')[0];
  const clean = str => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  return `Inspeksi_${clean(customer)}_${clean(plate)}_${date}.pdf`;
}

function formatDate(dateStr) {
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
