import { Response } from 'express';
import { Types } from 'mongoose';
import { Recipe } from '../models/Recipe';
import { Group } from '../models/Group';
import { AuthRequest } from '../middleware/auth.middleware';
import { serializeRecipe } from '../utils/serialize';

const ES_COLLATION = { locale: 'es', strength: 2 } as const;

const MAX_PREP_TIME = 1440; // 24 horas en minutos
const MAX_SERVINGS = 100;

// Redondea a entero y recorta al rango [min, max]; usa fallback si no es numero.
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseIngredients(raw: unknown): { name: string; quantity: string; unit: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(i => i && typeof i.name === 'string' && i.name.trim())
    .map(i => ({
      name: String(i.name).trim().slice(0, 60),
      quantity: typeof i.quantity === 'string' ? i.quantity.slice(0, 10) : '',
      unit: typeof i.unit === 'string' ? i.unit.slice(0, 20) : '',
    }));
}

function parseSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => (s as string).slice(0, 500));
}

async function filterUserGroupIds(userId: string, raw: unknown): Promise<Types.ObjectId[]> {
  if (!Array.isArray(raw)) return [];
  const validIds = raw.filter(id => typeof id === 'string' && Types.ObjectId.isValid(id));
  if (validIds.length === 0) return [];
  const ownedGroups = await Group.find({ userId, _id: { $in: validIds } }).select('_id');
  return ownedGroups.map(g => g._id);
}

export async function listRecipes(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { mine, groupId } = req.query;

  const filter: Record<string, unknown> = {};
  if (mine === 'true') {
    filter.userId = userId;
  } else {
    filter.$or = [{ isPublic: true }, { userId }];
  }
  if (typeof groupId === 'string' && Types.ObjectId.isValid(groupId)) {
    filter.groupIds = groupId;
  }

  const recipes = await Recipe.find(filter).collation(ES_COLLATION).sort({ title: 1 });
  return res.json({ recipes: recipes.map(serializeRecipe) });
}

export async function getRecipe(req: AuthRequest, res: Response) {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  if (!recipe.isPublic && recipe.userId.toString() !== req.userId) {
    return res.status(403).json({ error: 'No tienes acceso a esta receta.' });
  }
  return res.json({ recipe: serializeRecipe(recipe) });
}

function validateImageString(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'Imagen invalida.' };
  if (!raw.startsWith('data:image/')) return { ok: false, error: 'La imagen debe ser un data URI valido.' };
  if (raw.length > 3_000_000) return { ok: false, error: 'La imagen es muy grande (max ~2MB).' };
  return { ok: true, value: raw };
}

export async function createRecipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { title, description, image, ingredients, steps, prepTime, servings, isPublic, groupIds } = req.body || {};

  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'El titulo es obligatorio.' });
  }
  if (title.length > 80) {
    return res.status(400).json({ error: 'El titulo no puede superar 80 caracteres.' });
  }
  const imgCheck = validateImageString(image);
  if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });

  const recipe = await Recipe.create({
    userId,
    title: title.trim(),
    description: typeof description === 'string' ? description.slice(0, 1000) : '',
    image: imgCheck.value,
    ingredients: parseIngredients(ingredients),
    steps: parseSteps(steps),
    prepTime: clampInt(prepTime, 0, MAX_PREP_TIME, 0),
    servings: clampInt(servings, 1, MAX_SERVINGS, 1),
    isPublic: Boolean(isPublic),
    groupIds: await filterUserGroupIds(userId, groupIds),
  });

  return res.status(201).json({ recipe: serializeRecipe(recipe) });
}

export async function updateRecipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  if (recipe.userId.toString() !== userId) {
    return res.status(403).json({ error: 'No puedes editar una receta que no es tuya.' });
  }

  const { title, description, image, ingredients, steps, prepTime, servings, isPublic, groupIds } = req.body || {};

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'El titulo es obligatorio.' });
    }
    if (title.length > 80) {
      return res.status(400).json({ error: 'El titulo no puede superar 80 caracteres.' });
    }
    recipe.title = title.trim();
  }
  if (description !== undefined) {
    recipe.description = typeof description === 'string' ? description.slice(0, 1000) : '';
  }
  if (image !== undefined) {
    const imgCheck = validateImageString(image);
    if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });
    recipe.image = imgCheck.value;
  }
  if (ingredients !== undefined) recipe.ingredients = parseIngredients(ingredients);
  if (steps !== undefined) recipe.steps = parseSteps(steps);
  if (prepTime !== undefined) {
    recipe.prepTime = clampInt(prepTime, 0, MAX_PREP_TIME, 0);
  }
  if (servings !== undefined) {
    recipe.servings = clampInt(servings, 1, MAX_SERVINGS, 1);
  }
  if (isPublic !== undefined) recipe.isPublic = Boolean(isPublic);
  if (groupIds !== undefined) {
    recipe.groupIds = await filterUserGroupIds(userId, groupIds);
  }

  await recipe.save();
  return res.json({ recipe: serializeRecipe(recipe) });
}

export async function deleteRecipe(req: AuthRequest, res: Response) {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  if (recipe.userId.toString() !== req.userId) {
    return res.status(403).json({ error: 'No puedes borrar una receta que no es tuya.' });
  }
  await recipe.deleteOne();
  return res.json({ ok: true });
}
