import { IUser } from '../models/User';
import { IRecipe } from '../models/Recipe';
import { IGroup } from '../models/Group';

export function serializeUser(u: IUser) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeRecipe(r: IRecipe) {
  return {
    id: r._id.toString(),
    userId: r.userId.toString(),
    title: r.title,
    description: r.description,
    ingredients: r.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
    steps: r.steps,
    prepTime: r.prepTime,
    servings: r.servings,
    isPublic: r.isPublic,
    groupIds: r.groupIds.map(g => g.toString()),
    createdAt: r.createdAt.toISOString(),
  };
}

export function serializeGroup(g: IGroup) {
  return {
    id: g._id.toString(),
    userId: g.userId.toString(),
    name: g.name,
    description: g.description,
    color: g.color,
    createdAt: g.createdAt.toISOString(),
  };
}
