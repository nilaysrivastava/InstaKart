// Optional OpenAI-compatible model endpoint. The built-in planner remains usable
// without a paid API or AWS account and clearly reports its fallback provenance.
async function complete({prompt, maxTokens = 650, temperature = 0.12}) {
  if (!process.env.AI_API_KEY) throw new Error('Using built-in inventory planner (no model key configured)');
  const baseUrl = (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
  const groqReasoning = new URL(baseUrl).hostname === 'api.groq.com' && /^openai\/gpt-oss-(20|120)b$/.test(process.env.AI_MODEL || '');
  // GPT-OSS counts reasoning against the output limit. Leave room for the JSON
  // answer as well as reasoning, which is never needed by the storefront.
  const tokenOptions = groqReasoning
    ? {max_completion_tokens: Math.max(4096, maxTokens), reasoning_effort: 'low', include_reasoning: false}
    : {max_tokens: maxTokens};
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}`},
    body: JSON.stringify({model: process.env.AI_MODEL, messages: [{role: 'user', content: prompt}], ...tokenOptions, temperature}),
  });
  if (!response.ok) throw new Error(`Model provider returned ${response.status}`);
  const result = await response.json();
  const choice = result.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('Model response exceeded its output limit');
  if (!choice?.message?.content) throw new Error('Model provider returned an empty answer');
  return choice.message.content;
}
module.exports = {complete};
