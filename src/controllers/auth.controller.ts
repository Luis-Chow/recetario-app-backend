import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { signToken } from '../utils/jwt';
import { serializeUser } from '../utils/serialize';

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'La contrasena es obligatoria.';
  if (password.length < 6) return 'La contrasena debe tener al menos 6 caracteres.';
  if (password.length > 64) return 'La contrasena no puede superar 64 caracteres.';
  if (/\s/.test(password)) return 'La contrasena no puede contener espacios.';
  return null;
}

function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string' || !email.trim()) return 'El correo es obligatorio.';
  if (email.length > 100) return 'El correo no puede superar 100 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Correo invalido.';
  return null;
}

export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  if (name.length > 50) {
    return res.status(400).json({ error: 'El nombre no puede superar 50 caracteres.' });
  }
  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });
  const passError = validatePassword(password);
  if (passError) return res.status(400).json({ error: passError });

  const normalizedEmail = (email as string).toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hash });
  const token = signToken(user._id.toString());

  return res.status(201).json({ user: serializeUser(user), token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Correo y contrasena son obligatorios.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(404).json({ error: 'No existe una cuenta con ese correo. Registrate primero.' });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'Contrasena incorrecta.' });
  }

  const token = signToken(user._id.toString());
  return res.json({ user: serializeUser(user), token });
}
