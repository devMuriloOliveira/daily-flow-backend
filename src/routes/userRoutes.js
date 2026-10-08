const express = require("express");
const {
    register,
    login,
    me,
    updateSettings,
  } = require("../controllers/userController");
  const authMiddleware = require("../middlewares/authMiddleware");

const userRoutes = express.Router();

userRoutes.post("/register", register);

userRoutes.post("/login", login);

userRoutes.get("/me", authMiddleware, me);

userRoutes.patch("/settings", authMiddleware, updateSettings);

module.exports = userRoutes;
