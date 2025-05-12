// controllers/userController.js

// controllers/authController.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import validator from 'validator';
import crypto from 'crypto';

// Импорт утилит
import { setAuthCookies } from '../utils/jwtUtils.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../utils/cookies.js';
import { CSRF_COOKIE, getCookieOptions } from '../utils/csrf.js';

// --- Конфиг ---
const BCRYPT_ROUNDS = 12;
const CSRF_TOKEN_LENGTH = 64;

/* ------------------------------------------------------------------ */
/*  Registration & Login                                              */
/* ------------------------------------------------------------------ */
export const registerUser = async (req, res) => {
  try {
    // ✅ Расширяем деструктуризацию: добавляем `ref`
    const { username, email, password, ref } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: "Please fill all required fields" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user'
    });

    // ✅ Проверяем реферальный код и привязываем пригласившего
    if (ref) {
      const inviter = await User.findOne({ referralCode: ref.trim() });
      if (inviter) {
        newUser.referredBy = inviter._id;
      }
    }

    const savedUser = await newUser.save();

    const tokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        id: savedUser._id,
        role: savedUser.role,
        plan: savedUser.plan,
        planExpires: savedUser.planExpires ? savedUser.planExpires.getTime() : null
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { id: savedUser._id, tid: tokenId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store hashed refresh token + tid
    savedUser.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    savedUser.refreshTokenTid = tokenId;
    await savedUser.save();

    setAuthCookies(res, accessToken, refreshToken);

    // Генерируем CSRF-токен локально без импорта
    const csrfToken = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
    res.cookie(CSRF_COOKIE, csrfToken, getCookieOptions());

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        _id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email,
        role: savedUser.role,
        plan: savedUser.plan,
        planExpires: savedUser.planExpires
      }
    });
  } catch (error) {
    console.error("Register error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to register user"
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Account lock check
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(403).json({
        success: false,
        message: "Account is temporarily locked due to too many failed attempts."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLogins += 1;
      if (user.failedLogins >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
      }
      await user.save();
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Reset counters on success
    user.failedLogins = 0;
    user.lockUntil = null;

    const tokenId = crypto.randomUUID();
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        plan: user.plan,
        planExpires: user.planExpires ? user.planExpires.getTime() : null
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { id: user._id, tid: tokenId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.refreshTokenTid = tokenId;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    // Генерируем CSRF-токен локально без импорта
    const csrfToken = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
    res.cookie(CSRF_COOKIE, csrfToken, getCookieOptions());

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        currentStreak: user.currentStreak || 0,
        longestStreak: user.longestStreak || 0,
        role: user.role,
        plan: user.plan,
        planExpires: user.planExpires
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to login"
    });
  }
};

/* ------------------------------------------------------------------ */
/*  Profile                                                           */
/* ------------------------------------------------------------------ */
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile"
    });
  }
};

/**
 * Обновление профиля пользователя
 * Принимает username, email, newPassword
 */
export const updateUserProfile = async (req, res) => {
  try {
    const { username, email, newPassword } = req.body;
    const userId = req.user.id;

    // Build update object dynamically
    const updateData = {};
    if (username) updateData.username = username;

    if (email) {
      const normalized = email.toLowerCase();
      const exists = await User.findOne({ email: normalized, _id: { $ne: userId } });
      if (exists) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      updateData.email = normalized;
    }

    if (newPassword) {
      const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided" });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true
    }).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Error updating user profile:", err);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

export const logoutUser = async (req, res) => {
  try {
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE);

    await User.findByIdAndUpdate(req.user.id, {
      $unset: { refreshToken: '', refreshTokenTid: '' }
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to log out"
    });
  }
};
