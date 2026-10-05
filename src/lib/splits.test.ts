import { describe, expect, it } from "vitest";
import {
  computeBalances,
  computeEqualSplit,
  computeExactSplit,
  computePercentSplit,
  simplifyDebts,
} from "./splits";

describe("split calculations", () => {
  it("allocates equal-split remainder paise by ascending member ID", () => {
    expect(computeEqualSplit(10000, ["c", "a", "b"])).toEqual([
      { memberId: "a", sharePaise: 3334 },
      { memberId: "b", sharePaise: 3333 },
      { memberId: "c", sharePaise: 3333 },
    ]);
    expect(() => computeEqualSplit(1, ["b", "a"])).toThrow(/at least 1 paise/);
    expect(() => computeEqualSplit(1, ["c", "b", "a"])).toThrow(/at least 1 paise/);
  });

  it("is deterministic independent of input order", () => {
    expect(computeEqualSplit(101, ["c", "b", "a"])).toEqual(
      computeEqualSplit(101, ["a", "b", "c"]),
    );
  });

  it("validates exact splits", () => {
    expect(
      computeExactSplit(100, [
        { memberId: "a", sharePaise: 40 },
        { memberId: "b", sharePaise: 60 },
      ]),
    ).toHaveLength(2);
    expect(() => computeExactSplit(100, [{ memberId: "a", sharePaise: 99 }])).toThrow(/add up/);
    expect(() =>
      computeExactSplit(1, [
        { memberId: "a", sharePaise: 1 },
        { memberId: "a", sharePaise: 1 },
      ]),
    ).toThrow(/more than once/);
    expect(() => computeExactSplit(2, [{ memberId: "a", sharePaise: 0 }])).toThrow(/positive/);
  });

  it("uses largest remainder for basis-point percentages", () => {
    expect(
      computePercentSplit(10000, [
        { memberId: "a", basisPoints: 3333 },
        { memberId: "b", basisPoints: 3333 },
        { memberId: "c", basisPoints: 3334 },
      ]),
    ).toEqual([
      { memberId: "a", sharePaise: 3333 },
      { memberId: "b", sharePaise: 3333 },
      { memberId: "c", sharePaise: 3334 },
    ]);
    expect(
      computePercentSplit(10001, [
        { memberId: "c", basisPoints: 3334 },
        { memberId: "a", basisPoints: 3333 },
        { memberId: "b", basisPoints: 3333 },
      ]),
    ).toEqual([
      { memberId: "a", sharePaise: 3333 },
      { memberId: "b", sharePaise: 3333 },
      { memberId: "c", sharePaise: 3335 },
    ]);
    expect(() =>
      computePercentSplit(100, [
        { memberId: "a", basisPoints: 3333 },
        { memberId: "b", basisPoints: 3333 },
        { memberId: "c", basisPoints: 3333 },
      ]),
    ).toThrow(/10000/);
  });
});

describe("balance and debt calculations", () => {
  it("nets the payer's own share and applies settlements with zero sum", () => {
    const equal = computeEqualSplit(10000, ["a", "b", "c"]);
    const balances = computeBalances(
      [{ visibility: "SHARED", amountPaise: 10000, memberId: "a", splits: equal }],
      [],
    );
    expect(balances).toEqual(
      new Map([
        ["a", 6666],
        ["b", -3333],
        ["c", -3333],
      ]),
    );
    const settled = computeBalances(
      [{ visibility: "SHARED", amountPaise: 10000, memberId: "a", splits: equal }],
      [
        { fromMemberId: "b", toMemberId: "a", amountPaise: 3333 },
        { fromMemberId: "c", toMemberId: "a", amountPaise: 3333 },
      ],
    );
    expect([...settled.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("keeps balance sums at zero over 500 seeded random ledgers", () => {
    let seed = 0x12345678;
    const random = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    for (let testCase = 0; testCase < 500; testCase++) {
      const memberIds = ["m0", "m1", "m2", "m3", "m4"];
      const expenses = Array.from({ length: random(8) }, () => {
        const amountPaise = random(100000) + 1;
        const splits = computeEqualSplit(amountPaise, memberIds.slice(0, random(4) + 2));
        return {
          visibility: "SHARED" as const,
          amountPaise,
          memberId: memberIds[random(memberIds.length)]!,
          splits,
        };
      });
      const settlements = Array.from({ length: random(8) }, () => {
        const fromIndex = random(memberIds.length);
        const toIndex = (fromIndex + random(memberIds.length - 1) + 1) % memberIds.length;
        return {
          fromMemberId: memberIds[fromIndex]!,
          toMemberId: memberIds[toIndex]!,
          amountPaise: random(10000) + 1,
        };
      });
      const balances = computeBalances(expenses, settlements);
      expect(
        [...balances.values()].reduce((sum, amount) => sum + amount, 0),
        `case ${testCase}`,
      ).toBe(0);
    }
  });

  it.each([2, 3, 10, 50])(
    "simplifies randomized %i-member balances in at most n-1 transfers",
    (count) => {
      let seed = count * 97;
      const random = (max: number) => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return seed % max;
      };
      const ids = Array.from(
        { length: count },
        (_, index) => `m${index.toString().padStart(2, "0")}`,
      );
      const raw = ids.map(() => random(200001) - 100000);
      const total = raw.reduce((sum, amount) => sum + amount, 0);
      raw[0]! -= total;
      const balances = new Map(ids.map((id, index) => [id, raw[index]!]));
      const transfers = simplifyDebts(balances);
      expect(transfers.length).toBeLessThanOrEqual(count - 1);
      const after = new Map(balances);
      for (const transfer of transfers) {
        after.set(transfer.fromMemberId, after.get(transfer.fromMemberId)! + transfer.amountPaise);
        after.set(transfer.toMemberId, after.get(transfer.toMemberId)! - transfer.amountPaise);
      }
      expect([...after.values()].every((amount) => amount === 0)).toBe(true);
    },
  );

  it("returns no transfers when balances are already settled", () => {
    expect(
      simplifyDebts(
        new Map([
          ["a", 0],
          ["b", 0],
        ]),
      ),
    ).toEqual([]);
  });
});
