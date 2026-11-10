import { Router } from 'express';
import { sendNotification } from '../controllers/notificationController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/send', asyncHandler(sendNotification));

export default router;
