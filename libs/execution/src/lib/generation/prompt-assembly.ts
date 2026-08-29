// Full posts at a context window of ten would dominate the prompt and
// inflate token costs for diminishing benefit — truncate each entry.
const RECENT_POST_TRUNCATE_LENGTH = 300;

const OUTPUT_INSTRUCTIONS =
  'Return only the post body. No preamble, no explanation, no code fences, no surrounding quotes.';

export interface AssemblePromptParams {
  systemPrompt?: string;
  userPrompt: string;
  /** Only successful executions should ever be passed in — see docs §7. */
  recentPosts: string[];
}

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Folds anti-repetition context and output instructions into the system
 * prompt. An LLM given the identical prompt every run produces
 * near-identical output — recent successful posts are fed back as negative
 * context so the model is nudged to differ in topic and angle.
 */
export function assemblePrompt({ systemPrompt, userPrompt, recentPosts }: AssemblePromptParams): AssembledPrompt {
  const antiRepetition =
    recentPosts.length > 0
      ? `Avoid repeating the topic or angle of these recent posts:\n${recentPosts
          .map((post, i) => `${i + 1}. ${post.slice(0, RECENT_POST_TRUNCATE_LENGTH)}`)
          .join('\n')}`
      : '';

  return {
    systemPrompt: [systemPrompt, antiRepetition, OUTPUT_INSTRUCTIONS].filter(Boolean).join('\n\n'),
    userPrompt,
  };
}
