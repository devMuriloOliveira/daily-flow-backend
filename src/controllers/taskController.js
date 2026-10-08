const prisma = require("../lib/prisma");
const { calculateDailyProgress } = require("../utils/progress");

const DEFAULT_DAILY_COMPLETION_GOAL = 70;

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

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate;
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const weekDay = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][
    date.getUTCDay()
  ];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${weekDay} ${day}/${month}`;
}

function getLastPeriodDates(days) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const startDate = addDays(today, -(days - 1));

  return Array.from({ length: days }, (_, index) => {
    return getDateOnly(addDays(startDate, index));
  });
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

async function getTasksForDate(userId, date) {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
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

  const selectedDate = new Date(`${date}T00:00:00.000Z`);
  const selectedDay = dayMap[selectedDate.getUTCDay()];
  const { start, end } = getDayRange(date);

  const completions = await prisma.taskCompletion.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end,
      },
    },
  });

  const completedTaskIds = completions.map((completion) => completion.taskId);

  return tasks
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
}

async function getDailyCompletionGoal(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        dailyCompletionGoal: true,
      },
    });

    return user?.dailyCompletionGoal || DEFAULT_DAILY_COMPLETION_GOAL;
  } catch (error) {
    if (error.code !== "P2022") {
      throw error;
    }

    return DEFAULT_DAILY_COMPLETION_GOAL;
  }
}

function getPriorityDistribution(days) {
  return days.reduce(
    (distribution, day) => {
      day.tasks.forEach((task) => {
        if (task.priority === "high") {
          distribution.high += 1;
        } else if (task.priority === "low") {
          distribution.low += 1;
        } else {
          distribution.medium += 1;
        }
      });

      return distribution;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

function getPriorityCompletionByPriority(days) {
  return days.reduce(
    (completionByPriority, day) => {
      day.tasks.forEach((task) => {
        const priority = ["high", "medium", "low"].includes(task.priority)
          ? task.priority
          : "medium";

        completionByPriority[priority].total += 1;

        if (task.isCompleted) {
          completionByPriority[priority].completed += 1;
        }
      });

      return completionByPriority;
    },
    {
      high: { total: 0, completed: 0 },
      medium: { total: 0, completed: 0 },
      low: { total: 0, completed: 0 },
    }
  );
}

function calculatePeriodSummary(days) {
  const activeDays = days.filter((day) => day.totalTasks > 0);
  const goalReachedDays = activeDays.filter((day) => day.goalReached).length;
  const totalTasks = days.reduce((sum, day) => sum + day.totalTasks, 0);
  const completedTasks = days.reduce((sum, day) => sum + day.completedTasks, 0);
  const totalWeight = days.reduce((sum, day) => sum + day.totalWeight, 0);
  const completedWeight = days.reduce((sum, day) => sum + day.completedWeight, 0);
  const completionRate =
    totalTasks > 0
      ? Math.round(Math.min(100, Math.max(0, (completedTasks / totalTasks) * 100)))
      : 0;
  const weightedProgress =
    totalWeight > 0
      ? Math.round(Math.min(100, Math.max(0, (completedWeight / totalWeight) * 100)))
      : 0;
  const averageWeightedProgress =
    activeDays.length > 0
      ? Math.round(
          activeDays.reduce((sum, day) => sum + day.weightedProgress, 0) /
            activeDays.length
        )
      : 0;
  const goalReachedRate =
    activeDays.length > 0
      ? Math.round((goalReachedDays / activeDays.length) * 100)
      : 0;
  const bestDay =
    activeDays.reduce((best, day) => {
      if (!best || day.weightedProgress > best.weightedProgress) {
        return day;
      }

      return best;
    }, null) || null;

  return {
    totalTasks,
    completedTasks,
    completionRate,
    weightedProgress,
    activeDays: activeDays.length,
    averageWeightedProgress,
    goalReachedDays,
    goalReachedRate,
    bestDay: bestDay
      ? {
          date: bestDay.date,
          label: bestDay.label,
          weightedProgress: bestDay.weightedProgress,
        }
      : null,
  };
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

    const filteredTasks = await getTasksForDate(request.userId, date);

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
    const requestedPeriod = Number(request.query.period) || 7;
    const periodDays = requestedPeriod === 30 ? 30 : 7;
    const dailyCompletionGoal = await getDailyCompletionGoal(request.userId);
    const periodDates = getLastPeriodDates(periodDays);
    const days = await Promise.all(
      periodDates.map(async (date) => {
        const tasks = await getTasksForDate(request.userId, date);
        const dailyProgress = calculateDailyProgress(tasks, dailyCompletionGoal);

        return {
          date,
          label: formatDateLabel(date),
          totalTasks: dailyProgress.totalTasks,
          completedTasks: dailyProgress.completedTasks,
          completionRate: dailyProgress.completionRate,
          weightedProgress: dailyProgress.progressPercent,
          totalWeight: dailyProgress.totalWeight,
          completedWeight: dailyProgress.completedWeight,
          dailyCompletionGoal,
          goalReached: dailyProgress.goalReached,
          tasks,
        };
      })
    );

    const summary = calculatePeriodSummary(days);
    const priorityDistribution = getPriorityDistribution(days);
    const priorityCompletion = getPriorityCompletionByPriority(days);
    const chartDays = days.map(({ tasks, ...day }) => day);

    return response.json({
      period: {
        days: periodDays,
        startDate: periodDates[0],
        endDate: periodDates[periodDates.length - 1],
      },
      totalTasks: summary.totalTasks,
      completedTasks: summary.completedTasks,
      completionRate: summary.completionRate,
      weightedProgress: summary.weightedProgress,
      dailyCompletionGoal,
      goalReachedDays: summary.goalReachedDays,
      goalReachedRate: summary.goalReachedRate,
      activeDays: summary.activeDays,
      averageWeightedProgress: summary.averageWeightedProgress,
      bestDay: summary.bestDay,
      priorityDistribution,
      priorityCompletion,
      days: chartDays,
      weeklyCompleted: chartDays.map((day) => ({
        day: day.label,
        completed: day.completedTasks,
      })),
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
