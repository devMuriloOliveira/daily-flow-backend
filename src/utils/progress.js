const PRIORITY_WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1,
};

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

function roundProgress(value) {
  return Math.round(clampPercent(value));
}

function getTaskWeight(task) {
  return PRIORITY_WEIGHTS[task?.priority] || PRIORITY_WEIGHTS.medium;
}

function calculateSimpleCompletion(tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.isCompleted).length;
  const completionRate =
    totalTasks > 0 ? roundProgress((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    completionRate,
  };
}

function calculateWeightedProgress(tasks) {
  const totalWeight = tasks.reduce((sum, task) => sum + getTaskWeight(task), 0);
  const completedWeight = tasks.reduce((sum, task) => {
    return task.isCompleted ? sum + getTaskWeight(task) : sum;
  }, 0);
  const progressPercent =
    totalWeight > 0 ? roundProgress((completedWeight / totalWeight) * 100) : 0;

  return {
    totalWeight,
    completedWeight,
    progressPercent,
  };
}

function calculateDailyProgress(tasks, dailyCompletionGoal) {
  const simple = calculateSimpleCompletion(tasks);
  const weighted = calculateWeightedProgress(tasks);
  const goal = Number(dailyCompletionGoal) || 70;

  return {
    ...simple,
    ...weighted,
    dailyCompletionGoal: goal,
    goalReached: simple.totalTasks > 0 && weighted.progressPercent >= goal,
  };
}

module.exports = {
  PRIORITY_WEIGHTS,
  calculateDailyProgress,
  calculateSimpleCompletion,
  calculateWeightedProgress,
  roundProgress,
};
