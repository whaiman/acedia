import { describe, expect, it } from "vitest";
import { markDone, recommend } from "../src/lib/acedia/engine";
import { extractJson, interpretWithModel } from "../src/lib/acedia/llm";
import { parseText, validateProposal } from "../src/lib/acedia/parse";
import type { Obligation } from "../src/lib/acedia/types";

const NOW = new Date("2026-10-20T09:00:00Z");
const o = (id: string, extra: Partial<Obligation> = {}): Obligation => ({ id, title: id, dependsOn: [], ...extra });

describe("recommend", () => {
  it("picks the enabler and lists dependents as waiting", () => {
    const r = recommend([o("article", { deadline: "2026-10-25", dependsOn: ["core"] }), o("docs", { dependsOn: ["core"] }), o("core")], NOW);
    expect(r.kind).toBe("action");
    if (r.kind !== "action") return;
    expect(r.obligationId).toBe("core");
    expect(r.deferred.every((d) => d.kind === "waiting")).toBe(true);
    expect(r.deadlineNote).toContain("inherited");
    expect(r.reason.length).toBeGreaterThan(0);
  });
  it("is deterministic", () => {
    const list = [o("a", { deadline: "2026-11-30" }), o("b", { effort: "tiny" })];
    expect(recommend(list, NOW)).toEqual(recommend(list, NOW));
  });
  it("urgent beats non-urgent", () => {
    const r = recommend([o("big", { deadline: "2026-12-01" }), o("soon", { deadline: "2026-10-21" })], NOW);
    expect(r.kind === "action" && r.obligationId).toBe("soon");
  });
  it("never calls a missing deadline safe", () => {
    const r = recommend([o("a", { deadline: "2026-10-21" }), o("b")], NOW);
    if (r.kind !== "action") throw new Error("expected action");
    expect(r.deferred[0].kind).toBe("not-justified");
    expect(r.uncertainty.join(" ")).toContain("no deadline");
  });
  it("offers safe deferral with a review date when slack >= 7 days", () => {
    const r = recommend([o("a", { deadline: "2026-10-21" }), o("b", { deadline: "2026-11-20" })], NOW);
    if (r.kind !== "action") throw new Error("expected action");
    const d = r.deferred[0];
    expect(d.kind).toBe("safe");
    if (d.kind === "safe") expect(d.reviewAt).toBe("2026-11-05");
  });
  it("irreversible items are not casually deferred", () => {
    const r = recommend([o("a", { deadline: "2026-10-21" }), o("b", { deadline: "2026-12-30", irreversible: true })], NOW);
    if (r.kind !== "action") throw new Error("expected action");
    expect(r.deferred[0].kind).toBe("not-justified");
  });
  it("asks when dependencies loop or are unknown", () => {
    expect(recommend([o("a", { dependsOn: ["b"] }), o("b", { dependsOn: ["a"] })], NOW).kind).toBe("needs-info");
    expect(recommend([o("a", { dependsOn: ["ghost"] })], NOW).kind).toBe("needs-info");
  });
  it("walks through to all-done", () => {
    let list = [o("a"), o("b", { dependsOn: ["a"] })];
    for (const id of ["a", "b"]) {
      const r = recommend(list, NOW);
      expect(r.kind === "action" && r.obligationId).toBe(id);
      list = markDone(list, id);
    }
    expect(recommend(list, NOW).kind).toBe("all-done");
  });
});

describe("parseText", () => {
  const TODAY = new Date("2026-10-25T12:00:00Z");
  it("handles the design-test paragraph: sentences, 'by 30 October', quotes", () => {
    const items = parseText("The report must be submitted by 30 October. Before submitting it, add the missing methodology section and check all references. Send the slides to the supervisor by 28 October.", TODAY);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: "The report must be submitted", deadline: "2026-10-30" });
    expect(items[1].deadline).toBeUndefined();
    expect(items[2]).toMatchObject({ deadline: "2026-10-28", sourceQuote: "Send the slides to the supervisor by 28 October." });
  });
  it("reads 'by October 30th', ISO dates, and rolls far-past dates to next year", () => {
    expect(parseText("Pay rent by October 30th", TODAY)[0].deadline).toBe("2026-10-30");
    expect(parseText("Pay rent by 2026-11-02", TODAY)[0].deadline).toBe("2026-11-02");
    expect(parseText("Renew by 5 January", TODAY)[0].deadline).toBe("2027-01-05");
  });
  it("does not treat 'before submitting' as a date", () => {
    expect(parseText("Before submitting it, check references", TODAY)[0].deadline).toBeUndefined();
  });
  it("parses 'after' dependencies, keeping unresolved ones so the engine can ask", () => {
    const items = parseText("- Publish post by 2026-10-25 after write README\n- Write README", TODAY);
    expect(items[0]).toMatchObject({ title: "Publish post", deadline: "2026-10-25", dependsOn: ["o2"] });
    expect(parseText("Ship it after QA", TODAY)[0].dependsOn).toEqual(["unresolved:QA"]);
  });
});

describe("validateProposal", () => {
  const SRC = "Send the slides by 28 October.";
  it("rejects malformed output", () => {
    expect(validateProposal("nope", SRC).ok).toBe(false);
    expect(validateProposal([{ id: "a", title: "x", deadline: "tomorrow" }], SRC).ok).toBe(false);
    expect(validateProposal([{ id: "a", title: "x", dependsOn: ["zzz"] }], SRC).ok).toBe(false);
  });
  it("keeps a deadline only when its quote is verbatim in the user's text", () => {
    const good = validateProposal([{ id: "a", title: "Send slides", deadline: "2026-10-28", sourceQuote: "send the slides by 28 october" }], SRC);
    expect(good.ok && good.obligations[0].deadline).toBe("2026-10-28");
    const bad = validateProposal([{ id: "a", title: "Send slides", deadline: "2026-10-28", sourceQuote: "Send slides by the 28th" }], SRC);
    expect(bad.ok && bad.obligations[0].deadline).toBeUndefined();
    expect(bad.ok && bad.warnings.length).toBeGreaterThan(0);
  });
  it("copies only known fields", () => {
    const v = validateProposal([{ id: "a", title: "x", evil: 1 }], SRC);
    expect(v.ok && Object.keys(v.obligations[0])).not.toContain("evil");
  });
});

describe("interpretWithModel", () => {
  const cfg = { baseUrl: "http://x/v1/", model: "m", apiKey: "k" };
  const reply = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
  const SRC = "Send the slides by 28 October.";
  const ok = JSON.stringify({ obligations: [{ id: "o1", title: "Send slides", deadline: "2026-10-28", sourceQuote: "Send the slides by 28 October" }] });

  it("parses fenced JSON and sends the key only as a bearer header", async () => {
    let seen: RequestInit | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => { seen = init; return reply("```json\n" + ok + "\n```"); }) as typeof fetch;
    const r = await interpretWithModel(SRC, cfg, "2026-10-25", f);
    expect(r.ok && r.obligations[0].deadline).toBe("2026-10-28");
    expect((seen!.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
  it("retries without response_format when the provider rejects it", async () => {
    let calls = 0;
    const f = (async (_u: unknown, init?: RequestInit) => { calls++; return JSON.parse(init!.body as string).response_format ? reply("", 400) : reply(ok); }) as typeof fetch;
    expect((await interpretWithModel(SRC, cfg, "2026-10-25", f)).ok).toBe(true);
    expect(calls).toBe(2);
  });
  it("fails closed on garbage or server errors", async () => {
    expect((await interpretWithModel(SRC, cfg, "d", (async () => reply("I cannot help")) as typeof fetch)).ok).toBe(false);
    expect((await interpretWithModel(SRC, cfg, "d", (async () => reply("", 500)) as typeof fetch)).ok).toBe(false);
    expect((await interpretWithModel(SRC, cfg, "d", (async () => { throw new Error("down"); }) as typeof fetch)).ok).toBe(false);
  });
  it("extractJson finds JSON inside prose", () => {
    expect(extractJson('Sure! {"a":1} done')).toEqual({ a: 1 });
  });
});
