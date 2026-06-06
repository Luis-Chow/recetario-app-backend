import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Recipe } from '../models/Recipe';
import { Group } from '../models/Group';
import { SavedRecipe } from '../models/SavedRecipe';
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

  const { name, email, password, currentPassword, avatar } = req.body || {};

  if (avatar !== undefined) {
    if (avatar === null || avatar === '') {
      user.avatar = '';
    } else if (typeof avatar !== 'string') {
      return res.status(400).json({ error: 'Avatar invalido.' });
    } else if (!avatar.startsWith('data:image/')) {
      return res.status(400).json({ error: 'El avatar debe ser un data URI valido.' });
    } else if (avatar.length > 3_000_000) {
      return res.status(400).json({ error: 'El avatar es muy grande (max ~2MB).' });
    } else {
      user.avatar = avatar;
    }
  }

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
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ error: 'Debes ingresar tu contrasena actual para cambiarla.' });
    }
    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(401).json({ error: 'La contrasena actual no es correcta.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
    }
    if (password.length > 64) {
      return res.status(400).json({ error: 'La contrasena no puede superar 64 caracteres.' });
    }
    if (/\s/.test(password)) {
      return res.status(400).json({ error: 'La contrasena no puede contener espacios.' });
    }
    if (currentPassword === password) {
      return res.status(400).json({ error: 'La nueva contrasena debe ser distinta a la actual.' });
    }
    user.password = await bcrypt.hash(password, 10);
  }

  await user.save();
  return res.json({ user: serializeUser(user) });
}

export async function deleteMe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  // Borrar las recetas del usuario y todas las "guardadas" que apuntaban a ellas
  const recipesToDelete = await Recipe.find({ userId }).select('_id');
  const recipeIds = recipesToDelete.map(r => r._id);
  await SavedRecipe.deleteMany({ recipeId: { $in: recipeIds } });
  await Recipe.deleteMany({ userId });
  // Borrar grupos del usuario y limpiar referencias en SavedRecipe ajenas
  const groupsToDelete = await Group.find({ userId }).select('_id');
  const groupIds = groupsToDelete.map(g => g._id);
  await Group.deleteMany({ userId });
  // Limpiar grupos del usuario en cualquier SavedRecipe (las propias ya estan borradas)
  if (groupIds.length > 0) {
    await SavedRecipe.updateMany(
      { groupIds: { $in: groupIds } },
      { $pull: { groupIds: { $in: groupIds } } }
    );
  }
  // Borrar las recetas guardadas POR este usuario
  await SavedRecipe.deleteMany({ userId });
  await User.findByIdAndDelete(userId);
  return res.json({ ok: true });
}
