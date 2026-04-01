import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { tools as openaiTools } from "@langchain/openai";
import { getLLM } from "../llm.js";
import { PROPERTY_TYPES, LISTING_METHODS } from "@hcc/shared";

const EnrichState = Annotation.Root({
  listing_url: Annotation<string>,
  address: Annotation<string>,
  suburb: Annotation<string>,
  city: Annotation<string>,
  extracted: Annotation<Record<string, any>>,
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

async function enrichNode(state: typeof EnrichState.State) {
  const llm = getLLM();

  const propertyTypes = PROPERTY_TYPES.join(", ");
  const listingMethods = LISTING_METHODS.join(", ");

  const searchContext = [
    state.listing_url && `Listing URL: ${state.listing_url}`,
    state.address && `Address: ${state.address}`,
    state.suburb && `Suburb: ${state.suburb}`,
    state.city && `City: ${state.city}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await llm.invoke(
    [
      {
        role: "system",
        content: `You are a New Zealand property research assistant. Your job is to find and extract detailed information about a property listing.

You MUST use web search to look up the property. Start by searching for the listing URL if provided. Also search for the address to find additional information from other sources (e.g. homes.co.nz, realestate.co.nz, trademe.co.nz, oneroof.co.nz).

Extract as much structured data as possible. Return ONLY valid JSON with these fields (use null for anything you cannot find):

- address: string — full street address
- suburb: string | null
- city: string | null
- price_asking: number | null — asking price in NZD (numeric, no $ sign)
- price_guide_low: number | null — lower end of price guide/range
- price_guide_high: number | null — upper end of price guide/range
- bedrooms: number | null
- bathrooms: number | null
- parking: number | null — garage/carport spaces
- land_area_sqm: number | null — land area in square metres
- floor_area_sqm: number | null — floor area in square metres
- property_type: string | null — one of: ${propertyTypes}
- listing_method: string | null — one of: ${listingMethods}
- listing_description: string | null — the full marketing description/blurb from the listing (preserve paragraphs)
Important:
- For prices, return raw numbers (e.g. 850000 not "$850,000")
- For areas, convert to square metres if given in other units
- If price is "by negotiation" or "auction", set price fields to null and reflect it in listing_method
- If you find "enquiries over $X", set price_guide_low to X
- Only include data you actually found — do not guess or make up values
- Return ONLY the JSON object, no other text`,
      },
      {
        role: "user",
        content: `Find and extract all available details for this property:\n\n${searchContext}`,
      },
    ],
    {
      tools: [
        openaiTools.webSearch({
          search_context_size: "high",
          userLocation: {
            type: "approximate",
            country: "NZ",
            timezone: "Pacific/Auckland",
          },
        }),
      ],
    }
  );

  const text = extractTextContent(response.content);
  console.log("[Enrich] Raw LLM response content type:", typeof response.content);
  console.log("[Enrich] Raw LLM response content:", JSON.stringify(response.content).slice(0, 2000));
  console.log("[Enrich] Extracted text length:", text.length);
  console.log("[Enrich] Extracted text:", text.slice(0, 2000));

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[Enrich] No JSON object found in response text");
      return { extracted: {} };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("[Enrich] Parsed JSON keys:", Object.keys(parsed));

    const clean: Record<string, any> = {};
    const stringFields = [
      "address",
      "suburb",
      "city",
      "property_type",
      "listing_method",
      "listing_description",
    ];
    const numberFields = [
      "price_asking",
      "price_guide_low",
      "price_guide_high",
      "bedrooms",
      "bathrooms",
      "parking",
      "land_area_sqm",
      "floor_area_sqm",
    ];

    for (const f of stringFields) {
      if (parsed[f] != null && parsed[f] !== "") clean[f] = String(parsed[f]);
    }
    for (const f of numberFields) {
      const v = parsed[f];
      if (v != null && !isNaN(Number(v))) clean[f] = Number(v);
    }

    console.log("[Enrich] Clean extracted fields:", Object.keys(clean));
    return { extracted: clean };
  } catch (err) {
    console.error("[Enrich] JSON parse failed:", err);
    console.log("[Enrich] Failed text was:", text.slice(0, 1000));
    return { extracted: {} };
  }
}

const graph = new StateGraph(EnrichState)
  .addNode("enrich", enrichNode)
  .addEdge(START, "enrich")
  .addEdge("enrich", END);

export const enrichPropertyWorkflow = graph.compile();
