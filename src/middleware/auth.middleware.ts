import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de autenticacion.' });
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
  try {
    const exists = await User.exists({ _id: payload.userId });
    if (!exists) {
      return res.status(401).json({ error: 'La cuenta asociada al token ya no existe.' });
    }
  } catch (e) {
    return next(e);
  }
  req.userId = payload.userId;
  next();
}
