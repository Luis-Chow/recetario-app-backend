import { Schema, model, Document, Types } from 'mongoose';

export interface IIngredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface IRecipe extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description: string;
  ingredients: IIngredient[];
  steps: string[];
  prepTime: number;
  servings: number;
  isPublic: boolean;
  groupIds: Types.ObjectId[];
  createdAt: Date;
}

const IngredientSchema = new Schema<IIngredient>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    quantity: { type: String, default: '', maxlength: 10 },
    unit: { type: String, default: '', maxlength: 20 },
  },
  { _id: false }
);

const RecipeSchema = new Schema<IRecipe>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 1000 },
    ingredients: { type: [IngredientSchema], default: [] },
    steps: { type: [{ type: String, maxlength: 500 }], default: [] },
    prepTime: { type: Number, default: 0, min: 0 },
    servings: { type: Number, default: 1, min: 1 },
    isPublic: { type: Boolean, default: false },
    groupIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Group' }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Recipe = model<IRecipe>('Recipe', RecipeSchema);
