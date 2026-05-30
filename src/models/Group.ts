import { Schema, model, Document, Types } from 'mongoose';

export interface IGroup extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description: string;
  color: string;
  createdAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    description: { type: String, default: '', maxlength: 1000 },
    color: { type: String, default: '#888888' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Group = model<IGroup>('Group', GroupSchema);
