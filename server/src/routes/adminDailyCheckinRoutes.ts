import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as adminDailyCheckinController from '../controllers/adminDailyCheckinController';

const router = Router();

router.get('/stats', asyncHandler(adminDailyCheckinController.stats));
router.post('/reminders', asyncHandler(adminDailyCheckinController.remindEmployee));
router.get('/blockers', asyncHandler(adminDailyCheckinController.listBlockers));
router.get('/blockers/:blockerId', asyncHandler(adminDailyCheckinController.getBlocker));
router.patch('/blockers/:blockerId', asyncHandler(adminDailyCheckinController.updateBlocker));
router.post('/blockers/:blockerId/comments', asyncHandler(adminDailyCheckinController.addBlockerComment));
router.patch('/:userId/feedback', asyncHandler(adminDailyCheckinController.saveBlockerFeedback));
router.get('/:userId', asyncHandler(adminDailyCheckinController.employeeDetail));

export default router;
