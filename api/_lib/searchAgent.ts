// Claude as the fare scout: it decides which day combinations are worth a SerpApi search, within a hard
// budget. It never sees or writes anything the app shows: it only steers which searches run. Every price the
// traveler sees still comes from SerpApi's response, and the provider enforces dates, airports and the budget.
import type Anthropic from '@anthropic-ai/sdk';
import { getClient, logUsage, type ClaudeDeps, type ModelPlan } from './claude.js';
import { SEARCH_TOOL, searchSystemPrompt, type SearchPromptInput } from './prompt.js';
import { HttpError } from './http.js';
import type { LiveSearch } from './providers/types.js';

/** Stops the loop even if the model keeps asking: the budget plus a couple of turns to say "done". */
const maxTurns = (budget: number) => budget + 2;

/**
 * Runs the scouting conversation. Resolves when Claude says it is done, the budget is spent, or Claude can't be
 * reached (the caller uses whatever was priced). Rethrows a SerpApi-credit error (HttpError) only when nothing
 * at all was priced, so the traveler gets the same "at capacity" message as before.
 */
export async function scoutFares(live: LiveSearch, input: SearchPromptInput, plan: ModelPlan, deps: ClaudeDeps = {}): Promise<void> {
  const client = deps.client ?? getClient();
  const system = searchSystemPrompt({ ...input, budget: live.budget });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'Scout the fares now.' }];
  let fatal: HttpError | undefined;

  for (let turn = 0; turn < maxTurns(live.budget); turn++) {
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: plan.primary,
        max_tokens: 4000,
        system,
        tools: [SEARCH_TOOL],
        output_config: { effort: plan.effort },
        messages,
      });
    } catch (err) {
      console.error(`[claude] scout turn ${turn + 1} (${plan.primary}) failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    logUsage('scout', plan.primary, res.usage);
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') break;
    // Echo the whole assistant turn back unchanged (thinking blocks included) so the conversation stays valid.
    messages.push({ role: 'assistant', content: res.content });

    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (calls.length === 0) break;

    // Parallel calls run together; every tool_use gets a tool_result, all in ONE user message.
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      calls.map(async (call) => {
        const a = (call.input ?? {}) as Record<string, unknown>;
        try {
          const reply = await live.run({
            outDate: String(a.out_date ?? ''),
            backDate: typeof a.back_date === 'string' ? a.back_date : null,
            destination: String(a.destination ?? 'main'),
          });
          return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(reply), ...('error' in reply ? { is_error: true } : {}) };
        } catch (err) {
          if (err instanceof HttpError) fatal ??= err;
          console.error('[claude] search_flights failed', err instanceof Error ? err.message : err);
          return { type: 'tool_result', tool_use_id: call.id, content: 'Live fares are unavailable right now. Reply "done".', is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
    if (fatal) break;
  }

  if (fatal && (await live.result()).candidates.length === 0) throw fatal;
}
