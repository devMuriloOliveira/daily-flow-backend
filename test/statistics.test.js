const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateDailyProgress } = require("../src/utils/progress");
const statistics = require("../src/utils/statistics");

function day(overrides) {
  return {
    date: "2026-10-13",
    label: "Ter 13/10",
    totalTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    weightedProgress: 0,
    totalWeight: 0,
    completedWeight: 0,
    goalReached: false,
    tasks: [],
    ...overrides,
  };
}

test("daily progress handles an empty task list", () => {
  assert.deepEqual(calculateDailyProgress([], 70), {
    totalTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    totalWeight: 0,
    completedWeight: 0,
    progressPercent: 0,
    dailyCompletionGoal: 70,
    goalReached: false,
  });
});

test("daily progress counts pending and completed tasks from the same task list", () => {
  const result = calculateDailyProgress([
    { id: "a", priority: "high", isCompleted: true },
    { id: "b", priority: "medium", isCompleted: false },
    { id: "c", priority: "low", isCompleted: true },
  ], 60);

  assert.equal(result.totalTasks, 3);
  assert.equal(result.completedTasks, 2);
  assert.equal(result.completionRate, 67);
  assert.equal(result.totalWeight, 6);
  assert.equal(result.completedWeight, 4);
  assert.equal(result.progressPercent, 67);
  assert.equal(result.goalReached, true);
});

test("period summary uses only the days inside the selected period", () => {
  const summary = statistics.calculatePeriodSummary([
    day({ totalTasks: 2, completedTasks: 1, totalWeight: 4, completedWeight: 3, weightedProgress: 75, goalReached: true }),
    day({ totalTasks: 3, completedTasks: 0, totalWeight: 6, completedWeight: 0, weightedProgress: 0, goalReached: false }),
    day({ totalTasks: 0, completedTasks: 0, totalWeight: 0, completedWeight: 0, weightedProgress: 0, goalReached: false }),
  ]);

  assert.equal(summary.totalTasks, 5);
  assert.equal(summary.completedTasks, 1);
  assert.equal(summary.completionRate, 20);
  assert.equal(summary.weightedProgress, 30);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.averageWeightedProgress, 38);
  assert.equal(summary.goalReachedDays, 1);
  assert.equal(summary.goalReachedRate, 50);
});

test("priority charts use period task occurrences and matching completed occurrences", () => {
  const days = [
    day({ tasks: [
      { id: "a", priority: "high", isCompleted: true },
      { id: "b", priority: "medium", isCompleted: false },
    ] }),
    day({ tasks: [
      { id: "a", priority: "high", isCompleted: false },
      { id: "c", priority: "low", isCompleted: true },
    ] }),
  ];

  assert.deepEqual(statistics.getPriorityDistribution(days), {
    high: 2,
    medium: 1,
    low: 1,
  });
  assert.deepEqual(statistics.getPriorityCompletionByPriority(days), {
    high: { total: 2, completed: 1 },
    medium: { total: 1, completed: 0 },
    low: { total: 1, completed: 1 },
  });
});
