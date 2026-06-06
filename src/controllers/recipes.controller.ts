import { Response } from 'express';
import { Types } from 'mongoose';
import { Recipe } from '../models/Recipe';
import { Group } from '../models/Group';
import { SavedRecipe } from '../models/SavedRecipe';
import { AuthRequest } from '../middleware/auth.middleware';
import { serializeRecipe } from '../utils/serialize';

const ES_COLLATION = { locale: 'es', strength: 2 } as const;

const MAX_PREP_TIME = 1440;
const MAX_SERVINGS = 100;
const MAX_INGREDIENTS = 50;
const MAX_STEPS = 100;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function validatePositiveInt(value: unknown, min: number, max: number, label: string)
  : { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, error: `${label} es obligatorio.` };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${label} debe ser un numero entero.` };
  }
  if (n < min) return { ok: false, error: `${label} debe ser >= ${min}.` };
  if (n > max) return { ok: false, error: `${label} debe ser <= ${max}.` };
  return { ok: true, value: n };
}

function parseIngredients(raw: unknown): { name: string; quantity: string; unit: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_INGREDIENTS)
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
    .slice(0, MAX_STEPS)
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

  // Mapa de recetas guardadas por el usuario: recipeId -> savedGroupIds
  const savedDocs = await SavedRecipe.find({ userId });
  const savedMap = new Map<string, string[]>();
  for (const s of savedDocs) {
    savedMap.set(s.recipeId.toString(), s.groupIds.map(g => g.toString()));
  }

  if (mine === 'true') {
    const own = await Recipe.find({ userId })
      .populate('userId', 'name avatar')
      .collation(ES_COLLATION)
      .sort({ order: 1, title: 1 });

    let savedRecipes: any[] = [];
    if (savedDocs.length > 0) {
      const savedIds = savedDocs.map(s => s.recipeId);
      savedRecipes = await Recipe.find({ _id: { $in: savedIds } })
        .populate('userId', 'name avatar')
        .collation(ES_COLLATION)
        .sort({ title: 1 });
    }

    const ownSerialized = own.map(r => ({ ...serializeRecipe(r), isSaved: false }));
    const savedSerialized = savedRecipes.map(r => {
      const s = serializeRecipe(r);
      const savedGroupIds = savedMap.get(s.id) || [];
      return { ...s, groupIds: savedGroupIds, isSaved: true };
    });

    let combined = [...ownSerialized, ...savedSerialized]
      .sort((a, b) => {
        const ao = a.order || 0;
        const bo = b.order || 0;
        if (ao === 0 && bo === 0) {
          return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
        }
        if (ao === 0) return 1;
        if (bo === 0) return -1;
        return ao - bo;
      });

    if (typeof groupId === 'string' && Types.ObjectId.isValid(groupId)) {
      combined = combined.filter(r => r.groupIds.includes(groupId));
    }
    return res.json({ recipes: combined });
  }

  // Feed general: publicas + propias. Las guardadas no entran aqui automaticamente.
  const filter: Record<string, unknown> = {
    $or: [{ isPublic: true }, { userId }],
  };
  if (typeof groupId === 'string' && Types.ObjectId.isValid(groupId)) {
    filter.groupIds = groupId;
  }

  const recipes = await Recipe.find(filter)
    .populate('userId', 'name avatar')
    .collation(ES_COLLATION)
    .sort({ title: 1 });
  return res.json({
    recipes: recipes.map(r => ({ ...serializeRecipe(r), isSaved: savedMap.has(r._id.toString()) })),
  });
}

export async function getRecipe(req: AuthRequest, res: Response) {
  const recipe = await Recipe.findById(req.params.id).populate('userId', 'name avatar');
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  const ownerId = (recipe.userId as unknown as { _id?: { toString(): string } })._id
    ?? recipe.userId;
  if (!recipe.isPublic && ownerId.toString() !== req.userId) {
    return res.status(403).json({ error: 'No tienes acceso a esta receta.' });
  }
  const saved = await SavedRecipe.findOne({ userId: req.userId, recipeId: recipe._id });
  const out = { ...serializeRecipe(recipe), isSaved: !!saved };
  if (saved) {
    out.groupIds = saved.groupIds.map(g => g.toString());
  }
  return res.json({ recipe: out });
}

const MAX_EXTRA_IMAGES = 5;

const DATA_URI_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function validateImageString(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'Imagen invalida.' };
  if (!DATA_URI_IMAGE.test(raw)) return { ok: false, error: 'La imagen debe ser un data URI valido (png/jpeg/gif/webp en base64).' };
  if (raw.length > 3_000_000) return { ok: false, error: 'La imagen es muy grande (max ~2MB).' };
  return { ok: true, value: raw };
}

function validateImagesArray(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'images debe ser un array.' };
  if (raw.length > MAX_EXTRA_IMAGES) {
    return { ok: false, error: `Maximo ${MAX_EXTRA_IMAGES} imagenes extra.` };
  }
  const out: string[] = [];
  for (const img of raw) {
    const check = validateImageString(img);
    if (!check.ok) return { ok: false, error: check.error };
    if (check.value) out.push(check.value);
  }
  return { ok: true, value: out };
}

export async function createRecipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { title, description, image, images, ingredients, steps, prepTime, servings, isPublic, groupIds } = req.body || {};

  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'El titulo es obligatorio.' });
  }
  if (title.length > 80) {
    return res.status(400).json({ error: 'El titulo no puede superar 80 caracteres.' });
  }
  if (CONTROL_CHARS.test(title)) {
    return res.status(400).json({ error: 'El titulo contiene caracteres invalidos.' });
  }
  const prepCheck = validatePositiveInt(prepTime, 1, MAX_PREP_TIME, 'prepTime');
  if (!prepCheck.ok) return res.status(400).json({ error: prepCheck.error });
  const servCheck = validatePositiveInt(servings, 1, MAX_SERVINGS, 'servings');
  if (!servCheck.ok) return res.status(400).json({ error: servCheck.error });
  const imgCheck = validateImageString(image);
  if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });
  const imagesCheck = validateImagesArray(images);
  if (!imagesCheck.ok) return res.status(400).json({ error: imagesCheck.error });

  const recipe = await Recipe.create({
    userId,
    title: title.trim(),
    description: typeof description === 'string' ? description.slice(0, 1000) : '',
    image: imgCheck.value,
    images: imagesCheck.value,
    ingredients: parseIngredients(ingredients),
    steps: parseSteps(steps),
    prepTime: prepCheck.value,
    servings: servCheck.value,
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

  const { title, description, image, images, ingredients, steps, prepTime, servings, isPublic, groupIds } = req.body || {};

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'El titulo es obligatorio.' });
    }
    if (title.length > 80) {
      return res.status(400).json({ error: 'El titulo no puede superar 80 caracteres.' });
    }
    if (CONTROL_CHARS.test(title)) {
      return res.status(400).json({ error: 'El titulo contiene caracteres invalidos.' });
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
  if (images !== undefined) {
    const imagesCheck = validateImagesArray(images);
    if (!imagesCheck.ok) return res.status(400).json({ error: imagesCheck.error });
    recipe.images = imagesCheck.value;
  }
  if (ingredients !== undefined) recipe.ingredients = parseIngredients(ingredients);
  if (steps !== undefined) recipe.steps = parseSteps(steps);
  if (prepTime !== undefined) {
    const check = validatePositiveInt(prepTime, 1, MAX_PREP_TIME, 'prepTime');
    if (!check.ok) return res.status(400).json({ error: check.error });
    recipe.prepTime = check.value;
  }
  if (servings !== undefined) {
    const check = validatePositiveInt(servings, 1, MAX_SERVINGS, 'servings');
    if (!check.ok) return res.status(400).json({ error: check.error });
    recipe.servings = check.value;
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
  await SavedRecipe.deleteMany({ recipeId: recipe._id });
  await recipe.deleteOne();
  return res.json({ ok: true });
}

export async function saveRecipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const recipeId = req.params.id;
  if (!Types.ObjectId.isValid(recipeId)) {
    return res.status(400).json({ error: 'Identificador invalido.' });
  }
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  if (recipe.userId.toString() === userId) {
    return res.status(400).json({ error: 'No puedes guardar tu propia receta.' });
  }
  if (!recipe.isPublic) {
    return res.status(403).json({ error: 'No puedes guardar una receta privada.' });
  }

  const validGroupIds = await filterUserGroupIds(userId, req.body?.groupIds);

  const saved = await SavedRecipe.findOneAndUpdate(
    { userId, recipeId: recipe._id },
    { userId, recipeId: recipe._id, groupIds: validGroupIds },
    { new: true, upsert: true }
  );

  return res.json({
    saved: {
      id: saved._id.toString(),
      recipeId: saved.recipeId.toString(),
      groupIds: saved.groupIds.map(g => g.toString()),
    },
  });
}

export async function reorderRecipes(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'Se esperaba un array "ids" con el orden.' });
  }
  const validIds = ids.filter(id => typeof id === 'string' && Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    return res.status(400).json({ error: 'Lista de ids vacia o invalida.' });
  }
  const owned = await Recipe.find({ userId, _id: { $in: validIds } }).select('_id');
  const ownedSet = new Set(owned.map(r => r._id.toString()));
  await Promise.all(
    validIds
      .filter(id => ownedSet.has(id))
      .map((id, idx) => Recipe.updateOne({ _id: id, userId }, { order: idx + 1 }))
  );
  return res.json({ ok: true });
}

export async function unsaveRecipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const recipeId = req.params.id;
  if (!Types.ObjectId.isValid(recipeId)) {
    return res.status(400).json({ error: 'Identificador invalido.' });
  }
  const result = await SavedRecipe.deleteOne({ userId, recipeId });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'No tienes esta receta guardada.' });
  }
  return res.json({ ok: true });
}
