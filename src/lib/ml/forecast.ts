export type DataSufficiency = "SUFFICIENT" | "LOW" | "NONE";

export interface ForecastMonth {
  month: string;
  categories: Record<string, number>;
  cumulativeByDay?: Record<string, number[]>;
}

export interface CategoryForecast {
  category: string;
  pointPaise: number;
  rangePaise: { p10: number; p50: number; p90: number };
  dataSufficiency: DataSufficiency;
  reason: string;
}

export interface ForecastResult {
  categories: CategoryForecast[];
  total: Omit<CategoryForecast, "category">;
  dataSufficiency: DataSufficiency;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function smooth(values: number[]): number {
  if (!values.length) return 0;
  let level = values[0]!;
  for (const value of values.slice(1)) level = 0.4 * value + 0.6 * level;
  return level;
}

function profileFraction(history: ForecastMonth[], category: string, day: number): number {
  const fractions = history.flatMap((month) => {
    const profile = month.cumulativeByDay?.[category];
    const total = month.categories[category] ?? 0;
    if (!profile?.length || total <= 0) return [];
    const atDay = profile[Math.min(day - 1, profile.length - 1)] ?? 0;
    return [Math.min(1, Math.max(0.05, atDay / total))];
  });
  return fractions.length ? median(fractions) : day / 30;
}

function forecastOne(options: {
  history: ForecastMonth[];
  category: string;
  currentSpentPaise: number;
  dayOfMonth: number;
  seed: number;
  samples: number;
}): CategoryForecast {
  const values = options.history.map((month) => month.categories[options.category] ?? 0);
  const completeMonths = options.history.length;
  if (!completeMonths && options.currentSpentPaise === 0) {
    return {
      category: options.category,
      pointPaise: 0,
      rangePaise: { p10: 0, p50: 0, p90: 0 },
      dataSufficiency: "NONE",
      reason: "There is no spending history for this category yet.",
    };
  }
  const fraction = profileFraction(options.history, options.category, options.dayOfMonth);
  const runRate = options.currentSpentPaise > 0 ? options.currentSpentPaise / fraction : 0;
  const trend = smooth(values);
  const point = Math.round(
    completeMonths >= 2 && runRate > 0 ? runRate * 0.65 + trend * 0.35 : runRate || trend,
  );
  const random = seededRandom(options.seed);
  const bootstrap = Array.from({ length: options.samples }, () => {
    const sample = values.length ? values[Math.floor(random() * values.length)]! : point;
    const noise = 0.9 + random() * 0.2;
    return Math.max(0, Math.round((sample * 0.5 + point * 0.5) * noise));
  }).sort((a, b) => a - b);
  const sufficient = completeMonths >= 2;
  return {
    category: options.category,
    pointPaise: point,
    rangePaise: {
      p10: percentile(bootstrap, 0.1),
      p50: percentile(bootstrap, 0.5),
      p90: percentile(bootstrap, 0.9),
    },
    dataSufficiency: sufficient ? "SUFFICIENT" : "LOW",
    reason: sufficient
      ? `Projection uses ${completeMonths} complete months and the observed within-month spending profile.`
      : "Not enough complete history yet; this uses a simple current-month run-rate.",
  };
}

export function forecastMonth(options: {
  history: ForecastMonth[];
  currentSpentByCategory: Record<string, number>;
  dayOfMonth: number;
  daysInMonth: number;
  seed?: number;
  samples?: number;
}): ForecastResult {
  const categories = [
    ...new Set([
      ...Object.keys(options.currentSpentByCategory),
      ...options.history.flatMap((month) => Object.keys(month.categories)),
    ]),
  ].sort();
  const samples = options.samples ?? 1000;
  const forecasts = categories.map((category, index) =>
    forecastOne({
      history: options.history,
      category,
      currentSpentPaise: options.currentSpentByCategory[category] ?? 0,
      dayOfMonth: Math.max(1, Math.min(options.dayOfMonth, options.daysInMonth)),
      seed: (options.seed ?? 1) + index,
      samples,
    }),
  );
  const totalCurrent = Object.values(options.currentSpentByCategory).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const totalCategory = forecastOne({
    history: options.history.map((month) => ({
      ...month,
      categories: {
        Total: Object.values(month.categories).reduce((sum, amount) => sum + amount, 0),
      },
    })),
    category: "Total",
    currentSpentPaise: totalCurrent,
    dayOfMonth: Math.max(1, Math.min(options.dayOfMonth, options.daysInMonth)),
    seed: (options.seed ?? 1) + categories.length,
    samples,
  });
  const sufficient = forecasts.some((item) => item.dataSufficiency === "SUFFICIENT");
  return {
    categories: forecasts,
    total: {
      pointPaise: totalCategory.pointPaise,
      rangePaise: totalCategory.rangePaise,
      dataSufficiency: sufficient
        ? "SUFFICIENT"
        : options.history.length || totalCurrent
          ? "LOW"
          : "NONE",
      reason: totalCategory.reason,
    },
    dataSufficiency: sufficient
      ? "SUFFICIENT"
      : options.history.length || totalCurrent
        ? "LOW"
        : "NONE",
  };
}
