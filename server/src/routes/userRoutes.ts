import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as userController from '../controllers/userController';
import { requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/options', asyncHandler(userController.options));
router.use(requireAdmin);
router.get('/', asyncHandler(userController.list));
router.post('/', asyncHandler(userController.create));
router.put('/:id', asyncHandler(userController.update));
router.patch('/:id/status', asyncHandler(userController.updateStatus));
router.delete('/:id', asyncHandler(userController.remove));

export default router;