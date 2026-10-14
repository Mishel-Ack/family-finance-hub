/**
 * Number extraction and integrity verification for AI Coach responses.
 * Extracts rupee amounts and percentages from text and verifies them
 * against numbers returned by tool executions.
 */

export interface ExtractedMetric {
  raw: string;
  value: number; // in rupees for currency, or raw number for percentages
  kind: "CURRENCY" | "PERCENTAGE";
}

/**
 * Extracts rupee amounts (₹, Rs, INR, lakh, crore) and percentages from text.
 */
export function extractMetrics(text: string): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = [];

  // Match ₹ / Rs / INR amounts like ₹1,20,000 or Rs. 450 or INR 5000
  const currencyRegex = /(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/gi;
  for (const match of text.matchAll(currencyRegex)) {
    const rawVal = match[1]?.replace(/,/g, "") ?? "";
    const num = parseFloat(rawVal);
    if (!Number.isNaN(num)) {
      metrics.push({ raw: match[0], value: num, kind: "CURRENCY" });
    }
  }

  // Match lakh / crore amounts like "1.2 lakh", "12 lakhs", "1.5 crore"
  const scaleRegex = /([0-9]+(?:\.[0-9]+)?)\s*(lakhs?|lacs?|crores?|cr)\b/gi;
  for (const match of text.matchAll(scaleRegex)) {
    const base = parseFloat(match[1] ?? "");
    const scale = match[2]?.toLowerCase() ?? "";
    if (!Number.isNaN(base)) {
      let multiplier = 1;
      if (scale.startsWith("l")) multiplier = 100_000;
      else if (scale.startsWith("c")) multiplier = 10_000_000;
      metrics.push({ raw: match[0], value: base * multiplier, kind: "CURRENCY" });
    }
  }

  // Match percentages like "15%", "15.5%", "15 percent"
  const percentRegex = /([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent\b)/gi;
  for (const match of text.matchAll(percentRegex)) {
    const num = parseFloat(match[1] ?? "");
    if (!Number.isNaN(num)) {
      metrics.push({ raw: match[0], value: num, kind: "PERCENTAGE" });
    }
  }

  return metrics;
}

/**
 * Recursively extracts all numbers from structured tool results.
 * Figures in paise are converted to rupees if labeled with paise or if integer.
 */
export function collectToolNumbers(obj: unknown, found: Set<number> = new Set()): Set<number> {
  if (obj === null || obj === undefined) return found;

  if (typeof obj === "number") {
    found.add(obj);
    return found;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectToolNumbers(item, found);
    }
    return found;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === "number") {
        found.add(value);
        // If this is a paise value, also add the rupee value
        if (key.toLowerCase().includes("paise")) {
          found.add(value / 100);
          found.add(Math.round(value / 100));
        }
      } else {
        collectToolNumbers(value, found);
      }
    }
  }

  return found;
}

/**
 * Checks whether an extracted metric matches any expected number with tolerance.
 */
export function matchesAny(metric: ExtractedMetric, expectedNumbers: Set<number>): boolean {
  for (const expected of expectedNumbers) {
    if (metric.kind === "PERCENTAGE") {
      // For percentages, allow ±1% tolerance or exact rounded match
      if (Math.abs(metric.value - expected) <= 1.01) return true;
      if (Math.abs(metric.value - expected * 100) <= 1.01) return true; // e.g., 0.15 vs 15%
    } else {
      // For currency, allow 2% relative tolerance or ±5 rupees absolute tolerance
      const diff = Math.abs(metric.value - expected);
      if (diff <= 5) return true;
      if (expected !== 0 && diff / Math.abs(expected) <= 0.03) return true;
    }
  }
  return false;
}

export interface VerificationResult {
  valid: boolean;
  mismatches: ExtractedMetric[];
}

/**
 * Verifies that all metrics extracted from the answer text are grounded in tool results.
 */
export function verifyAnswerMetrics(text: string, toolResults: unknown[]): VerificationResult {
  const extracted = extractMetrics(text);
  if (extracted.length === 0) {
    return { valid: true, mismatches: [] };
  }

  const expectedNumbers = new Set<number>();
  for (const res of toolResults) {
    collectToolNumbers(res, expectedNumbers);
  }

  const mismatches: ExtractedMetric[] = [];
  for (const metric of extracted) {
    if (!matchesAny(metric, expectedNumbers)) {
      mismatches.push(metric);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}
