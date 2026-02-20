import { describe, it, expect } from "vitest";
import {
  SKILL_CATEGORIES,
  ALL_SKILL_IDS,
  getSkillsPromptBlock,
} from "@shared/skills";

describe("SKILL_CATEGORIES", () => {
  it("has 10 categories", () => {
    expect(SKILL_CATEGORIES).toHaveLength(10);
  });

  it("each category has exactly 5 skills", () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(cat.skills).toHaveLength(5);
    }
  });

  it("each category has an id and name", () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
    }
  });

  it("each skill has an id and name", () => {
    for (const cat of SKILL_CATEGORIES) {
      for (const skill of cat.skills) {
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
      }
    }
  });
});

describe("ALL_SKILL_IDS", () => {
  it("contains 50 unique skill IDs (10 categories × 5 skills)", () => {
    expect(ALL_SKILL_IDS.size).toBe(50);
  });

  it("contains no duplicate IDs across categories", () => {
    const allIds: string[] = [];
    for (const cat of SKILL_CATEGORIES) {
      for (const skill of cat.skills) {
        allIds.push(skill.id);
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("includes known skill IDs", () => {
    expect(ALL_SKILL_IDS.has("i1")).toBe(true);
    expect(ALL_SKILL_IDS.has("m1")).toBe(true);
    expect(ALL_SKILL_IDS.has("q1")).toBe(true);
    expect(ALL_SKILL_IDS.has("dm1")).toBe(true);
    expect(ALL_SKILL_IDS.has("dl1")).toBe(true);
  });
});

describe("getSkillsPromptBlock", () => {
  it("returns a non-empty string", () => {
    const block = getSkillsPromptBlock();
    expect(block.length).toBeGreaterThan(0);
  });

  it("includes all category names", () => {
    const block = getSkillsPromptBlock();
    for (const cat of SKILL_CATEGORIES) {
      expect(block).toContain(cat.name);
    }
  });

  it("includes all skill IDs", () => {
    const block = getSkillsPromptBlock();
    for (const cat of SKILL_CATEGORIES) {
      for (const skill of cat.skills) {
        expect(block).toContain(skill.id);
      }
    }
  });

  it("formats as 'id: name' per skill", () => {
    const block = getSkillsPromptBlock();
    expect(block).toContain("i1: ICP Definition");
    expect(block).toContain("dm1: Demo Storyline & Sequence");
  });
});
