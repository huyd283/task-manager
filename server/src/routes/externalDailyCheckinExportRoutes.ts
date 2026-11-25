import { Router } from 'express';
import { exportDailyCheckin } from '../controllers/externalDailyCheckinExportController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/dashboard', asyncHandler(exportDailyCheckin));

export default router;
