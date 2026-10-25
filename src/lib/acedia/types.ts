export type Effort = "tiny" | "small" | "medium" | "large";

export interface Obligation {
  id: string;
  title: string;
  /** YYYY-MM-DD, interpreted as end of that day (UTC). */
  deadline?: string;
  /** ids of obligations that must be done first. */
  dependsOn: string[];
  effort?: Effort;
  /** Missing it cannot be undone. Blocks casual deferral. */
  irreversible?: boolean;
  /** A concrete first action, if the user (or interpreter) supplied one. */
  firstStep?: string;
  doneWhen?: string;
  /** Exact words from the user's text that support this item. Verified, never invented. */
  sourceQuote?: string;
  done?: boolean;
}

export type Deferral =
  | { kind: "waiting"; id: string; title: string; reason: string; reviewWhen: string }
  | {
      kind: "safe";
      id: string;
      title: string;
      reason: string;
      reviewAt: string;
      reconsiderIf: string;
    }
  | { kind: "not-justified"; id: string; title: string; reason: string };

export interface Recommendation {
  kind: "action";
  obligationId: string;
  title: string;
  action: string;
  doneWhen: string;
  /** Always non-empty. */
  reason: string[];
  deadlineNote?: string;
  deferred: Deferral[];
  uncertainty: string[];
}

export interface NeedsInfo {
  kind: "needs-info";
  question: string;
  reason: string;
}

export interface AllDone {
  kind: "all-done";
}

export type Result = Recommendation | NeedsInfo | AllDone;
