const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");

const {
    createTask,
    listTasks,
    getTaskById,
    toggleTaskCompleted,
    deleteTask,
    updateTask,
    getStatistics,
  } = require("../controllers/taskController");

const taskRoutes = express.Router();

taskRoutes.post("/", authMiddleware, createTask);
taskRoutes.get("/", authMiddleware, listTasks);

taskRoutes.get("/statistics", authMiddleware, getStatistics);

taskRoutes.get("/:id", authMiddleware, getTaskById);
taskRoutes.patch("/:id/toggle", authMiddleware, toggleTaskCompleted);
taskRoutes.delete("/:id", authMiddleware, deleteTask);
taskRoutes.put("/:id", authMiddleware, updateTask);

module.exports = taskRoutes;