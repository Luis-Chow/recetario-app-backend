import { Schema, model, Document, Types } from 'mongoose';

export interface ISavedRecipe extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  recipeId: Types.ObjectId;
  groupIds: Types.ObjectId[];
  createdAt: Date;
}

const SavedRecipeSchema = new Schema<ISavedRecipe>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true, index: true },
    groupIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Group' }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// No permitir que el mismo usuario guarde la misma receta dos veces
SavedRecipeSchema.index({ userId: 1, recipeId: 1 }, { unique: true });

export const SavedRecipe = model<ISavedRecipe>('SavedRecipe', SavedRecipeSchema);
