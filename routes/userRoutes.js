// backend/routes/userRoutes.js

import express from "express";
import { loginUser, registerUser, getUserProfile, updateUserProfile } from "../controllers/userController.js";
import { verifyToken } from '../middlewares/verifyToken.js';
import { celebrate } from "celebrate";
import { register, login, update } from "../validators/user.js";
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for login route to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // Max 20 requests per window
  message: {
    success: false,
    message: "Too many login attempts. Please try again later."
  }
});

// Включение loginLimiter только в production
const applyLoginLimiter = process.env.NODE_ENV === 'production' ? loginLimiter : (req, res, next) => next();

// Public routes with validation
router.post("/register", celebrate(register), registerUser);
router.post("/login", applyLoginLimiter, celebrate(login), loginUser);

// Protected routes
router.get("/profile", verifyToken, getUserProfile);
router.put("/profile", verifyToken, celebrate(update), updateUserProfile);

export default router;
