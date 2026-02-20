import { describe, it, expect } from "vitest";
import { computeHealthScore } from "../health";
import type { Skill } from "../types";

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "s1",
    name: "Test Skill",
    status: "missing",
    fulfilled: false,
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("returns zeroes for an empty skills array", () => {
    const result = computeHealthScore([]);
    expect(result).toEqual({
      score: 0,
      covered: 0,
      total: 0,
      partial: 0,
      missing: 0,
      outdated: 0,
      lastAnalyzed: null,
    });
  });

  it("returns 100 when all skills are covered", () => {
    const skills = [
      skill({ id: "a", status: "covered" }),
      skill({ id: "b", status: "covered" }),
      skill({ id: "c", status: "covered" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.score).toBe(100);
    expect(result.covered).toBe(3);
    expect(result.total).toBe(3);
    expect(result.partial).toBe(0);
    expect(result.missing).toBe(0);
  });

  it("returns 0 when all skills are missing", () => {
    const skills = [
      skill({ id: "a", status: "missing" }),
      skill({ id: "b", status: "missing" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.score).toBe(0);
    expect(result.missing).toBe(2);
    expect(result.covered).toBe(0);
  });

  it("counts partial as 0.5 weight", () => {
    // 2 partial out of 2 total → (0 + 2*0.5) / 2 = 50
    const skills = [
      skill({ id: "a", status: "partial" }),
      skill({ id: "b", status: "partial" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.score).toBe(50);
    expect(result.partial).toBe(2);
  });

  it("calculates mixed statuses correctly", () => {
    // 1 covered + 1 partial + 2 missing → (1 + 0.5) / 4 = 37.5 → 38
    const skills = [
      skill({ id: "a", status: "covered" }),
      skill({ id: "b", status: "partial" }),
      skill({ id: "c", status: "missing" }),
      skill({ id: "d", status: "missing" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.score).toBe(38);
    expect(result.covered).toBe(1);
    expect(result.partial).toBe(1);
    expect(result.missing).toBe(2);
    expect(result.total).toBe(4);
  });

  it("detects outdated skills (>90 days old)", () => {
    const old = new Date();
    old.setDate(old.getDate() - 91);

    const skills = [
      skill({ id: "a", status: "covered", lastUpdated: old.toISOString() }),
      skill({ id: "b", status: "covered", lastUpdated: new Date().toISOString() }),
    ];
    const result = computeHealthScore(skills);
    expect(result.outdated).toBe(1);
  });

  it("does not flag skills without lastUpdated as outdated", () => {
    const skills = [
      skill({ id: "a", status: "covered" }),
      skill({ id: "b", status: "missing" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.outdated).toBe(0);
  });

  it("does not flag skills updated within 90 days as outdated", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);

    const skills = [
      skill({ id: "a", status: "covered", lastUpdated: recent.toISOString() }),
    ];
    const result = computeHealthScore(skills);
    expect(result.outdated).toBe(0);
  });

  it("rounds the score to the nearest integer", () => {
    // 1 covered + 0 partial + 2 missing → 1/3 = 33.33 → 33
    const skills = [
      skill({ id: "a", status: "covered" }),
      skill({ id: "b", status: "missing" }),
      skill({ id: "c", status: "missing" }),
    ];
    const result = computeHealthScore(skills);
    expect(result.score).toBe(33);
  });
});
