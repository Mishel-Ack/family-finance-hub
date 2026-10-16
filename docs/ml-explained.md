# ML and analytics explained

The app's spending insights are deterministic, data-grounded calculations rather than opaque model-generated financial advice.

## Regression metrics

The checked-in tests use explicit synthetic fixtures:

| Component            | Regression criterion                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Merchant categorizer | At least 80% accuracy on an 8-row holdout from a 40-row, date-ordered fixture, without an LLM.                         |
| Forecast engine      | 400-expense demo backtest: 23.49% MAPE and 4,668,052 paise MAE; each month uses only earlier months.                   |
| Anomaly detection    | 400-expense demo backtest: 100% recall (4/4 outliers) and 26.67% precision.                                            |
| Planner simulation   | Uses 1,000 deterministic runs; a representative local unit-test fixture is expected to complete under 200 ms.          |
| Health score         | Partial-input scoring exposes missing components and reduced confidence; complete fixture data scores full confidence. |

These are code-regression thresholds, not claims about future household data or financial outcomes.
The forecast and anomaly values are measured outputs asserted by `tests/demo-seed.integration.test.ts`; do not treat this deterministic fixture as representative of production households.

## Expense categorization and trends

The categorizer normalizes descriptions and applies curated keyword and merchant signals. It can use an AI provider for supported tasks when configured, but persisted category corrections provide local feedback. All currency and category totals are based on paise and family-scoped database reads.

The planner simulates 1,000 runs from the family's recent shared-spending history. It reports insufficient history and missing income rather than presenting a forecast as certainty. Forecast output is illustrative, not a guarantee.

Financial health combines available signals and reports missing inputs. The dashboard trend uses the preceding six calendar months of shared spending. Recurring subscription candidates are inferred from repeated, similarly sized shared transactions and should be verified by the family.

## AI Coach and controls

The Coach receives scoped tool results for family spending, budgets, and planning. It verifies currency amounts in generated answers against those tool results before returning them. AI is controlled by the global `AI_ENABLED` switch, per-family settings, provider configuration, a per-family monthly budget, and per-user rate limits.

The environment variables, model defaults, and usage controls are documented in the README. Leave AI disabled unless the provider key and spending policy have been configured.
