/**
 * api/upload-nextcloud.js
 * Vercel Serverless Function — receives PDF blob from frontend,
 * uploads it to Nextcloud via WebDAV PUT.
 *
 * Environment Variables (set in Vercel Dashboard):
 *   NEXTCLOUD_URL          = https://nc.ssdampera.web.id/nextcloud
 *   NEXTCLOUD_USER         = ssdampera
 *   NEXTCLOUD_APP_PASSWORD = ********
 *   NEXTCLOUD_FOLDER       = 20. Form Inspeksi Mobil
 */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // ── CORS headers ───────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // ── Read environment variables ─────────────────────────────
  const NC_URL    = process.env.NEXTCLOUD_URL;
  const NC_USER   = process.env.NEXTCLOUD_USER;
  const NC_PASS   = process.env.NEXTCLOUD_APP_PASSWORD;
  const NC_FOLDER = process.env.NEXTCLOUD_FOLDER || '20. Form Inspeksi Mobil';

  if (!NC_URL || !NC_USER || !NC_PASS) {
    return res.status(500).json({ success: false, message: 'Nextcloud credentials not configured on server' });
  }

  try {
    // ── Parse multipart form-data manually ─────────────────────
    const { fileBuffer, fileName } = await parseMultipart(req);

    if (!fileBuffer || !fileName) {
      return res.status(400).json({ success: false, message: 'Missing file or filename' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${NC_USER}:${NC_PASS}`).toString('base64');

    // ── Ensure target folder exists (MKCOL) ────────────────────
    const folderUrl = `${NC_URL}/remote.php/dav/files/${NC_USER}/${encodeURIComponent(NC_FOLDER)}`;
    await fetch(folderUrl, {
      method: 'MKCOL',
      headers: { Authorization: authHeader }
    }).catch(() => {}); // Ignore error if folder already exists

    // ── Upload file via WebDAV PUT ─────────────────────────────
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const uploadUrl = `${folderUrl}/${encodeURIComponent(safeFileName)}`;

    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/pdf'
      },
      body: fileBuffer
    });

    if (uploadResp.status === 201 || uploadResp.status === 204) {
      return res.status(200).json({
        success: true,
        message: `File "${safeFileName}" berhasil disimpan ke Nextcloud`,
        path: `${NC_FOLDER}/${safeFileName}`
      });
    } else {
      const errorText = await uploadResp.text();
      console.error('[Nextcloud] Upload failed:', uploadResp.status, errorText);
      return res.status(502).json({
        success: false,
        message: `Nextcloud returned ${uploadResp.status}: ${errorText.substring(0, 200)}`
      });
    }
  } catch (err) {
    console.error('[Nextcloud] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Simple multipart/form-data parser for Vercel serverless functions.
 * Extracts the first file field from the request body.
 */
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        // Extract boundary from content-type header
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        if (!boundaryMatch) {
          return reject(new Error('No boundary found in content-type'));
        }
        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const boundaryBuffer = Buffer.from(`--${boundary}`);

        // Split body by boundary
        const parts = [];
        let start = 0;
        while (true) {
          const idx = body.indexOf(boundaryBuffer, start);
          if (idx === -1) break;
          if (start > 0) {
            parts.push(body.slice(start, idx - 2)); // -2 for \r\n before boundary
          }
          start = idx + boundaryBuffer.length + 2; // +2 for \r\n after boundary
        }

        let fileBuffer = null;
        let fileName = 'report.pdf';

        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;

          const headers = part.slice(0, headerEnd).toString('utf-8');
          const content = part.slice(headerEnd + 4);

          // Check if this is the file field
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            fileName = filenameMatch[1];
            fileBuffer = content;
          }
        }

        resolve({ fileBuffer, fileName });
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
