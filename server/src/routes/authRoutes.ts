import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import {
	login,
	me,
	requestRegistrationOtp,
	resendRegistrationOtp,
	verifyRegistrationOtp,
} from '../controllers/authController';

const router = Router();

router.post('/register/request-otp', asyncHandler(requestRegistrationOtp));
router.post('/register/resend-otp', asyncHandler(resendRegistrationOtp));
router.post('/register/verify-otp', asyncHandler(verifyRegistrationOtp));
router.post('/login', asyncHandler(login));
router.get('/me', authenticate, asyncHandler(me));

export default router;
