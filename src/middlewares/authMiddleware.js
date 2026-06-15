const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

async function authMiddleware(request, response, next) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return response.status(401).json({ message: "Token não informado." });
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      return response.status(401).json({ message: "Token inválido." });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    });

    if (!user) {
      return response.status(401).json({
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    request.userId = decoded.userId;

    return next();
  } catch (error) {
    return response.status(401).json({ message: "Token inválido." });
  }
}

module.exports = authMiddleware;
