import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { authenticate } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import taskRoutes from './routes/taskRoutes';
import projectRoutes from './routes/projectRoutes';
import userRoutes from './routes/userRoutes';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', authenticate, userRoutes);
  app.use('/api/projects', authenticate, projectRoutes);
  // All task endpoints require a valid JWT.
  app.use('/api/tasks', authenticate, taskRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
