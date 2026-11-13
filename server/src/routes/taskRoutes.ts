import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as taskController from '../controllers/taskController';
import * as taskFeaturesController from '../controllers/taskFeaturesController';
import * as taskPeriodReportController from '../controllers/taskPeriodReportController';
import * as dailyCheckinController from '../controllers/dailyCheckinController';

const router = Router();

// NOTE: the static `/stats/...` route must be declared before `/:id`
// so it isn't captured by the id parameter.
router.get('/stats/by-assignee', asyncHandler(taskController.stats));
router.get('/export', asyncHandler(taskFeaturesController.exportTasks));
router.get('/report/time', asyncHandler(taskPeriodReportController.getTimeReport));
router.get('/report/time/export', asyncHandler(taskPeriodReportController.exportTimeReport));
router.get('/daily-checkin/today', asyncHandler(dailyCheckinController.getToday));
router.post('/daily-checkin', asyncHandler(dailyCheckinController.save));
router.get('/daily-checkin/blockers', asyncHandler(dailyCheckinController.blockers));

router.get('/', asyncHandler(taskController.list));
router.post('/', asyncHandler(taskController.create));
router.get('/:id/comments', asyncHandler(taskFeaturesController.listComments));
router.post('/:id/comments', asyncHandler(taskFeaturesController.createComment));
router.put('/:id/comments/:commentId', asyncHandler(taskFeaturesController.updateComment));
router.delete('/:id/comments/:commentId', asyncHandler(taskFeaturesController.deleteComment));
router.get('/:id/subtasks', asyncHandler(taskFeaturesController.listSubtasks));
router.post('/:id/subtasks', asyncHandler(taskFeaturesController.createSubtask));
router.patch('/:id/subtasks/:subtaskId', asyncHandler(taskFeaturesController.updateSubtask));
router.delete('/:id/subtasks/:subtaskId', asyncHandler(taskFeaturesController.deleteSubtask));
router.get('/:id/history', asyncHandler(taskController.history));
router.get('/:id/attachments', asyncHandler(taskController.attachments));
router.post('/:id/attachments', asyncHandler(taskController.addAttachment));
router.get('/:id/attachments/:attachmentId/download', asyncHandler(taskController.downloadAttachment));
router.delete('/:id/attachments/:attachmentId', asyncHandler(taskController.deleteAttachment));
router.get('/:id', asyncHandler(taskController.getOne));
router.put('/:id', asyncHandler(taskController.update));
router.patch('/:id/status', asyncHandler(taskController.updateStatus));
router.delete('/:id', asyncHandler(taskController.remove));

export default router;
