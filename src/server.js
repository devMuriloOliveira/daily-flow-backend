require("dotenv").config();

const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://daily-flow-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

function getAllowedOrigins() {
  return (process.env.CORS_ORIGIN || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || getAllowedOrigins().includes(origin)) {
      return callback(null, true);
    }

    const error = new Error("Origem não permitida pelo CORS.");
    error.statusCode = 403;
    return callback(error);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get("/", (request, response) => {
  return response.json({
    message: "Daily Flow API is running",
  });
});

app.get("/healthz", (request, response) => {
  return response.status(200).json({
    status: "ok",
    service: "daily-flow-backend",
  });
});

app.use("/users", userRoutes);
app.use("/tasks", taskRoutes);

app.use((error, request, response, next) => {
  if (error?.statusCode === 403) {
    return response.status(403).json({
      message: error.message,
    });
  }

  return next(error);
});

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || "0.0.0.0";

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
