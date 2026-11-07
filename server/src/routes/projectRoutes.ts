import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as projectController from '../controllers/projectController';
import * as taskFeaturesController from '../controllers/taskFeaturesController';

const router = Router();

router.get('/', asyncHandler(projectController.list));
router.post('/', asyncHandler(projectController.create));
router.get('/:projectId/members/options', asyncHandler(taskFeaturesController.projectMembers));
router.get('/:projectId/sprints', asyncHandler(taskFeaturesController.listSprints));
router.post('/:projectId/sprints', asyncHandler(taskFeaturesController.createSprint));
router.patch('/:projectId/sprints/:sprintId/status', asyncHandler(taskFeaturesController.updateSprintStatus));
router.post('/:projectId/sprints/:sprintId/tasks', asyncHandler(taskFeaturesController.assignSprintTask));
router.delete('/:projectId/sprints/:sprintId/tasks/:taskId', asyncHandler(taskFeaturesController.removeSprintTask));
router.get('/:id', asyncHandler(projectController.getOne));
router.put('/:id', asyncHandler(projectController.update));
router.delete('/:id', asyncHandler(projectController.remove));
router.post('/:id/members', asyncHandler(projectController.addMember));
router.delete('/:id/members/:userId', asyncHandler(projectController.removeMember));
router.patch('/:id/settings', asyncHandler(projectController.updateSettings));

export default router;