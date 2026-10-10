import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as taskController from '../controllers/taskController';

const router = Router();

// NOTE: the static `/stats/...` route must be declared before `/:id`
// so it isn't captured by the id parameter.
router.get('/stats/by-assignee', asyncHandler(taskController.stats));

router.get('/', asyncHandler(taskController.list));
router.post('/', asyncHandler(taskController.create));
router.get('/:id', asyncHandler(taskController.getOne));
router.put('/:id', asyncHandler(taskController.update));
router.patch('/:id/status', asyncHandler(taskController.updateStatus));
router.delete('/:id', asyncHandler(taskController.remove));

export default router;
