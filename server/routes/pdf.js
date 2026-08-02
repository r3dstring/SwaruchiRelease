import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { all, run } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { chunkText } from '../retrieval.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Wrap multer so its errors (e.g. file too large) return JSON instead of
// falling through to Express's default HTML error page.
function uploadMiddleware(req, res, next) {
  upload.single('pdf')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large — max 10MB' });
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}

router.post('/upload', authMiddleware, requireAdmin, uploadMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files allowed' });

    const data = await pdf(req.file.buffer);
    const text = data.text?.trim();
    if (!text || text.length < 50) return res.status(400).json({ error: 'Could not extract enough text from this PDF' });

    const chunks = chunkText(text);
    const result = await run(
      'INSERT INTO pdfs (user_id, filename, text_content, chunks, indexed, page_count) VALUES (?, ?, ?, ?, 1, ?)',
      [req.user.id, req.file.originalname, text, JSON.stringify(chunks), data.numpages]
    );
    res.json({ id: result.lastInsertRowid, filename: req.file.originalname, page_count: data.numpages, chunk_count: chunks.length, uploaded_at: new Date().toISOString() });
  } catch (e) {
    console.error('PDF upload error:', e);
    res.status(500).json({ error: 'Failed to process PDF: ' + e.message });
  }
});

router.get('/list', authMiddleware, async (req, res) => {
  try {
    res.json(await all('SELECT id, filename, page_count, indexed, uploaded_at FROM pdfs ORDER BY uploaded_at DESC'));
  } catch (e) {
    console.error('List error:', e);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM pdfs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
