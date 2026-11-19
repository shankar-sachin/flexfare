// Counts Claude tokens per model per UTC day (one Firestore doc a day) so the admin page can show real usage
// and an estimated cost. A failed write never breaks a search.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firestore.js';
import { todayKey } from './http.js';

/** "claude-sonnet-5-5" -> "claude_sonnet_5_5" (a safe Firestore field name). */
export const modelKey = (model: string) => model.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

export async function recordClaudeUsage(model: string, usage: { input_tokens?: number; output_tokens?: number }): Promise<void> {
  try {
    await db()
      .collection('usage')
      .doc(`claude_${todayKey()}`)
      .set(
        { models: { [modelKey(model)]: { calls: FieldValue.increment(1), in: FieldValue.increment(usage.input_tokens ?? 0), out: FieldValue.increment(usage.output_tokens ?? 0) } } },
        { merge: true },
      );
  } catch {
    // not configured (tests, local dev) or a hiccup: usage counters are best effort
  }
}
