import { describe, expect, it } from "vitest";
import { DiagnosticsCollector } from "@/src/lib/diagnostics";

describe("DiagnosticsCollector", () => {
  it("records up to the configured limit and flags truncation", () => {
    const collector = new DiagnosticsCollector(3);
    for (let i = 0; i < 10; i += 1) {
      collector.add({ row: i, error: "boom" });
    }
    const report = collector.report();
    expect(report.diagnostics).toHaveLength(3);
    expect(report.truncated).toBe(true);
  });

  it("does not flag truncation when under the limit", () => {
    const collector = new DiagnosticsCollector(100);
    collector.add({ row: 1, error: "x" });
    collector.add({ row: 2, error: "y" });
    const report = collector.report();
    expect(report.diagnostics).toHaveLength(2);
    expect(report.truncated).toBe(false);
  });

  it("addMany forwards each entry", () => {
    const collector = new DiagnosticsCollector(10);
    collector.addMany([
      { row: 1, error: "a" },
      { row: 2, error: "b" },
    ]);
    expect(collector.size).toBe(2);
  });

  it("report() returns a defensive copy", () => {
    const collector = new DiagnosticsCollector();
    collector.add({ row: 1, error: "x" });
    const report = collector.report();
    report.diagnostics.push({ row: 999, error: "mutated externally" });
    expect(collector.report().diagnostics).toHaveLength(1);
  });
});
