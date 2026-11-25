const test = require('node:test');
const assert = require('node:assert/strict');
const {runDemo, demoContext} = require('../src/demo-storage');
const {docClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand} = require('../src/storage');
const handlers = require('../src/handler');
const user = {id: 'demo-user-test', email: 'demo.user@instakart.example', app_metadata: {demo: true, groups: ['demo_user']}};
const admin = {id: 'demo-admin-test', email: 'demo.admin@instakart.example', app_metadata: {demo: true, groups: ['demo_admin']}};
const event = {headers: {authorization: 'Bearer verified-by-server'}, body: '{}'};
const products = () => docClient.send(new QueryCommand({ExpressionAttributeValues: {':entityType': 'PRODUCT'}}));

test('demo shopping and inventory mutations stay isolated by account and cannot pollute the live cache', async () => {
  assert.equal(demoContext.getStore(), undefined);
  const original = await runDemo(user, async () => (await products()).Items[0]);
  await runDemo(admin, async () => {
    const response = await handlers.updateAdminInventory({...event, pathParameters: {id: original.id}, body: JSON.stringify({...original, price: 42, quantity: 2})});
    assert.equal(response.statusCode, 200);
    const catalog = JSON.parse((await handlers.listNowProducts(event)).body);
    assert.equal(catalog.products.find(p => p.id === original.id).price, 42);
  });
  await runDemo(user, async () => {
    assert.equal((await docClient.send(new GetCommand({Key: {id: original.id}}))).Item.price, original.price);
    assert.equal((await handlers.updateAdminInventory({...event, pathParameters: {id: original.id}, body: '{}'})).statusCode, 403);
    await assert.rejects(docClient.send(new PutCommand({Item: {...original, price: 1}})), /access denied/);
    await assert.rejects(docClient.send(new PutCommand({Item: {id: 'other-cart', entityType: 'CART', userId: admin.id}})), /access denied/);
  });
  assert.equal(demoContext.getStore(), undefined);
});

test('demo checkout uses canonical prices and rejects overselling atomically', async () => {
  await runDemo(admin, async () => {
    const product = {...(await products()).Items[0], price: 42, quantity: 2};
    await docClient.send(new PutCommand({Item: product}));
    const order = {id: 'forged-id', entityType: 'ORDER', userId: admin.id, selectedMode: 'fastest', plan: {cartModes: {fastest: {items: [{productId: product.id, price: 1, quantity: 2}]}}, checkoutSummary: {estimatedTotal: 1}}};
    const command = () => new TransactWriteCommand({TransactItems: [{Update: {Key: {id: product.id}, ExpressionAttributeValues: {':quantity': 2}}}, {Put: {Item: order}}]});
    await docClient.send(command());
    assert.equal(order.plan.checkoutSummary.estimatedTotal, 84);
    assert.match(order.id, /^demo_order_/);
    const remaining = (await docClient.send(new GetCommand({Key: {id: product.id}}))).Item.quantity;
    assert.equal(remaining, 0);
    await assert.rejects(docClient.send(command()), /inventory changed/);
    assert.equal((await docClient.send(new GetCommand({Key: {id: product.id}}))).Item.quantity, 0);
  });
});
