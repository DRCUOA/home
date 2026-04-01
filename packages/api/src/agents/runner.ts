import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { withModel } from "./llm.js";
import { summariseWorkflow } from "./workflows/summarise.js";
import { extractKeyPointsWorkflow } from "./workflows/extract-key-points.js";
import { suggestQuestionsWorkflow } from "./workflows/suggest-questions.js";
import { cleanNotesWorkflow } from "./workflows/clean-notes.js";
import { comparePropertiesWorkflow } from "./workflows/compare-properties.js";
import { explainScenarioWorkflow } from "./workflows/explain-scenario.js";
import { identifyMissingWorkflow } from "./workflows/identify-missing.js";
import { recommendActionsWorkflow } from "./workflows/recommend-actions.js";
import { projectSummaryWorkflow } from "./workflows/project-summary.js";
import { qaWorkflow } from "./workflows/qa.js";
import { enrichPropertyWorkflow } from "./workflows/enrich-property.js";
import { semanticSearch } from "./embeddings.js";
import type { AssistantTool, ContextMessage } from "@hcc/shared";

type WorkflowType =
  | "summarise_document"
  | "extract_key_points"
  | "suggest_follow_up_questions"
  | "clean_up_notes"
  | "compare_properties"
  | "explain_scenario"
  | "identify_missing_info"
  | "recommend_next_actions"
  | "project_state_summary"
  | "semantic_search"
  | "qa"
  | "enrich_property";

export async function runWorkflow(
  runId: string,
  workflowType: WorkflowType,
  input: string,
  userId: string,
  imageBase64?: string,
  model?: string,
  tools?: AssistantTool[],
  contextMessages?: ContextMessage[]
): Promise<void> {
  const run = async () => {
    let result: any;

    switch (workflowType) {
      case "summarise_document":
        result = await summariseWorkflow.invoke({ input });
        break;
      case "extract_key_points":
        result = await extractKeyPointsWorkflow.invoke({ input });
        break;
      case "suggest_follow_up_questions":
        result = await suggestQuestionsWorkflow.invoke({ input });
        break;
      case "clean_up_notes":
        result = await cleanNotesWorkflow.invoke({ input });
        break;
      case "compare_properties":
        result = await comparePropertiesWorkflow.invoke({ input });
        break;
      case "explain_scenario":
        result = await explainScenarioWorkflow.invoke({ input });
        break;
      case "identify_missing_info":
        result = await identifyMissingWorkflow.invoke({ input });
        break;
      case "recommend_next_actions":
        result = await recommendActionsWorkflow.invoke({ input });
        break;
      case "project_state_summary":
        result = await projectSummaryWorkflow.invoke({ input });
        break;
      case "semantic_search": {
        const searchResults = await semanticSearch(input, 10);
        result = { results: searchResults };
        break;
      }
      case "qa":
        result = await qaWorkflow.invoke({
          input,
          image_base64: imageBase64 ?? "",
          tools: tools ?? [],
          context_messages: contextMessages ?? [],
        });
        break;
      case "enrich_property": {
        const parsed = JSON.parse(input);
        result = await enrichPropertyWorkflow.invoke({
          listing_url: parsed.listing_url ?? "",
          address: parsed.address ?? "",
          suburb: parsed.suburb ?? "",
          city: parsed.city ?? "",
        });
        break;
      }
      default:
        throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    const { input: _input, ...outputFields } = result;
    return JSON.stringify(outputFields, null, 2);
  };

  try {
    const outputSummary = model
      ? await withModel(model, run)
      : await run();

    await db
      .update(schema.agentRuns)
      .set({
        status: "completed",
        output_summary: outputSummary,
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.agentRuns.id, runId));
  } catch (error: any) {
    await db
      .update(schema.agentRuns)
      .set({
        status: "failed",
        output_summary: JSON.stringify({ error: error.message }),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.agentRuns.id, runId));
  }
}
