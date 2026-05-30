import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addRecipeToGroup,
  removeRecipeFromGroup,
} from '../controllers/groups.controller';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res, next) => {
  listGroups(req as AuthRequest, res).catch(next);
});
router.post('/', (req, res, next) => {
  createGroup(req as AuthRequest, res).catch(next);
});
router.get('/:id', (req, res, next) => {
  getGroup(req as AuthRequest, res).catch(next);
});
router.patch('/:id', (req, res, next) => {
  updateGroup(req as AuthRequest, res).catch(next);
});
router.delete('/:id', (req, res, next) => {
  deleteGroup(req as AuthRequest, res).catch(next);
});
router.post('/:id/recipes/:recipeId', (req, res, next) => {
  addRecipeToGroup(req as AuthRequest, res).catch(next);
});
router.delete('/:id/recipes/:recipeId', (req, res, next) => {
  removeRecipeFromGroup(req as AuthRequest, res).catch(next);
});

export default router;
