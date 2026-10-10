import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as projectController from '../controllers/projectController';

const router = Router();

router.get('/', asyncHandler(projectController.list));
router.post('/', asyncHandler(projectController.create));
router.get('/:id', asyncHandler(projectController.getOne));
router.put('/:id', asyncHandler(projectController.update));
router.delete('/:id', asyncHandler(projectController.remove));
router.post('/:id/members', asyncHandler(projectController.addMember));
router.delete('/:id/members/:userId', asyncHandler(projectController.removeMember));

export default router;