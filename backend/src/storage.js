// Preserve the commerce entity model while storing durable documents in Postgres.
const { createClient } = require('@supabase/supabase-js');
const {AsyncLocalStorage} = require('node:async_hooks');
const requestAuth = new AsyncLocalStorage();
function getClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  const token = requestAuth.getStore();
  return createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false},
    global: token ? {headers: {Authorization: `Bearer ${token}`}} : {},
  });
}
class GetCommand { constructor(input) { this.input = input; } }
class PutCommand { constructor(input) { this.input = input; } }
class DeleteCommand { constructor(input) { this.input = input; } }
class QueryCommand { constructor(input) { this.input = input; } }
class ScanCommand { constructor(input) { this.input = input; } }
class TransactWriteCommand { constructor(input) { this.input = input; } }
const docClient = {async send(command) {
  if (require('./demo-storage').demoContext.getStore()) return require('./demo-storage').sendDemo(command);
  const db = getClient();
  const p = command.input;
  let result;
  if (command instanceof GetCommand) {
    result = await db.from('commerce_entities').select('data').eq('id', p.Key.id).maybeSingle();
    if (result.error) throw result.error;
    return {Item: result.data?.data};
  }
  if (command instanceof PutCommand) {
    result = await db.from('commerce_entities').upsert({id: p.Item.id, data: p.Item});
  } else if (command instanceof DeleteCommand) {
    result = await db.from('commerce_entities').delete().eq('id', p.Key.id);
  } else if (command instanceof TransactWriteCommand) {
    const order = p.TransactItems.find(x => x.Put)?.Put.Item;
    const items = p.TransactItems.filter(x => x.Update).map(({Update: x}) => ({productId: x.Key.id, quantity: x.ExpressionAttributeValues[':quantity']}));
    result = await db.rpc('checkout_order', {p_order: order, p_items: items});
    if (result.error) {
      const error = new Error(result.error.message);
      error.name = 'TransactionCanceledException';
      throw error;
    }
    Object.assign(order, result.data);
  } else {
    let query = db.from('commerce_entities').select('data');
    const values = p.ExpressionAttributeValues || {};
    if (values[':entityType']) query = query.eq('entity_type', values[':entityType']);
    if (values[':userId']) query = query.eq('user_id', values[':userId']);
    // The old development list must never expose carts, plans or customer records.
    if (!p.FilterExpression && command instanceof ScanCommand) query = query.eq('entity_type', 'ITEM');
    query = query.order('created_at', {ascending: p.ScanIndexForward !== false}).order('id');
    const offset = p.ExclusiveStartKey?.offset || 0;
    const limit = Math.min(p.Limit || 300, 300);
    result = await query.range(offset, offset + limit - 1);
    if (result.error) throw result.error;
    return {Items: result.data.map(x => x.data), LastEvaluatedKey: result.data.length === limit ? {offset: offset + limit} : undefined};
  }
  if (result.error) throw result.error;
  return {};
}};
module.exports = {getClient, requestAuth, docClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, TransactWriteCommand};
