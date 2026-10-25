import type { Deferral, Obligation, Result } from "./types";

const DAY = 86_400_000;
const URGENT_WITHIN_DAYS = 2;
const SAFE_DEFERRAL_MIN_DAYS = 7;
const EFFORT_RANK = { tiny: 0, small: 1, medium: 2, large: 3 } as const;

const endOfDay = (iso: string) => Date.parse(`${iso}T23:59:59Z`);
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const depName = (id: string) => id.replace(/^unresolved:/, "");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Pure and deterministic: same obligations + same `now` => same result.
 *
 * Rules, in order (the first difference decides):
 *  1. Only items with no open prerequisites can be chosen.
 *  2. Urgent first: effective deadline is overdue or within 2 days.
 *     (Effective deadline = earliest of the item's own deadline and the
 *     deadlines of everything that transitively depends on it.)
 *  3. Enablers first: more open items waiting on it.
 *  4. Earlier effective deadline.
 *  5. Irreversible if missed.
 *  6. Smaller effort.
 *  7. Original input order.
 *
 * Deferral is only called "safe" with a known effective deadline >= 7 days away,
 * not irreversible. Missing information never counts as safe.
 */
export function recommend(all: Obligation[], now: Date): Result {
  const open = all.filter((o) => !o.done);
  if (open.length === 0) return { kind: "all-done" };

  const known = new Set(all.map((o) => o.id));
  const openIds = new Set(open.map((o) => o.id));

  for (const o of open) {
    for (const d of o.dependsOn) {
      if (!known.has(d)) {
        return {
          kind: "needs-info",
          question: `"${o.title}" depends on "${depName(d)}", which isn't in your list. Add it, or remove the dependency?`,
          reason: "A dependency I can't see could change what comes first.",
        };
      }
    }
  }

  const unmet = (o: Obligation) => o.dependsOn.filter((d) => openIds.has(d));
  const ready = open.filter((o) => unmet(o).length === 0);
  if (ready.length === 0) {
    return {
      kind: "needs-info",
      question: "Every open item is waiting on another one. Which of them can actually start now?",
      reason: "The dependencies form a loop, so nothing is startable.",
    };
  }

  const nowMs = now.getTime();
  const byId = new Map(open.map((o) => [o.id, o]));

  // transitive open dependents of each open item
  const dependents = new Map<string, Set<string>>();
  for (const o of open) {
    const seen = new Set<string>();
    const queue = [o.id];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const p of open) {
        if (p.dependsOn.includes(cur) && !seen.has(p.id)) {
          seen.add(p.id);
          queue.push(p.id);
        }
      }
    }
    dependents.set(o.id, seen);
  }

  const info = (o: Obligation) => {
    let eff: number | undefined;
    let via: string | undefined;
    const consider = (src: Obligation) => {
      if (!src.deadline) return;
      const ms = endOfDay(src.deadline);
      if (Number.isNaN(ms)) return;
      if (eff === undefined || ms < eff) {
        eff = ms;
        via = src.id === o.id ? undefined : src.title;
      }
    };
    consider(o);
    for (const id of dependents.get(o.id)!) consider(byId.get(id)!);
    return { eff, via, unlocks: dependents.get(o.id)!.size };
  };

  const order = new Map(open.map((o, i) => [o.id, i]));
  const rank = (o: Obligation) => {
    const { eff, unlocks } = info(o);
    const urgent = eff !== undefined && eff - nowMs <= URGENT_WITHIN_DAYS * DAY ? 0 : 1;
    return [
      urgent,
      -unlocks,
      eff ?? Number.POSITIVE_INFINITY,
      o.irreversible ? 0 : 1,
      EFFORT_RANK[o.effort ?? "medium"],
      order.get(o.id)!,
    ];
  };
  const sorted = [...ready].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    return 0;
  });

  const chosen = sorted[0];
  const ci = info(chosen);

  const reason: string[] = [];
  let deadlineNote: string | undefined;
  if (ci.eff !== undefined) {
    const days = Math.ceil((ci.eff - nowMs) / DAY);
    const when = days < 0 ? `overdue by ${plural(-days, "day")}` : days === 0 ? "today" : `in ${plural(days, "day")}`;
    deadlineNote = `Deadline ${isoDate(ci.eff)} (${when})${ci.via ? `, inherited from "${ci.via}"` : ""}.`;
    if (days <= URGENT_WITHIN_DAYS) reason.push(`The deadline is ${days < 0 ? "past" : "within 2 days"}.`);
  }
  if (ci.unlocks > 0) {
    const names = [...dependents.get(chosen.id)!].map((id) => `"${byId.get(id)!.title}"`);
    reason.push(`${plural(ci.unlocks, "item")} can't start until this is done: ${names.join(", ")}.`);
  }
  if (chosen.irreversible) reason.push("Missing it can't be undone.");
  if (reason.length === 0) {
    reason.push(
      ready.length === 1
        ? "It is the only item with no open prerequisites."
        : "Nothing in your list separates these by deadline or dependency, so this is the smallest one you can start now.",
    );
  }

  const uncertainty: string[] = [];
  if (!chosen.firstStep) uncertainty.push("No concrete first step was given, so the action is to define one.");
  if (ci.eff === undefined) uncertainty.push("No deadline known for this item.");
  const noDeadline = open.filter((o) => o.id !== chosen.id && info(o).eff === undefined);
  if (noDeadline.length)
    uncertainty.push(`${plural(noDeadline.length, "other item")} ha${noDeadline.length === 1 ? "s" : "ve"} no deadline, so I can't tell whether they can wait.`);

  const deferred: Deferral[] = [];
  for (const o of open) {
    if (o.id === chosen.id) continue;
    const deps = unmet(o);
    if (deps.length) {
      const names = deps.map((d) => `"${byId.get(d)!.title}"`).join(", ");
      deferred.push({ kind: "waiting", id: o.id, title: o.title, reason: `Needs ${names} first.`, reviewWhen: `When ${names} ${deps.length === 1 ? "is" : "are"} done.` });
      continue;
    }
    const oi = info(o);
    if (o.irreversible) {
      deferred.push({ kind: "not-justified", id: o.id, title: o.title, reason: "Missing it can't be undone, so waiting needs your explicit decision." });
    } else if (oi.eff === undefined) {
      deferred.push({ kind: "not-justified", id: o.id, title: o.title, reason: "No deadline given, so I can't show that waiting is safe. Add a date if it has one." });
    } else {
      const days = Math.ceil((oi.eff - nowMs) / DAY);
      if (days >= SAFE_DEFERRAL_MIN_DAYS) {
        deferred.push({
          kind: "safe",
          id: o.id,
          title: o.title,
          reason: `Effective deadline ${isoDate(oi.eff)} is ${plural(days, "day")} away.`,
          reviewAt: isoDate(nowMs + Math.floor(days / 2) * DAY),
          reconsiderIf: "Its deadline moves earlier, something becomes blocked on it, or it turns out to take longer than expected.",
        });
      } else {
        deferred.push({ kind: "not-justified", id: o.id, title: o.title, reason: `Deadline ${isoDate(oi.eff)} is ${days < 0 ? "past" : `${plural(days, "day")} away`}, too close to call waiting safe. It is next in line.` });
      }
    }
  }

  return {
    kind: "action",
    obligationId: chosen.id,
    title: chosen.title,
    action: chosen.firstStep ?? `Define the smallest version of "${chosen.title}" you could finish in one sitting, and write it down in one sentence.`,
    doneWhen: chosen.doneWhen ?? (chosen.firstStep ? "You can point to something concrete that shows this step is finished." : "One sentence describing that smallest version exists."),
    reason,
    deadlineNote,
    deferred,
    uncertainty,
  };
}

export function markDone(all: Obligation[], id: string): Obligation[] {
  return all.map((o) => (o.id === id ? { ...o, done: true } : o));
}
