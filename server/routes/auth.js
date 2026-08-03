import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run } from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 4) return res.status(400).json({ error: 'Password too short' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const existingAdmin = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const isFirst = !existingAdmin;
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdmin = isFirst || (adminEmail && email.trim().toLowerCase() === adminEmail.toLowerCase());
    const role = isAdmin ? 'admin' : 'user';

    const result = await run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username.trim(), email.trim().toLowerCase(), hash, role]);
    const user = await get('SELECT id, username, email, role, xp, level, streak FROM users WHERE id = ?', [result.lastInsertRowid]);
    res.json({ token: generateToken(user), user });
  } catch (e) {
    if (e.message.includes('duplicate') || e.message.includes('unique')) return res.status(409).json({ error: 'Username or email already taken' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const { password_hash, ...safe } = user;
  res.json({ token: generateToken(safe), user: safe });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await get('SELECT id, username, email, role, xp, level, streak, last_quiz_date, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Master-key password reset. No email verification loop, no token —
// anyone who knows the shared master key can reset any account's password.
// This is deliberately simple for a small internal test group, NOT a
// substitute for real per-user password reset (email link, etc) in production.
// Change the key via MASTER_RESET_KEY env var; falls back to a default if unset.
router.post('/reset-password', async (req, res) => {
  const { email, masterKey, newPassword } = req.body;
  if (!email || !masterKey || !newPassword) return res.status(400).json({ error: 'email, masterKey, and newPassword are required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password too short' });

  const expectedKey = process.env.MASTER_RESET_KEY || 'abacusaloha';
  if (masterKey !== expectedKey) return res.status(403).json({ error: 'Incorrect master key' });

  const user = await get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (!user) return res.status(404).json({ error: 'No account found with that email' });

  const hash = bcrypt.hashSync(newPassword, 10);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  res.json({ ok: true });
});

export default router;
