import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { getLLM } from "../llm.js";
import { semanticSearch, gatherUserContext } from "../embeddings.js";
import type { ContextMessage } from "@hcc/shared";
import { TASK_KINDS, TASK_PRIORITIES } from "@hcc/shared";

const ProposeActionsState = Annotation.Root({
  input: Annotation<string>,
  context_messages: Annotation<ContextMessage[]>,
  // Required so semanticSearch can scope to the caller's records and we
  // don't surface other users' data as proposal context.
  user_id: Annotation<string>,
  project_id: Annotation<string>,
  answer: Annotation<string>,
  proposed_actions: Annotation<
    Array<{
      title: string;
      description: string;
      kind: "task" | "event";
      priority: "low" | "medium" | "high" | "urgent";
      suggested_date: string | null;
    }>
  >,
  proposal_summary: Annotation<string>,
});

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text" || c.type === "output_text")
      .map((c: any) => c.text)
      .join("");
  }
  return String(content);
}

function sanitiseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sanitiseKind(value: unknown): "task" | "event" {
  return TASK_KINDS.includes(value as any) ? (value as "task" | "event") : "task";
}

function sanitisePriority(value: unknown): "low" | "medium" | "high" | "urgent" {
  return TASK_PRIORITIES.includes(value as any)
    ? (value as "low" | "medium" | "high" | "urgent")
    : "medium";
}

async function proposeActions(state: typeof ProposeActionsState.State) {
  // Always-on user context so the proposed actions can reflect the user's
  // saved criteria / projects without relying on whether those records
  // happen to land in the top-6 semantic-search results.
  const userContext = state.user_id
    ? await gatherUserContext(state.user_id)
    : null;
  const searchResults = state.user_id
    ? await semanticSearch(state.input, state.user_id, {
        limit: 6,
        projectId: state.project_id || null,
      })
    : [];
  const semanticBlock = searchResults
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source_type}/${r.source_id}]\n${r.content_preview}`
    )
    .join("\n\n");

  const contextParts: string[] = [];
  if (userContext) {
    contextParts.push(
      `Your projects and saved criteria (always included):\n${userContext}`
    );
  }
  if (semanticBlock) {
    contextParts.push(`Related records:\n${semanticBlock}`);
  }
  const context = contextParts.join("\n\n");

  const conversation = (state.context_messages ?? [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are an expert assistant helping someone buy or sell a home in New Zealand. The user has asked you to break a goal down into concrete, trackable actions.

Today's date: ${today}.

Return JSON with this exact shape:
{
  "answer": "Short plain-English explanation (1-3 sentences) describing how you broke the goal down.",
  "proposed_actions": [
    {
      "title": "Short imperative action title (max 80 chars)",
      "description": "1-2 sentence detail of what this step involves. Empty string if obvious from title.",
      "kind": "task" or "event",
      "priority": "low" | "medium" | "high" | "urgent",
      "suggested_date": "YYYY-MM-DD" (a reasonable target date, staggered across the next 1-4 weeks based on dependencies and effort)
    }
  ],
  "proposal_summary": "One-line summary of the overall plan (e.g. 'A 6-step staging plan over the next 2 weeks')."
}

Rules:
- Produce between 3 and 12 actions. Prefer fewer, well-scoped actions over a long granular list.
- Use "event" only for things tied to a specific time (open homes, agent meetings, inspections). Everything else is "task".
- Stagger suggested_date sensibly across the next 1-4 weeks starting from ${today}. Order by dependency.
- Title MUST start with a verb (Book, Tidy, Photograph, Confirm, …).
- Priority: "high" for blockers / time-critical, "urgent" for must-do-now, "medium" for normal, "low" for optional polish.
- Be specific to the user's situation when their records below give you useful detail.
- If the request is genuinely ambiguous, still produce a sensible default plan — the user can edit before approving.

Return ONLY valid JSON. No prose outside the JSON.`;

  const userText = [
    conversation ? `Prior conversation:\n${conversation}` : "",
    `Context from the user's records:\n${context || "No relevant data found in their records."}`,
    `Goal: ${state.input}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const llm = getLLM();
  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ]);
  const text = extractTextContent(response.content);

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    const rawActions: any[] = Array.isArray(parsed.proposed_actions)
      ? parsed.proposed_actions
      : [];
    const proposed = rawActions
      .map((a) => ({
        title: typeof a?.title === "string" ? a.title.slice(0, 500) : "",
        description: typeof a?.description === "string" ? a.description : "",
        kind: sanitiseKind(a?.kind),
        priority: sanitisePriority(a?.priority),
        suggested_date: sanitiseDate(a?.suggested_date),
      }))
      .filter((a) => a.title.trim().length > 0);

    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      proposed_actions: proposed,
      proposal_summary:
        typeof parsed.proposal_summary === "string" ? parsed.proposal_summary : "",
    };
  } catch {
    return {
      answer: text,
      proposed_actions: [],
      proposal_summary: "",
    };
  }
}

const graph = new StateGraph(ProposeActionsState)
  .addNode("proposeActions", proposeActions)
  .addEdge(START, "proposeActions")
  .addEdge("proposeActions", END);

export const proposeActionsWorkflow = graph.compile();
