const prisma = require("../lib/prisma");

const dayMap = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

function normalizeTime(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getDateOnly(date) {
  return date.toISOString().split("T")[0];
}

function getDayRange(date) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);

  return { start, end };
}

function isCycleActive(task, selectedDate) {
  if (!task.cycleStartDate || !task.activeDays || !task.restDays) {
    return false;
  }

  const start = new Date(task.cycleStartDate);
  const selected = new Date(selectedDate);

  start.setUTCHours(0, 0, 0, 0);
  selected.setUTCHours(0, 0, 0, 0);

  const diffInMs = selected.getTime() - start.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return false;
  }

  const cycleTotal = task.activeDays + task.restDays;
  const cyclePosition = diffInDays % cycleTotal;

  return cyclePosition < task.activeDays;
}

async function createTask(request, response) {
  try {
    const {
      title,
      description,
      date,
      time,
      endTime,
      recurrenceType = "week_days",
      weekDays = [],
      weekDayTimes = {},
      cycleStartDate,
      activeDays,
      restDays,
      showRestDays = false,
      priority = "medium",
      category,
    } = request.body;

    if (!title) {
      return response.status(400).json({
        message: "Título é obrigatório.",
      });
    }

    if (!["once", "week_days", "cycle"].includes(recurrenceType)) {
      return response.status(400).json({
        message: "Tipo de recorrência inválido.",
      });
    }

    if (recurrenceType === "once" && !date) {
      return response.status(400).json({
        message: "Data é obrigatória para tarefa única.",
      });
    }

    if (recurrenceType === "week_days" && weekDays.length === 0) {
      return response.status(400).json({
        message: "Escolha pelo menos um dia da semana.",
      });
    }

    if (recurrenceType === "cycle") {
      if (!cycleStartDate || !activeDays || !restDays) {
        return response.status(400).json({
          message: "Informe data inicial, dias ativos e dias de descanso.",
        });
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        date: date ? new Date(date) : null,
        time: normalizeTime(time),
        endTime: normalizeTime(endTime),
        recurrenceType,
        weekDays: recurrenceType === "week_days" ? JSON.stringify(weekDays) : null,
        weekDayTimes:
          recurrenceType === "week_days" ? JSON.stringify(weekDayTimes) : null,
        cycleStartDate:
          recurrenceType === "cycle" ? new Date(cycleStartDate) : null,
        activeDays: recurrenceType === "cycle" ? Number(activeDays) : null,
        restDays: recurrenceType === "cycle" ? Number(restDays) : null,
        showRestDays,
        priority,
        category,
        userId: request.userId,
      },
    });

    return response.status(201).json({
      message: "Tarefa criada com sucesso.",
      task,
    });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function listTasks(request, response) {
  try {
    const { date } = request.query;

    const tasks = await prisma.task.findMany({
      where: {
        userId: request.userId,
      },
      orderBy: [
        {
          priority: "asc",
        },
        {
          time: "asc",
        },
      ],
    });

    if (!date) {
      return response.json({ tasks });
    }

    const selectedDate = new Date(`${date}T00:00:00.000Z`);
    const selectedDay = dayMap[selectedDate.getUTCDay()];
    const { start, end } = getDayRange(date);

    const completions = await prisma.taskCompletion.findMany({
      where: {
        userId: request.userId,
        date: {
          gte: start,
          lte: end,
        },
      },
    });

    const completedTaskIds = completions.map((completion) => completion.taskId);

    const filteredTasks = tasks
      .filter((task) => {
        if (task.recurrenceType === "once") {
          if (!task.date) return false;

          const taskDate = getDateOnly(task.date);
          return taskDate === date;
        }

        if (task.recurrenceType === "week_days") {
          const weekDays = parseJson(task.weekDays, []);
          return weekDays.includes(selectedDay);
        }

        if (task.recurrenceType === "cycle") {
          return isCycleActive(task, selectedDate);
        }

        return false;
      })
      .map((task) => {
        let formattedTask = task;

        if (task.recurrenceType === "week_days") {
          const weekDayTimes = parseJson(task.weekDayTimes, {});
          const dayTime = weekDayTimes[selectedDay];

          if (dayTime) {
            formattedTask = {
              ...task,
              time: normalizeTime(dayTime.time),
              endTime: normalizeTime(dayTime.endTime),
            };
          }
        }

        return {
          ...formattedTask,
          isCompleted: completedTaskIds.includes(task.id),
        };
      });

    return response.json({ tasks: filteredTasks });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function getTaskById(request, response) {
  try {
    const { id } = request.params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!task) {
      return response.status(404).json({
        message: "Tarefa não encontrada.",
      });
    }

    return response.json({ task });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function toggleTaskCompleted(request, response) {
  try {
    const { id } = request.params;
    const { date } = request.body;

    if (!date) {
      return response.status(400).json({
        message: "Data é obrigatória para concluir tarefa.",
      });
    }

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!task) {
      return response.status(404).json({
        message: "Tarefa não encontrada.",
      });
    }

    const { start, end } = getDayRange(date);

    const existingCompletion = await prisma.taskCompletion.findFirst({
      where: {
        taskId: id,
        userId: request.userId,
        date: {
          gte: start,
          lte: end,
        },
      },
    });

    if (existingCompletion) {
      await prisma.taskCompletion.delete({
        where: {
          id: existingCompletion.id,
        },
      });

      return response.json({
        message: "Tarefa marcada como pendente.",
        isCompleted: false,
      });
    }

    const completion = await prisma.taskCompletion.create({
      data: {
        taskId: id,
        userId: request.userId,
        date: start,
      },
    });

    return response.json({
      message: "Tarefa concluída com sucesso.",
      isCompleted: true,
      completion,
    });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function deleteTask(request, response) {
  try {
    const { id } = request.params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!task) {
      return response.status(404).json({
        message: "Tarefa não encontrada.",
      });
    }

    await prisma.taskCompletion.deleteMany({
      where: {
        taskId: id,
        userId: request.userId,
      },
    });

    await prisma.task.delete({
      where: {
        id,
      },
    });

    return response.json({
      message: "Tarefa deletada com sucesso.",
    });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function updateTask(request, response) {
  try {
    const { id } = request.params;

    const {
      title,
      description,
      date,
      time,
      endTime,
      recurrenceType,
      weekDays = [],
      weekDayTimes = {},
      cycleStartDate,
      activeDays,
      restDays,
      showRestDays = false,
      priority = "medium",
      category,
    } = request.body;

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: request.userId,
      },
    });

    if (!task) {
      return response.status(404).json({
        message: "Tarefa não encontrada.",
      });
    }

    const updatedTask = await prisma.task.update({
      where: {
        id,
      },
      data: {
        title,
        description,
        date: date ? new Date(date) : null,
        time: normalizeTime(time),
        endTime: normalizeTime(endTime),
        recurrenceType,
        weekDays: recurrenceType === "week_days" ? JSON.stringify(weekDays) : null,
        weekDayTimes:
          recurrenceType === "week_days" ? JSON.stringify(weekDayTimes) : null,
        cycleStartDate:
          recurrenceType === "cycle" ? new Date(cycleStartDate) : null,
        activeDays: recurrenceType === "cycle" ? Number(activeDays) : null,
        restDays: recurrenceType === "cycle" ? Number(restDays) : null,
        showRestDays,
        priority,
        category,
      },
    });

    return response.json({
      message: "Tarefa atualizada com sucesso.",
      task: updatedTask,
    });
  } catch (error) {
    console.log(error);
    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

async function getStatistics(request, response) {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        userId: request.userId,
      },
    });

    const completions = await prisma.taskCompletion.findMany({
      where: {
        userId: request.userId,
      },
    });

    const totalTasks = tasks.length;
    const completedTasks = completions.length;

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    const weeklyCompleted = weekDays.map((label, index) => {
      const count = completions.filter((completion) => {
        const date = new Date(completion.date);
        return date.getUTCDay() === index;
      }).length;
    
      return {
        day: label,
        completed: count,
      };
    });

    const completedDates = [
      ...new Set(
        completions.map((completion) =>
          new Date(completion.date).toISOString().split("T")[0]
        )
      ),
    ];

    let currentStreak = 0;
    let currentDate = new Date(today);

    while (
      completedDates.includes(currentDate.toISOString().split("T")[0])
    ) {
      currentStreak++;
      currentDate.setDate(currentDate.getDate() - 1);
    }

    let bestStreak = 0;
    let tempStreak = 0;

    const sortedDates = completedDates.sort();

    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const previousDate = new Date(sortedDates[i - 1]);
        const current = new Date(sortedDates[i]);

        previousDate.setDate(previousDate.getDate() + 1);

        if (
          previousDate.toISOString().split("T")[0] ===
          current.toISOString().split("T")[0]
        ) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }

      if (tempStreak > bestStreak) {
        bestStreak = tempStreak;
      }
    }

    return response.json({
      totalTasks,
      completedTasks,
      completionRate,
      weeklyCompleted,
      currentStreak,
      bestStreak,
    });
  } catch (error) {
    console.log(error);

    return response.status(500).json({
      message: "Erro interno no servidor.",
    });
  }
}

module.exports = {
  createTask,
  listTasks,
  getTaskById,
  toggleTaskCompleted,
  deleteTask,
  updateTask,
  getStatistics,
};