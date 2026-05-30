import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import recipesRoutes from './routes/recipes.routes';
import groupsRoutes from './routes/groups.routes';
import { notFound, errorHandler } from './middleware/error.middleware';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'recetas-backend' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/recipes', recipesRoutes);
  app.use('/api/groups', groupsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
