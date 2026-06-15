const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const jwt = require("jsonwebtoken");

async function register(request, response) {
  try {
    const { name, email, password } = request.body;

    if (!name || !email || !password) {
      return response.status(400).json({ message: "Preencha todos os campos." });
    }

    const userAlreadyExists = await prisma.user.findUnique({
      where: { email },
    });

    if (userAlreadyExists) {
      return response.status(400).json({ message: "Este e-mail já está em uso." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    return response.status(201).json({
      message: "Usuário criado com sucesso.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
} catch (error) {
    console.log(error);
    return response.status(500).json({ message: "Erro interno no servidor." });
  }
}

async function login(request, response) {
    try {
      const { email, password } = request.body;
  
      const user = await prisma.user.findUnique({
        where: {
          email,
        },
      });
  
      if (!user) {
        return response
          .status(400)
          .json({ message: "E-mail ou senha inválidos." });
      }
  
      const passwordMatch = await bcrypt.compare(
        password,
        user.password
      );
  
      if (!passwordMatch) {
        return response
          .status(400)
          .json({ message: "E-mail ou senha inválidos." });
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
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      console.log(error);
  
      return response
        .status(500)
        .json({ message: "Erro interno no servidor." });
    }
  }

  async function me(request, response) {
    try {
      const user = await prisma.user.findUnique({
        where: {
          id: request.userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
  
      if (!user) {
        return response.status(401).json({
          message: "Sessão inválida. Faça login novamente.",
        });
      }

      return response.json({ user });
    } catch (error) {
      console.log(error);
      return response.status(500).json({ message: "Erro interno no servidor." });
    }
  }

  module.exports = {
    register,
    login,
    me,
  };