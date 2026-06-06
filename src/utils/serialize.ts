import { IUser } from '../models/User';
import { IRecipe } from '../models/Recipe';
import { IGroup } from '../models/Group';

export function serializeUser(u: IUser) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    avatar: u.avatar ?? '',
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeRecipe(r: IRecipe) {
  // Si el userId esta populated trae un objeto con name, sino solo el ObjectId
  const populated = r.userId as unknown as { _id: { toString(): string }; name?: string; avatar?: string };
  const isPopulated = populated && typeof populated === 'object' && 'name' in populated;
  const userIdStr = isPopulated ? populated._id.toString() : (r.userId as { toString(): string }).toString();
  const author = isPopulated
    ? { id: userIdStr, name: populated.name || '', avatar: populated.avatar || '' }
    : { id: userIdStr, name: '', avatar: '' };
  return {
    id: r._id.toString(),
    userId: userIdStr,
    author,
    title: r.title,
    description: r.description,
    image: r.image ?? '',
    images: r.images ?? [],
    order: r.order ?? 0,
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
    order: g.order ?? 0,
    createdAt: g.createdAt.toISOString(),
  };
}
