import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

router.post('/register', (req, res, next) => {
  register(req, res).catch(next);
});
router.post('/login', (req, res, next) => {
  login(req, res).catch(next);
});

export default router;
