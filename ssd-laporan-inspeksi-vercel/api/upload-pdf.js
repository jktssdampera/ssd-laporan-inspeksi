export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb', // allow up to 10mb for PDF
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read the raw body as a buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    const fileName = req.query.filename || `Inspeksi_${Date.now()}.pdf`;
    
    // Nextcloud config
    const nextcloudToken = 'zpc2LkfcyXzKGqY';
    const nextcloudUrl = `https://nc.ssdampera.web.id/nextcloud/public.php/webdav/${encodeURIComponent(fileName)}`;
    const authHeader = 'Basic ' + Buffer.from(nextcloudToken + ':').toString('base64');

    const ncResponse = await fetch(nextcloudUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/pdf'
      },
      body: pdfBuffer
    });

    if (!ncResponse.ok) {
      console.error(`Nextcloud WebDAV upload failed: ${ncResponse.status} ${ncResponse.statusText}`);
      const text = await ncResponse.text();
      return res.status(500).json({ error: 'Failed to upload to Nextcloud', details: text });
    }

    return res.status(200).json({ success: true, message: 'PDF uploaded to Nextcloud successfully' });
  } catch (error) {
    console.error('Error in upload-pdf:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
