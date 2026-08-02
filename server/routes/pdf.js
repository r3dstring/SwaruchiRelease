import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { all, run } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { chunkText } from '../retrieval.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload', authMiddleware, requireAdmin, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files allowed' });
  try {
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
    console.error('PDF parse error:', e.message);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

router.get('/list', authMiddleware, async (req, res) => {
  res.json(await all('SELECT id, filename, page_count, indexed, uploaded_at FROM pdfs ORDER BY uploaded_at DESC'));
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  await run('DELETE FROM pdfs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
