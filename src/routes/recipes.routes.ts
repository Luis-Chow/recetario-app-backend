import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from '../controllers/recipes.controller';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res, next) => {
  listRecipes(req as AuthRequest, res).catch(next);
});
router.post('/', (req, res, next) => {
  createRecipe(req as AuthRequest, res).catch(next);
});
router.get('/:id', (req, res, next) => {
  getRecipe(req as AuthRequest, res).catch(next);
});
router.patch('/:id', (req, res, next) => {
  updateRecipe(req as AuthRequest, res).catch(next);
});
router.delete('/:id', (req, res, next) => {
  deleteRecipe(req as AuthRequest, res).catch(next);
});

export default router;
