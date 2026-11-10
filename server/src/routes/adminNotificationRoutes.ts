import { Router } from 'express';
import {
  mirroredEmployees,
  notificationHistory,
  notificationRecipients,
  sendAdminNotification,
} from '../controllers/notificationController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/notifications/recipients', asyncHandler(notificationRecipients));
router.get('/notifications/history', asyncHandler(notificationHistory));
router.post('/notifications/send', asyncHandler(sendAdminNotification));
router.get('/employees', asyncHandler(mirroredEmployees));

export default router;
