const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const jwt = require("jsonwebtoken");

const DEFAULT_DAILY_COMPLETION_GOAL = 70;

function selectPublicUser(includeDailyCompletionGoal = true) {
  return {
    id: true,
    name: true,
    email: true,
    ...(includeDailyCompletionGoal ? { dailyCompletionGoal: true } : {}),
    createdAt: true,
  };
}

function formatPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    dailyCompletionGoal: user.dailyCompletionGoal || DEFAULT_DAILY_COMPLETION_GOAL,
  };
}

async function findUserByEmail(email) {
  try {
    return await prisma.user.findUnique({
      where: {
        email,
      },
    });
  } catch (error) {
    if (error.code !== "P2022") {
      throw error;
    }

    return prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
      },
    });
  }
}

async function findPublicUserById(id) {
  try {
    return await prisma.user.findUnique({
      where: {
        id,
      },
      select: selectPublicUser(),
    });
  } catch (error) {
    if (error.code !== "P2022") {
      throw error;
    }

    return prisma.user.findUnique({
      where: {
        id,
      },
      select: selectPublicUser(false),
    });
  }
}

async function register(request, response) {
  try {
    const { name, email, password } = request.body;

    if (!name || !email || !password) {
      return response.status(400).json({ message: "Preencha todos os campos." });
    }

    const userAlreadyExists = await findUserByEmail(email);

    if (userAlreadyExists) {
      return response.status(400).json({ message: "Este e-mail já está em uso." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let user;

    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          dailyCompletionGoal: DEFAULT_DAILY_COMPLETION_GOAL,
        },
      });
    } catch (error) {
      if (error.code !== "P2022") {
        throw error;
      }

      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        },
      });
    }

    return response.status(201).json({
      message: "Usuário criado com sucesso.",
      user: formatPublicUser(user),
    });
  } catch (error) {
    if (error.code === "P2022") {
      return response.status(409).json({
        message:
          "A configuração de meta diária ainda não existe no banco. Execute as migrations do Prisma.",
      });
    }

    console.log(error);
    return response.status(500).json({ message: "Erro interno no servidor." });
  }
}

async function login(request, response) {
  try {
    const { email, password } = request.body;

    const user = await findUserByEmail(email);

    if (!user) {
      return response.status(400).json({ message: "E-mail ou senha inválidos." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return response.status(400).json({ message: "E-mail ou senha inválidos." });
    }

    const token = jwt.sign(
      {
        userId: user.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return response.json({
      token,
      user: formatPublicUser(user),
    });
  } catch (error) {
    console.log(error);

    return response.status(500).json({ message: "Erro interno no servidor." });
  }
}

async function me(request, response) {
  try {
    const user = await findPublicUserById(request.userId);

    if (!user) {
      return response.status(401).json({
        message: "Sessão inválida. Faça login novamente.",
      });
    }

    return response.json({ user });
  } catch (error) {
    if (error.code === "P2022") {
      return response.status(409).json({
        message:
          "A configuração de meta diária ainda não existe no banco. Execute as migrations do Prisma.",
      });
    }

    console.log(error);
    return response.status(500).json({ message: "Erro interno no servidor." });
  }
}

async function updateSettings(request, response) {
  try {
    const dailyCompletionGoal = Number(request.body.dailyCompletionGoal);

    if (
      !Number.isInteger(dailyCompletionGoal) ||
      dailyCompletionGoal < 1 ||
      dailyCompletionGoal > 100
    ) {
      return response.status(400).json({
        message: "A meta diária deve ser um número inteiro entre 1 e 100.",
      });
    }

    const user = await prisma.user.update({
      where: {
        id: request.userId,
      },
      data: {
        dailyCompletionGoal,
      },
      select: selectPublicUser(),
    });

    return response.json({
      message: "Configurações atualizadas com sucesso.",
      user,
    });
  } catch (error) {
    if (error.code === "P2022") {
      return response.status(409).json({
        message:
          "A configuração de meta diária ainda não existe no banco. Execute as migrations do Prisma.",
      });
    }

    console.log(error);
    return response.status(500).json({ message: "Erro interno no servidor." });
  }
}

module.exports = {
  register,
  login,
  me,
  updateSettings,
};
