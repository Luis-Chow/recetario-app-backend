import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { getMe, updateMe, deleteMe } from '../controllers/users.controller';

const router = Router();

router.use(requireAuth);

router.get('/me', (req, res, next) => {
  getMe(req as AuthRequest, res).catch(next);
});
router.patch('/me', (req, res, next) => {
  updateMe(req as AuthRequest, res).catch(next);
});
router.delete('/me', (req, res, next) => {
  deleteMe(req as AuthRequest, res).catch(next);
});

export default router;
