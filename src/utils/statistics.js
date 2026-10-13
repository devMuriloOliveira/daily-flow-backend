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
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const weightedProgress =
    totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
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

module.exports = {
  calculatePeriodSummary,
  getPriorityCompletionByPriority,
  getPriorityDistribution,
};
