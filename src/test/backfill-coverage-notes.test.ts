import { describe, it, expect, vi, beforeEach } from "vitest";
import { TASKBASE_PLAYBOOK } from "../data/taskbase-playbook";
import { backfillCoverageNotes } from "@shared/analyze-sections";

// ── Mock Supabase client builder ──────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

/**
 * Build a chainable mock Supabase client.
 * Call `setResult(table, operation, result)` to register what a given
 * query chain should return.  Every terminal chained method (.is, .in,
 * .single, etc.) resolves to the registered result for that table+op.
 */
function createMockClient() {
  const queryResults = new Map<string, MockResult>();
  const updateCalls: { table: string; data: unknown; filters: Record<string, unknown> }[] = [];

  function setResult(table: string, op: string, result: MockResult) {
    queryResults.set(`${table}:${op}`, result);
  }

  function chain(table: string, op: string, filters: Record<string, unknown> = {}): any {
    const result = queryResults.get(`${table}:${op}`) ?? { data: null, error: null };
    const proxy: any = {};

    for (const method of ["select", "eq", "in", "is", "update", "insert", "delete", "order", "limit", "single"]) {
      proxy[method] = (...args: unknown[]) => {
        if (method === "eq" || method === "is") {
          filters[args[0] as string] = args[1];
        }
        if (method === "update") {
          updateCalls.push({ table, data: args[0], filters: { ...filters } });
        }
        return proxy;
      };
    }

    // Make it thenable so `await` resolves to the result
    proxy.then = (resolve: (v: MockResult) => void) => resolve(result);

    return proxy;
  }

  const client = {
    from(table: string) {
      return {
        select(..._args: unknown[]) { return chain(table, "select"); },
        update(data: unknown) {
          const filters: Record<string, unknown> = {};
          updateCalls.push({ table, data, filters });
          return chain(table, "update", filters);
        },
        insert(..._args: unknown[]) { return chain(table, "insert"); },
        delete() { return chain(table, "delete"); },
      };
    },
  };

  return { client, setResult, updateCalls };
}

// ── Extract realistic TB playbook sections ────────────────────────────

/** Pull real sections from the TB playbook for test data. */
function extractSections(): { id: string; title: string; content: string }[] {
  const lines = TASKBASE_PLAYBOOK.split("\n");
  const sections: { id: string; title: string; content: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let idx = 0;

  for (const line of lines) {
    // Match top-level headings like: # **3.6. Personas & Use Cases**
    // as well as h1-style: # **1. Introduction & Purpose**
    const m = line.match(/^#\s+\*\*(\d+(?:\.\d+)?)\.\s+(.+?)\*\*$/);
    if (m) {
      if (current) {
        sections.push({
          id: `sec-${idx}`,
          title: current.title,
          content: current.lines.join("\n"),
        });
        idx++;
      }
      current = { title: m[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    sections.push({
      id: `sec-${idx}`,
      title: current.title,
      content: current.lines.join("\n"),
    });
  }

  return sections;
}

const ALL_TB_SECTIONS = extractSections();

/** Get a section by partial title match. */
function tbSection(pattern: RegExp) {
  const sec = ALL_TB_SECTIONS.find((s) => pattern.test(s.title));
  if (!sec) throw new Error(`No TB section matching ${pattern}`);
  return sec;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("backfillCoverageNotes", () => {
  const userId = "user-123";
  const apiKey = "test-anthropic-key";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns early with filled:0 when no partial/missing skills exist", async () => {
    const { client, setResult } = createMockClient();

    // No partial/missing skills at all
    setResult("user_skills", "select", { data: [], error: null });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await backfillCoverageNotes(client as any, userId, apiKey);

    expect(result).toEqual({ filled: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns early when all notes are already filled", async () => {
    const { client, setResult } = createMockClient();

    // Partial/missing skills but ALL have coverage_notes already
    setResult("user_skills", "select", {
      data: [
        { skill_id: "i2", status: "partial", coverage_note: "Already has a note" },
        { skill_id: "o1", status: "missing", coverage_note: "Already has a note" },
      ],
      error: null,
    });

    // No section_skills gaps either
    setResult("section_skills", "select", { data: [], error: null });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await backfillCoverageNotes(client as any, userId, apiKey);

    expect(result).toEqual({ filled: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Claude and fills notes for skills with user_skills gaps", async () => {
    const { client, setResult, updateCalls } = createMockClient();

    const icpSection = tbSection(/ICP/);
    const objSection = tbSection(/Objection/);

    // 2 skills: both partial/missing with no coverage_note
    setResult("user_skills", "select", {
      data: [
        { skill_id: "i2", status: "partial", coverage_note: null },
        { skill_id: "o1", status: "missing", coverage_note: null },
      ],
      error: null,
    });

    // section_skills with null notes (joined with TB playbook content)
    setResult("section_skills", "select", {
      data: [
        {
          skill_id: "i2",
          section_id: icpSection.id,
          coverage_note: null,
          playbook_sections: {
            id: icpSection.id,
            title: icpSection.title,
            content: icpSection.content,
          },
        },
        {
          skill_id: "o1",
          section_id: objSection.id,
          coverage_note: null,
          playbook_sections: {
            id: objSection.id,
            title: objSection.title,
            content: objSection.content,
          },
        },
      ],
      error: null,
    });

    setResult("user_skills", "update", { data: null, error: null });
    setResult("section_skills", "update", { data: null, error: null });

    const mockClaudeResponse = {
      skillNotes: [
        { id: "i2", reason: "ICP fit criteria exist but lack a scoring model or red flag checklist." },
        { id: "o1", reason: "Objection scripts listed but lack context-awareness for different personas." },
      ],
      sectionNotes: [
        { skillId: "i2", sectionId: icpSection.id, reason: "Add a 1-5 scoring rubric for each ICP criterion." },
        { skillId: "o1", sectionId: objSection.id, reason: "Include persona-specific objection variations." },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        content: [{ text: JSON.stringify(mockClaudeResponse) }],
      }), { status: 200 }),
    );

    const result = await backfillCoverageNotes(client as any, userId, apiKey);

    expect(result).toEqual({ filled: 2 });

    // Verify Claude was called with Sonnet
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(opts.body);
    expect(body.model).toContain("sonnet");
    expect(body.messages[0].content).toContain("i2");
    expect(body.messages[0].content).toContain("o1");
    expect(body.messages[0].content).toContain("ICP Fit Assessment");
    expect(body.messages[0].content).toContain("Context-Aware Objection Handling");

    // Verify updates for both tables
    const userUpdates = updateCalls.filter((c) => c.table === "user_skills");
    const sectionUpdates = updateCalls.filter((c) => c.table === "section_skills");
    expect(userUpdates.length).toBe(2);
    expect(sectionUpdates.length).toBe(2);

    expect(userUpdates[0].data).toEqual({
      coverage_note: mockClaudeResponse.skillNotes[0].reason,
    });
    expect(userUpdates[1].data).toEqual({
      coverage_note: mockClaudeResponse.skillNotes[1].reason,
    });
  });

  it("fills section_skills gaps even when user_skills already has a note (3.6 Personas bug)", async () => {
    const { client, setResult, updateCalls } = createMockClient();

    // Simulates the 3.6 Personas & Use Cases scenario:
    // - i5 is partial, user_skills already has an overall note
    // - BUT section_skills for "Personas & Use Cases" has no note
    const personasSection = tbSection(/Personas/);

    setResult("user_skills", "select", {
      data: [
        {
          skill_id: "i5",
          status: "partial",
          coverage_note: "Use cases are mentioned but lack depth for specific verticals.",
        },
      ],
      error: null,
    });

    // section_skills has a null coverage_note for the Personas section
    setResult("section_skills", "select", {
      data: [
        {
          skill_id: "i5",
          section_id: personasSection.id,
          coverage_note: null,
          playbook_sections: {
            id: personasSection.id,
            title: personasSection.title,
            content: personasSection.content,
          },
        },
      ],
      error: null,
    });

    setResult("user_skills", "update", { data: null, error: null });
    setResult("section_skills", "update", { data: null, error: null });

    const mockClaudeResponse = {
      skillNotes: [
        { id: "i5", reason: "Persona use cases are generic; add vertical-specific examples." },
      ],
      sectionNotes: [
        {
          skillId: "i5",
          sectionId: personasSection.id,
          reason: "Add concrete use-case examples per persona (SDR, AE, AM) with measurable outcomes.",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        content: [{ text: JSON.stringify(mockClaudeResponse) }],
      }), { status: 200 }),
    );

    const result = await backfillCoverageNotes(client as any, userId, apiKey);

    // Claude was called (because section_skills had a gap)
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    // The prompt should include i5 and the Personas section content
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("i5");
    expect(body.messages[0].content).toContain("Use Cases & Proven Value");
    expect(body.messages[0].content).toContain(personasSection.title);

    // section_skills should have been updated
    const sectionUpdates = updateCalls.filter((c) => c.table === "section_skills");
    expect(sectionUpdates.length).toBe(1);
    expect(sectionUpdates[0].data).toEqual({
      coverage_note: "Add concrete use-case examples per persona (SDR, AE, AM) with measurable outcomes.",
    });

    // user_skills update is issued too (with .is("coverage_note", null) guard),
    // but the existing note won't be overwritten in production
    expect(result.filled).toBeGreaterThanOrEqual(1);
  });

  it("ignores notes for skill IDs not in the backfill set", async () => {
    const { client, setResult, updateCalls } = createMockClient();

    const section = ALL_TB_SECTIONS[0];

    // Only i2 is partial
    setResult("user_skills", "select", {
      data: [{ skill_id: "i2", status: "partial", coverage_note: null }],
      error: null,
    });

    setResult("section_skills", "select", {
      data: [
        {
          skill_id: "i2",
          section_id: section.id,
          coverage_note: null,
          playbook_sections: {
            id: section.id,
            title: section.title,
            content: section.content,
          },
        },
      ],
      error: null,
    });

    setResult("user_skills", "update", { data: null, error: null });
    setResult("section_skills", "update", { data: null, error: null });

    // Claude returns notes for i2 AND m1 (m1 is NOT in the backfill set)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        content: [{
          text: JSON.stringify({
            skillNotes: [
              { id: "i2", reason: "Needs scoring criteria." },
              { id: "m1", reason: "Should not be applied." },
            ],
            sectionNotes: [
              { skillId: "i2", sectionId: section.id, reason: "Add ICP scoring rubric." },
              { skillId: "m1", sectionId: section.id, reason: "Should not be applied." },
            ],
          }),
        }],
      }), { status: 200 }),
    );

    const result = await backfillCoverageNotes(client as any, userId, apiKey);

    expect(result).toEqual({ filled: 1 });

    const userUpdates = updateCalls.filter((c) => c.table === "user_skills");
    expect(userUpdates.length).toBe(1);
    expect(userUpdates[0].data).toEqual({ coverage_note: "Needs scoring criteria." });

    const sectionUpdates = updateCalls.filter((c) => c.table === "section_skills");
    expect(sectionUpdates.length).toBe(1);
    expect(sectionUpdates[0].data).toEqual({ coverage_note: "Add ICP scoring rubric." });
  });

  it("throws on Claude API error", async () => {
    const { client, setResult } = createMockClient();

    setResult("user_skills", "select", {
      data: [{ skill_id: "i2", status: "partial", coverage_note: null }],
      error: null,
    });
    setResult("section_skills", "select", { data: [], error: null });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Rate limit exceeded", { status: 429 }),
    );

    await expect(
      backfillCoverageNotes(client as any, userId, apiKey),
    ).rejects.toThrow("Backfill Claude API error: 429");
  });

  it("throws on unparseable Claude response", async () => {
    const { client, setResult } = createMockClient();

    setResult("user_skills", "select", {
      data: [{ skill_id: "i2", status: "partial", coverage_note: null }],
      error: null,
    });
    setResult("section_skills", "select", { data: [], error: null });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        content: [{ text: "I cannot produce JSON right now, sorry!" }],
      }), { status: 200 }),
    );

    await expect(
      backfillCoverageNotes(client as any, userId, apiKey),
    ).rejects.toThrow("Failed to parse backfill response");
  });
});
