// Optional OpenAI-compatible model endpoint. The built-in planner remains usable
// without a paid API or AWS account and clearly reports its fallback provenance.
async function complete({prompt, maxTokens = 650, temperature = 0.12}) {
  if (!process.env.AI_API_KEY) throw new Error('Using built-in inventory planner (no model key configured)');
  const response = await fetch(`${(process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}`},
    body: JSON.stringify({model: process.env.AI_MODEL, messages: [{role: 'user', content: prompt}], max_tokens: maxTokens, temperature}),
  });
  if (!response.ok) throw new Error(`Model provider returned ${response.status}`);
  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}
module.exports = {complete};
