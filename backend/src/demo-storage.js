// Public portfolio accounts operate only on disposable, per-account sample data.
const {AsyncLocalStorage} = require('node:async_hooks');
const {randomUUID} = require('node:crypto');
const seed = require('../data/products.seed.json');
const demoContext = new AsyncLocalStorage();
const sandboxes = new Map();
function isDemoUser(user) { return user?.app_metadata?.demo === true; }
function sandboxFor(user) {
  let sandbox = sandboxes.get(user.id);
  if (!sandbox || Date.now() - sandbox.createdAt > 30 * 60 * 1000) {
    const entities = new Map(seed.map(p => [p.id, {...structuredClone(p), quantity: 100}]));
    const product = seed[0];
    const items = [{productId: product.id, name: product.name, quantity: 1, price: product.price, etaMinutes: product.etaMinutes}];
    entities.set('demo_sample_order', {id: 'demo_sample_order', entityType: 'ORDER', userId: user.id, status: 'PLACED', createdAt: new Date().toISOString(), selectedMode: 'fastest', plan: {userRequest: 'Sample demo order', recommendedMode: 'fastest', cartModes: {fastest: {items, etaMinutes: product.etaMinutes}}, checkoutSummary: {estimatedTotal: product.price, itemCount: 1, etaMinutes: product.etaMinutes}}});
    sandbox = {entities, createdAt: Date.now()};
    sandboxes.set(user.id, sandbox);
  }
  return sandbox;
}
function runDemo(user, callback) {
  if (!isDemoUser(user)) return callback();
  return demoContext.run({user, ...sandboxFor(user)}, callback);
}
function sendDemo(command) {
  const {user, entities} = demoContext.getStore();
  const admin = user.app_metadata.groups?.includes('demo_admin');
  const p = command.input;
  const type = command.constructor.name;
  const visible = item => item && (item.entityType === 'PRODUCT' || item.userId === user.id || admin);
  const writable = item => item && (item.entityType === 'PRODUCT' || item.entityType === 'ITEM' ? admin : item.userId === user.id && ['CART','SHOPPING_PLAN','FEEDBACK'].includes(item.entityType));
  if (type === 'GetCommand') {
    const item = entities.get(p.Key.id);
    return {Item: visible(item) ? structuredClone(item) : undefined};
  }
  if (type === 'PutCommand') {
    if (!writable(p.Item) || (entities.has(p.Item.id) && !writable(entities.get(p.Item.id)))) throw new Error('Demo access denied');
    if (entities.size >= 1500 && !entities.has(p.Item.id)) throw new Error('Demo is full; it resets every 30 minutes');
    entities.set(p.Item.id, structuredClone(p.Item));
    return {};
  }
  if (type === 'DeleteCommand') {
    const item = entities.get(p.Key.id);
    if (item && !writable(item)) throw new Error('Demo access denied');
    entities.delete(p.Key.id);
    return {};
  }
  if (type === 'TransactWriteCommand') {
    const order = p.TransactItems.find(x => x.Put)?.Put.Item;
    const updates = p.TransactItems.filter(x => x.Update).map(({Update: x}) => ({id: x.Key.id, quantity: x.ExpressionAttributeValues[':quantity']}));
    const fail = () => { const error = new Error('Demo inventory changed'); error.name = 'TransactionCanceledException'; throw error; };
    if (!order || order.userId !== user.id || !updates.length || updates.length > 99 || entities.size >= 1500) fail();
    const seen = new Set();
    const items = updates.map(({id, quantity}) => {
      const product = entities.get(id);
      if (seen.has(id) || !Number.isSafeInteger(quantity) || quantity < 1 || !product || product.entityType !== 'PRODUCT' || product.available === false || product.isAvailable === false || product.quantity < quantity) fail();
      seen.add(id);
      return {productId: id, name: product.name, price: Number(product.price), quantity, etaMinutes: Number(product.etaMinutes), reason: 'Confirmed against demo inventory.'};
    });
    // Validate everything before changing stock; this synchronous commit is atomic.
    const canonical = {id: `demo_order_${randomUUID()}`, entityType: 'ORDER', userId: user.id, selectedMode: order.selectedMode, status: 'PLACED', createdAt: new Date().toISOString(), plan: structuredClone(order.plan)};
    canonical.plan.cartModes[order.selectedMode].items = items;
    canonical.plan.checkoutSummary = {...canonical.plan.checkoutSummary, estimatedTotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0), itemCount: items.reduce((sum, item) => sum + item.quantity, 0), etaMinutes: Math.max(...items.map(x => x.etaMinutes))};
    canonical.plan.cartModes[order.selectedMode].etaMinutes = canonical.plan.checkoutSummary.etaMinutes;
    for (const item of items) entities.get(item.productId).quantity -= item.quantity;
    entities.set(canonical.id, canonical);
    Object.assign(order, structuredClone(canonical));
    return {};
  }
  const values = p.ExpressionAttributeValues || {};
  let items = [...entities.values()].filter(visible);
  if (values[':entityType']) items = items.filter(item => item.entityType === values[':entityType']);
  if (values[':userId']) items = items.filter(item => item.userId === values[':userId']);
  if (!p.FilterExpression && type === 'ScanCommand') items = items.filter(item => item.entityType === 'ITEM');
  items.sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id));
  if (p.ScanIndexForward === false) items.reverse();
  const offset = p.ExclusiveStartKey?.offset || 0;
  const limit = Math.min(p.Limit || 300, 300);
  const page = items.slice(offset, offset + limit);
  return {Items: structuredClone(page), LastEvaluatedKey: offset + limit < items.length ? {offset: offset + limit} : undefined};
}
module.exports = {demoContext, isDemoUser, runDemo, sendDemo};
