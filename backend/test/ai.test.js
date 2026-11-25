const test = require('node:test');
const assert = require('node:assert/strict');
const {complete} = require('../src/ai');

test('Groq reasoning models reserve output tokens and reject incomplete answers', async () => {
  const previous = {...process.env};
  const originalFetch = global.fetch;
  try {
    process.env.AI_API_KEY = 'test-only-key';
    process.env.AI_BASE_URL = 'https://api.groq.com/openai/v1/';
    process.env.AI_MODEL = 'openai/gpt-oss-120b';
    let request;
    let choice = {message: {content: '{"ready":true}'}, finish_reason: 'stop'};
    global.fetch = async (url, options) => {
      request = {url, ...JSON.parse(options.body)};
      return {ok: true, json: async () => ({choices: [choice]})};
    };
    assert.equal(await complete({prompt: 'Return JSON'}), '{"ready":true}');
    assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(request.max_completion_tokens, 4096);
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.include_reasoning, false);
    assert.equal(request.max_tokens, undefined);
    choice = {message: {content: '{"partial":'}, finish_reason: 'length'};
    await assert.rejects(complete({prompt: 'Return JSON'}), /output limit/);
    choice = {message: {}, finish_reason: 'stop'};
    await assert.rejects(complete({prompt: 'Return JSON'}), /empty answer/);
    process.env.AI_BASE_URL = 'https://example.com/v1';
    choice = {message: {content: 'answer'}, finish_reason: 'stop'};
    await complete({prompt: 'Hello', maxTokens: 350});
    assert.equal(request.max_tokens, 350);
    assert.equal(request.reasoning_effort, undefined);
  } finally {
    global.fetch = originalFetch;
    for (const key of ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
