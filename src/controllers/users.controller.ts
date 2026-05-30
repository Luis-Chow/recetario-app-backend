import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Recipe } from '../models/Recipe';
import { Group } from '../models/Group';
import { AuthRequest } from '../middleware/auth.middleware';
import { serializeUser } from '../utils/serialize';

export async function getMe(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  return res.json({ user: serializeUser(user) });
}

export async function updateMe(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const { name, email, password } = req.body || {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nombre invalido.' });
    }
    if (name.length > 50) {
      return res.status(400).json({ error: 'El nombre no puede superar 50 caracteres.' });
    }
    user.name = name.trim();
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Correo invalido.' });
    }
    if (email.length > 100) {
      return res.status(400).json({ error: 'El correo no puede superar 100 caracteres.' });
    }
    const normalized = email.toLowerCase().trim();
    if (normalized !== user.email) {
      const taken = await User.findOne({ email: normalized, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Ese correo ya esta en uso.' });
      user.email = normalized;
    }
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
    }
    if (password.length > 64) {
      return res.status(400).json({ error: 'La contrasena no puede superar 64 caracteres.' });
    }
    if (/\s/.test(password)) {
      return res.status(400).json({ error: 'La contrasena no puede contener espacios.' });
    }
    user.password = await bcrypt.hash(password, 10);
  }

  await user.save();
  return res.json({ user: serializeUser(user) });
}

export async function deleteMe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  await Recipe.deleteMany({ userId });
  await Group.deleteMany({ userId });
  await User.findByIdAndDelete(userId);
  return res.json({ ok: true });
}
