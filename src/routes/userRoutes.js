const express = require("express");
const {
    register,
    login,
    me,
  } = require("../controllers/userController");
  const authMiddleware = require("../middlewares/authMiddleware");

const userRoutes = express.Router();

userRoutes.post("/register", register);

userRoutes.post("/login", login);

userRoutes.get("/me", authMiddleware, me);

module.exports = userRoutes;