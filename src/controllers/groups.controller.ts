import { Response } from 'express';
import { Types } from 'mongoose';
import { Group } from '../models/Group';
import { Recipe } from '../models/Recipe';
import { SavedRecipe } from '../models/SavedRecipe';
import { AuthRequest } from '../middleware/auth.middleware';
import { serializeGroup, serializeRecipe } from '../utils/serialize';

const ES_COLLATION = { locale: 'es', strength: 2 } as const;

export async function listGroups(req: AuthRequest, res: Response) {
  const groups = await Group.find({ userId: req.userId })
    .collation(ES_COLLATION)
    .sort({ order: 1, name: 1 });
  return res.json({ groups: groups.map(serializeGroup) });
}

export async function reorderGroups(req: AuthRequest, res: Response) {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'Se esperaba un array "ids" con el orden.' });
  }
  const validIds = ids.filter(id => typeof id === 'string' && Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    return res.status(400).json({ error: 'Lista de ids vacia o invalida.' });
  }
  const owned = await Group.find({ userId: req.userId, _id: { $in: validIds } }).select('_id');
  const ownedSet = new Set(owned.map(g => g._id.toString()));
  await Promise.all(
    validIds
      .filter(id => ownedSet.has(id))
      .map((id, idx) => Group.updateOne({ _id: id, userId: req.userId }, { order: idx + 1 }))
  );
  const groups = await Group.find({ userId: req.userId })
    .collation(ES_COLLATION)
    .sort({ order: 1, name: 1 });
  return res.json({ groups: groups.map(serializeGroup) });
}

export async function getGroup(req: AuthRequest, res: Response) {
  const group = await Group.findOne({ _id: req.params.id, userId: req.userId });
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado.' });
  const recipes = await Recipe.find({ groupIds: group._id, userId: req.userId })
    .collation(ES_COLLATION)
    .sort({ title: 1 });
  return res.json({ group: serializeGroup(group), recipes: recipes.map(serializeRecipe) });
}

export async function createGroup(req: AuthRequest, res: Response) {
  const { name, description, color } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del grupo es obligatorio.' });
  }
  if (name.length > 50) {
    return res.status(400).json({ error: 'El nombre no puede superar 50 caracteres.' });
  }
  const duplicate = await Group.findOne({ userId: req.userId, name: name.trim() })
    .collation(ES_COLLATION);
  if (duplicate) {
    return res.status(409).json({ error: 'Ya tienes un grupo con ese nombre.' });
  }
  const group = await Group.create({
    userId: req.userId,
    name: name.trim(),
    description: typeof description === 'string' ? description.slice(0, 1000) : '',
    color: typeof color === 'string' && color.trim() ? color.trim().slice(0, 20) : '#888888',
  });
  return res.status(201).json({ group: serializeGroup(group) });
}

export async function updateGroup(req: AuthRequest, res: Response) {
  const group = await Group.findOne({ _id: req.params.id, userId: req.userId });
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado.' });

  const { name, description, color } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del grupo es obligatorio.' });
    }
    if (name.length > 50) {
      return res.status(400).json({ error: 'El nombre no puede superar 50 caracteres.' });
    }
    const trimmed = name.trim();
    if (trimmed.toLowerCase() !== group.name.toLowerCase()) {
      const duplicate = await Group.findOne({
        userId: req.userId,
        _id: { $ne: group._id },
        name: trimmed,
      }).collation(ES_COLLATION);
      if (duplicate) {
        return res.status(409).json({ error: 'Ya tienes un grupo con ese nombre.' });
      }
    }
    group.name = trimmed;
  }
  if (description !== undefined) {
    group.description = typeof description === 'string' ? description.slice(0, 1000) : '';
  }
  if (color !== undefined && typeof color === 'string' && color.trim()) {
    group.color = color.trim().slice(0, 20);
  }
  await group.save();
  return res.json({ group: serializeGroup(group) });
}

export async function deleteGroup(req: AuthRequest, res: Response) {
  const group = await Group.findOne({ _id: req.params.id, userId: req.userId });
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado.' });
  // Borrar las recetas propias asociadas al grupo + sus saved-by-others
  const ownedRecipes = await Recipe.find({ userId: req.userId, groupIds: group._id }).select('_id');
  const ownedRecipeIds = ownedRecipes.map(r => r._id);
  if (ownedRecipeIds.length > 0) {
    await SavedRecipe.deleteMany({ recipeId: { $in: ownedRecipeIds } });
    await Recipe.deleteMany({ _id: { $in: ownedRecipeIds } });
  }
  // Quitar la referencia al grupo de cualquier SavedRecipe del usuario
  await SavedRecipe.updateMany(
    { userId: req.userId, groupIds: group._id },
    { $pull: { groupIds: group._id } }
  );
  await group.deleteOne();
  return res.json({ ok: true });
}

export async function addRecipeToGroup(req: AuthRequest, res: Response) {
  const { id: groupId, recipeId } = req.params;
  if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(recipeId)) {
    return res.status(400).json({ error: 'Identificador invalido.' });
  }
  const group = await Group.findOne({ _id: groupId, userId: req.userId });
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado.' });
  const recipe = await Recipe.findOne({ _id: recipeId, userId: req.userId });
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });

  if (!recipe.groupIds.some(g => g.toString() === groupId)) {
    recipe.groupIds.push(group._id);
    await recipe.save();
  }
  return res.json({ recipe: serializeRecipe(recipe) });
}

export async function removeRecipeFromGroup(req: AuthRequest, res: Response) {
  const { id: groupId, recipeId } = req.params;
  if (!Types.ObjectId.isValid(groupId) || !Types.ObjectId.isValid(recipeId)) {
    return res.status(400).json({ error: 'Identificador invalido.' });
  }
  const group = await Group.findOne({ _id: groupId, userId: req.userId });
  if (!group) return res.status(404).json({ error: 'Grupo no encontrado.' });
  const recipe = await Recipe.findOne({ _id: recipeId, userId: req.userId });
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  recipe.groupIds = recipe.groupIds.filter(g => g.toString() !== groupId);
  await recipe.save();
  return res.json({ recipe: serializeRecipe(recipe) });
}
