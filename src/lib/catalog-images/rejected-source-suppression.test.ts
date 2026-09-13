import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CAPACITY_REJECTION_CODE,
  classifyRejectedSourceSuppression,
} from "./rejected-source-suppression";

const now = new Date("2026-10-13T12:00:00.000Z");

describe("rejected Catalog image source suppression", () => {
  it("permanently suppresses a manually rejected identical source", () => {
    expect(classifyRejectedSourceSuppression([{
      status: "rejected",
      rejectionReason: "营销元素过多",
      statusChangedAt: "2025-01-01T00:00:00.000Z",
    }], now)).toBe("manual_rejection");
  });

  it("uses only the stable capacity reason prefix and suppresses at 29d23h59m", () => {
    expect(classifyRejectedSourceSuppression([{
      status: "rejected",
      rejectionReason: `${CAPACITY_REJECTION_CODE}: 任意可变说明文字`,
      statusChangedAt: "2026-09-13T12:01:00.000Z",
    }], now)).toBe("capacity_cooldown");
  });

  it("allows a capacity-governed source again at exactly 30 days", () => {
    expect(classifyRejectedSourceSuppression([{
      status: "rejected",
      rejectionReason: CAPACITY_REJECTION_CODE,
      statusChangedAt: "2026-09-13T12:00:00.000Z",
    }], now)).toBeNull();
  });

  it("ignores approved primary records and malformed timestamps", () => {
    expect(classifyRejectedSourceSuppression([
      { status: "approved", rejectionReason: "人工拒绝", statusChangedAt: "2026-10-13T11:00:00.000Z" },
      { status: "rejected", rejectionReason: CAPACITY_REJECTION_CODE, statusChangedAt: "invalid" },
    ], now)).toBeNull();
  });
});
