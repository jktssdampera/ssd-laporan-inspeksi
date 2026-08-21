/**
 * photo-handler.js
 * Photo upload, compression, preview, lightbox, and deletion.
 * Supports drag & drop + click-to-upload.
 */

const PHOTO_CONFIG = {
  maxWidth: 1000,
  quality: 0.75,
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 50 * 1024 * 1024 // 50MB raw input limit (auto-compressed by canvas to ~150KB)
};

// ─── Image Compression ──────────────────────────────────────────────

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!PHOTO_CONFIG.acceptedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      reject(new Error('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.'));
      return;
    }
    if (file.size > PHOTO_CONFIG.maxSizeBytes) {
      reject(new Error('Ukuran file kamera terlalu besar (maksimal 50MB).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize if wider than maxWidth
        if (width > PHOTO_CONFIG.maxWidth) {
          height = Math.round((height * PHOTO_CONFIG.maxWidth) / width);
          width = PHOTO_CONFIG.maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', PHOTO_CONFIG.quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}

// ─── Create Photo Upload Slot ────────────────────────────────────────

function createPhotoSlot(itemId, slotIndex, existingPhoto) {
  const slotEl = document.createElement('div');
  slotEl.className = 'photo-slot';
  slotEl.id = `photo-slot-${itemId}-${slotIndex}`;

  if (existingPhoto) {
    renderPhotoPreview(slotEl, itemId, slotIndex, existingPhoto);
  } else {
    renderUploadDropzone(slotEl, itemId, slotIndex);
  }

  return slotEl;
}

function renderUploadDropzone(slotEl, itemId, slotIndex) {
  slotEl.innerHTML = `
    <div class="photo-dropzone" tabindex="0" role="button"
         aria-label="Upload foto untuk ${itemId} slot ${slotIndex + 1}"
         data-item="${itemId}" data-slot="${slotIndex}">
      <i data-lucide="camera" class="photo-dropzone-icon"></i>
      <span class="photo-dropzone-text">Foto ${slotIndex + 1}</span>
      <span class="photo-dropzone-hint">Klik atau seret foto</span>
      <input type="file" accept="image/jpeg,image/png,image/webp"
             class="photo-file-input" aria-hidden="true" tabindex="-1">
    </div>
  `;

  const dropzone = slotEl.querySelector('.photo-dropzone');
  const fileInput = slotEl.querySelector('.photo-file-input');

  // Click to upload
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // File selected
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handlePhotoUpload(slotEl, itemId, slotIndex, file);
  });

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await handlePhotoUpload(slotEl, itemId, slotIndex, file);
  });

  // Re-initialize lucide icons for this element
  if (window.lucide) lucide.createIcons({ nodes: [slotEl] });
}

function renderPhotoPreview(slotEl, itemId, slotIndex, photoUrl) {
  slotEl.innerHTML = `
    <div class="photo-preview">
      <img src="${photoUrl}" alt="Foto ${itemId} slot ${slotIndex + 1}"
           class="photo-thumbnail" loading="lazy">
      <button type="button" class="photo-delete-btn" 
              aria-label="Hapus foto ${itemId} slot ${slotIndex + 1}"
              data-item="${itemId}" data-slot="${slotIndex}">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;

  // Click thumbnail to open lightbox
  const thumbnail = slotEl.querySelector('.photo-thumbnail');
  thumbnail.addEventListener('click', () => openLightbox(photoUrl, `${itemId} - Foto ${slotIndex + 1}`));
  thumbnail.style.cursor = 'pointer';

  // Delete button
  const deleteBtn = slotEl.querySelector('.photo-delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlePhotoDelete(slotEl, itemId, slotIndex);
  });

  if (window.lucide) lucide.createIcons({ nodes: [slotEl] });
}

// ─── Upload Handler ──────────────────────────────────────────────────

// Helper to convert base64 to Blob
function base64ToBlob(base64, mime) {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

async function handlePhotoUpload(slotEl, itemId, slotIndex, file) {
  try {
    slotEl.classList.add('photo-loading');
    
    // Auto compress client-side
    const base64 = await compressImage(file);
    
    // Convert base64 to Blob
    const blob = base64ToBlob(base64, 'image/jpeg');
    
    // File path in Supabase Storage
    const reportId = getReportId() || 'temp_report';
    const fileName = `${reportId}/${itemId}_${slotIndex}_${Date.now()}.jpg`;

    if (!supabaseClient) {
      throw new Error('Supabase client belum diinisialisasi');
    }

    // Upload directly to Supabase Storage (Bucket: 'inspeksi')
    const { data, error } = await supabaseClient
      .storage
      .from('inspeksi')
      .upload(fileName, blob, {
        cacheControl: '31536000',
        upsert: false,
        contentType: 'image/jpeg'
      });

    if (error) {
      console.error("Supabase Upload Error:", error);
      throw new Error('Gagal mengupload foto ke Supabase: ' + error.message);
    }
    
    // Get public URL
    const { data: publicUrlData } = supabaseClient
      .storage
      .from('inspeksi')
      .getPublicUrl(fileName);
      
    const finalUrl = publicUrlData.publicUrl;

    // Save to report cache & flush to MongoDB/Supabase DB
    const report = loadReportSync();
    const catId = itemId.charAt(0);
    if (report.inspections[catId] && report.inspections[catId][itemId]) {
      if (!report.inspections[catId][itemId].photos) {
        report.inspections[catId][itemId].photos = [];
      }
      report.inspections[catId][itemId].photos[slotIndex] = finalUrl;
      saveReport(report);
    }

    // Re-render as preview
    renderPhotoPreview(slotEl, itemId, slotIndex, finalUrl);
    slotEl.classList.remove('photo-loading');
    showToast('Foto berhasil diupload', 'good');
  } catch (err) {
    slotEl.classList.remove('photo-loading');
    showToast(err.message, 'danger');
  }
}

// ─── Delete Handler ──────────────────────────────────────────────────

function handlePhotoDelete(slotEl, itemId, slotIndex) {
  const report = loadReportSync();
  const catId = itemId.charAt(0);
  const catData = report.inspections && report.inspections[catId] ? report.inspections[catId] : null;
  if (catData && catData[itemId] && catData[itemId].photos) {
    catData[itemId].photos[slotIndex] = null;
    saveReport(report);
  }

  renderUploadDropzone(slotEl, itemId, slotIndex);
  showToast('Foto dihapus', 'warning');
}

// ─── Lightbox ────────────────────────────────────────────────────────

function openLightbox(imageSrc, title) {
  // Remove existing lightbox
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML = `
    <div class="lightbox-content">
      <button type="button" class="lightbox-close" aria-label="Tutup lightbox">
        <i data-lucide="x"></i>
      </button>
      <img src="${imageSrc}" alt="${title}" class="lightbox-image">
      <p class="lightbox-title">${title}</p>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  if (window.lucide) lucide.createIcons({ nodes: [overlay] });

  // Focus trap
  const closeBtn = overlay.querySelector('.lightbox-close');
  closeBtn.focus();

  // Close events
  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('lightbox-visible'));
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) {
    overlay.classList.remove('lightbox-visible');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 200);
  }
}
