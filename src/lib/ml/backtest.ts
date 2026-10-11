import { detectAnomalies, type AnomalyExpense } from "@/lib/ml/anomaly";
import { forecastMonth, type ForecastMonth } from "@/lib/ml/forecast";

export interface ForecastBacktestRow {
  month: string;
  actualPaise: number;
  predictedPaise: number;
  absoluteErrorPaise: number;
  absolutePercentageError: number | null;
}

export interface BacktestMetrics {
  rows: ForecastBacktestRow[];
  maePaise: number | null;
  mapePercent: number | null;
  anomaly: {
    precision: number | null;
    recall: number | null;
    predictedCount: number;
    truePositiveCount: number;
    actualOutlierCount: number;
  };
}

export function backtestPlanningEngine(options: {
  months: ForecastMonth[];
  expenses: AnomalyExpense[];
  seededOutlierExpenseIds: string[];
}): BacktestMetrics {
  const rows: ForecastBacktestRow[] = [];
  for (let index = 2; index < options.months.length; index++) {
    const actual = options.months[index]!;
    const forecast = forecastMonth({
      history: options.months.slice(0, index),
      currentSpentByCategory: {},
      dayOfMonth: 15,
      daysInMonth: 30,
      seed: index + 1,
      samples: 100,
    });
    const actualPaise = Object.values(actual.categories).reduce((sum, amount) => sum + amount, 0);
    const predictedPaise = forecast.total.pointPaise;
    const absoluteErrorPaise = Math.abs(predictedPaise - actualPaise);
    rows.push({
      month: actual.month,
      actualPaise,
      predictedPaise,
      absoluteErrorPaise,
      absolutePercentageError: actualPaise > 0 ? (absoluteErrorPaise / actualPaise) * 100 : null,
    });
  }
  const maePaise = rows.length
    ? rows.reduce((sum, row) => sum + row.absoluteErrorPaise, 0) / rows.length
    : null;
  const percentageErrors = rows.flatMap((row) =>
    row.absolutePercentageError === null ? [] : [row.absolutePercentageError],
  );
  const mapePercent = percentageErrors.length
    ? percentageErrors.reduce((sum, error) => sum + error, 0) / percentageErrors.length
    : null;
  const flagged = new Set(
    detectAnomalies({ expenses: options.expenses }).flatMap((flag) =>
      flag.expenseId ? [flag.expenseId] : [],
    ),
  );
  const truth = new Set(options.seededOutlierExpenseIds);
  const truePositiveCount = [...flagged].filter((id) => truth.has(id)).length;
  return {
    rows,
    maePaise,
    mapePercent,
    anomaly: {
      precision: flagged.size ? truePositiveCount / flagged.size : null,
      recall: truth.size ? truePositiveCount / truth.size : null,
      predictedCount: flagged.size,
      truePositiveCount,
      actualOutlierCount: truth.size,
    },
  };
}
