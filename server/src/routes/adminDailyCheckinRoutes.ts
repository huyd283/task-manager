import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as adminDailyCheckinController from '../controllers/adminDailyCheckinController';

const router = Router();

router.get('/stats', asyncHandler(adminDailyCheckinController.stats));
router.patch('/:userId/feedback', asyncHandler(adminDailyCheckinController.saveBlockerFeedback));
router.get('/:userId', asyncHandler(adminDailyCheckinController.employeeDetail));

export default router;
