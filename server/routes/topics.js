import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/topics — the full tree, available to any authenticated user
// (Dashboard's topic picker and Knowledge Map both need this)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const branches = await all('SELECT * FROM topics WHERE parent_id IS NULL ORDER BY sort_order, id');
    const leaves = await all('SELECT * FROM topics WHERE parent_id IS NOT NULL ORDER BY sort_order, id');

    const tree = branches.map(b => ({
      id: b.id,
      label: b.label,
      icon: b.icon,
      children: leaves
        .filter(l => l.parent_id === b.id)
        .map(l => ({ id: l.id, label: l.label, keywords: safeParseKeywords(l.keywords) })),
    }));
    res.json(tree);
  } catch (e) {
    console.error('Topics fetch error:', e);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

function safeParseKeywords(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// ── Admin: create a branch ───────────────────────────────────
router.post('/admin/branch', authMiddleware, requireAdmin, async (req, res) => {
  const { label, icon } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Branch label required' });
  const maxOrder = await get('SELECT COALESCE(MAX(sort_order), -1) as m FROM topics WHERE parent_id IS NULL');
  const result = await run('INSERT INTO topics (parent_id, label, icon, sort_order) VALUES (NULL, ?, ?, ?)',
    [label.trim(), icon?.trim() || null, (maxOrder?.m ?? -1) + 1]);
  res.json({ id: result.lastInsertRowid, label: label.trim(), icon: icon?.trim() || null, children: [] });
});

// ── Admin: create a leaf under a branch ──────────────────────
router.post('/admin/leaf', authMiddleware, requireAdmin, async (req, res) => {
  const { parent_id, label, keywords } = req.body;
  if (!parent_id || !label?.trim()) return res.status(400).json({ error: 'parent_id and label required' });
  const parent = await get('SELECT id FROM topics WHERE id = ? AND parent_id IS NULL', [parent_id]);
  if (!parent) return res.status(404).json({ error: 'Parent branch not found' });

  const kwArray = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()).filter(Boolean) : []);
  const maxOrder = await get('SELECT COALESCE(MAX(sort_order), -1) as m FROM topics WHERE parent_id = ?', [parent_id]);
  const result = await run('INSERT INTO topics (parent_id, label, keywords, sort_order) VALUES (?, ?, ?, ?)',
    [parent_id, label.trim(), JSON.stringify(kwArray), (maxOrder?.m ?? -1) + 1]);
  res.json({ id: result.lastInsertRowid, label: label.trim(), keywords: kwArray });
});

// ── Admin: update a branch or leaf ───────────────────────────
router.patch('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { label, icon, keywords } = req.body;
  const existing = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Topic not found' });

  const isBranch = existing.parent_id === null;
  const newLabel = label?.trim() ?? existing.label;
  const newIcon = isBranch ? (icon?.trim() ?? existing.icon) : existing.icon;
  let newKeywords = existing.keywords;
  if (!isBranch && keywords !== undefined) {
    const kwArray = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()).filter(Boolean) : []);
    newKeywords = JSON.stringify(kwArray);
  }

  await run('UPDATE topics SET label = ?, icon = ?, keywords = ? WHERE id = ?', [newLabel, newIcon, newKeywords, req.params.id]);
  res.json({ ok: true });
});

// ── Admin: delete a branch (cascades to its leaves) or a leaf ─
router.delete('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  const existing = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Topic not found' });
  await run('DELETE FROM topics WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
