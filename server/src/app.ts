import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { authenticate, requireAdmin } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/errorHandler";
import authRoutes from "./routes/authRoutes";
import taskRoutes from "./routes/taskRoutes";
import projectRoutes from "./routes/projectRoutes";
import userRoutes from "./routes/userRoutes";
import internalNotificationRoutes from "./routes/internalNotificationRoutes";
import adminNotificationRoutes from "./routes/adminNotificationRoutes";
import { auditInternalPartnerRequest, authenticateInternalPartner } from "./middleware/internalPartner";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: ["https://pm.tomotek.vn", "http://localhost:5173"], // Cho phép domain frontend của anh
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Partner-Code", "X-Partner-Token"],
    }),
  );
  app.use('/api/v1/internal/notifications', auditInternalPartnerRequest);
  app.use(express.json({ limit: "12mb" }));

  app.get(["/api/health", "/health"], (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use(["/api/auth", "/auth"], authRoutes);
  app.use(
    "/api/v1/internal/notifications",
    authenticateInternalPartner,
    internalNotificationRoutes,
  );
  app.use(["/api/admin", "/admin"], authenticate, requireAdmin, adminNotificationRoutes);
  app.use(["/api/users", "/users"], authenticate, userRoutes);
  app.use(["/api/projects", "/projects"], authenticate, projectRoutes);
  // All task endpoints require a valid JWT.
  app.use(["/api/tasks", "/tasks"], authenticate, taskRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
