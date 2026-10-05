/** Pure integer-paise split and settle-up calculations. */

export interface ExactParticipant {
  memberId: string;
  sharePaise: number;
}

export interface PercentParticipant {
  memberId: string;
  basisPoints: number;
}

export interface ExpenseWithSplits {
  visibility: "SHARED" | "PRIVATE";
  amountPaise: number;
  memberId: string | null;
  splits: ExactParticipant[];
}

export interface SettlementBalanceInput {
  fromMemberId: string;
  toMemberId: string;
  amountPaise: number;
}

export interface DebtTransfer {
  fromMemberId: string;
  toMemberId: string;
  amountPaise: number;
}

function assertAmount(amountPaise: number): void {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new Error("Amount must be a non-negative integer number of paise");
  }
}

function assertUniqueMembers(memberIds: string[]): void {
  if (memberIds.length === 0) throw new Error("At least one participant is required");
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error("A member cannot appear more than once");
  }
}

function compareMemberId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function computeEqualSplit(amountPaise: number, memberIds: string[]): ExactParticipant[] {
  assertAmount(amountPaise);
  assertUniqueMembers(memberIds);
  const sortedIds = [...memberIds].sort(compareMemberId);
  const base = Math.floor(amountPaise / sortedIds.length);
  const remainder = amountPaise % sortedIds.length;
  if (base === 0) throw new Error("Each participant must receive at least 1 paise");
  return sortedIds.map((memberId, index) => ({
    memberId,
    sharePaise: base + (index < remainder ? 1 : 0),
  }));
}

export function computeExactSplit(
  amountPaise: number,
  participants: ExactParticipant[],
): ExactParticipant[] {
  assertAmount(amountPaise);
  assertUniqueMembers(participants.map(({ memberId }) => memberId));
  if (participants.some(({ sharePaise }) => !Number.isSafeInteger(sharePaise) || sharePaise <= 0)) {
    throw new Error("Every exact share must be a positive integer number of paise");
  }
  if (participants.reduce((sum, item) => sum + item.sharePaise, 0) !== amountPaise) {
    throw new Error("Exact shares must add up to the expense amount");
  }
  return participants.map(({ memberId, sharePaise }) => ({ memberId, sharePaise }));
}

export function computePercentSplit(
  amountPaise: number,
  participants: PercentParticipant[],
): ExactParticipant[] {
  assertAmount(amountPaise);
  assertUniqueMembers(participants.map(({ memberId }) => memberId));
  if (
    participants.some(
      ({ basisPoints }) =>
        !Number.isSafeInteger(basisPoints) || basisPoints <= 0 || basisPoints > 10000,
    )
  ) {
    throw new Error("Each percentage must be a positive integer number of basis points");
  }
  if (participants.reduce((sum, item) => sum + item.basisPoints, 0) !== 10000) {
    throw new Error("Percentages must add up to exactly 10000 basis points");
  }
  const allocations = participants.map(({ memberId, basisPoints }) => {
    const numerator = amountPaise * basisPoints;
    return { memberId, sharePaise: Math.floor(numerator / 10000), remainder: numerator % 10000 };
  });
  const penniesLeft = amountPaise - allocations.reduce((sum, item) => sum + item.sharePaise, 0);
  allocations
    .sort((a, b) => b.remainder - a.remainder || compareMemberId(a.memberId, b.memberId))
    .slice(0, penniesLeft)
    .forEach((item) => item.sharePaise++);
  if (allocations.some(({ sharePaise }) => sharePaise <= 0)) {
    throw new Error("Each participant must receive at least 1 paise");
  }
  return allocations
    .map(({ memberId, sharePaise }) => ({ memberId, sharePaise }))
    .sort((a, b) => compareMemberId(a.memberId, b.memberId));
}

export function computeBalances(
  expensesWithSplits: ExpenseWithSplits[],
  settlements: SettlementBalanceInput[],
): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (memberId: string, amount: number) =>
    balances.set(memberId, (balances.get(memberId) ?? 0) + amount);
  for (const expense of expensesWithSplits) {
    if (expense.visibility !== "SHARED" || expense.splits.length === 0) continue;
    assertAmount(expense.amountPaise);
    if (!expense.memberId) throw new Error("A split expense must have a payer");
    if (expense.splits.reduce((sum, split) => sum + split.sharePaise, 0) !== expense.amountPaise) {
      throw new Error("Expense splits must add up to the expense amount");
    }
    add(expense.memberId, expense.amountPaise);
    for (const split of expense.splits) add(split.memberId, -split.sharePaise);
  }
  for (const settlement of settlements) {
    if (
      settlement.fromMemberId === settlement.toMemberId ||
      !Number.isSafeInteger(settlement.amountPaise) ||
      settlement.amountPaise <= 0
    ) {
      throw new Error("Settlement must be positive and between two different members");
    }
    add(settlement.fromMemberId, settlement.amountPaise);
    add(settlement.toMemberId, -settlement.amountPaise);
  }
  const total = [...balances.values()].reduce((sum, amount) => sum + amount, 0);
  if (total !== 0) throw new Error("Member balances must sum to zero");
  return balances;
}

export function simplifyDebts(balances: Map<string, number>): DebtTransfer[] {
  if ([...balances.values()].reduce((sum, amount) => sum + amount, 0) !== 0) {
    throw new Error("Member balances must sum to zero");
  }
  const remaining = new Map(balances);
  const transfers: DebtTransfer[] = [];
  while (true) {
    const creditors = [...remaining]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1] || compareMemberId(a[0], b[0]));
    const debtors = [...remaining]
      .filter(([, amount]) => amount < 0)
      .sort((a, b) => a[1] - b[1] || compareMemberId(a[0], b[0]));
    const creditor = creditors[0];
    const debtor = debtors[0];
    if (!creditor || !debtor) break;
    const amountPaise = Math.min(creditor[1], -debtor[1]);
    transfers.push({ fromMemberId: debtor[0], toMemberId: creditor[0], amountPaise });
    remaining.set(debtor[0], debtor[1] + amountPaise);
    remaining.set(creditor[0], creditor[1] - amountPaise);
  }
  if (transfers.length > Math.max(0, balances.size - 1)) {
    throw new Error("Debt simplification exceeded the minimum transfer bound");
  }
  if ([...remaining.values()].some((amount) => amount !== 0)) {
    throw new Error("Unable to settle all member balances");
  }
  return transfers;
}
