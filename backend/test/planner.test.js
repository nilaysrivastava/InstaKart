const {test} = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/storage');
const seed = require('../data/products.seed.json');
const inventory = seed.map(p => ({...p, quantity: 100, isAvailable: true}));
const original = storage.docClient.send;
storage.docClient.send = async command => {
  if (command instanceof storage.QueryCommand) return {Items: inventory};
  throw new Error('Unexpected persistence in guest planner');
};
const handlers = require('../src/handler');
for (const userRequest of ['Guests are coming in 30 minutes', 'Plan a quick breakfast for 4 people', 'I need hostel snacks under 500', 'I have a fever and need essentials fast']) {
  test(`guest planner: ${userRequest}`, async () => {
    const response = await handlers.generateGuestNowPlan({body: JSON.stringify({userRequest}), headers:{}});
    assert.equal(response.statusCode, 200);
    const {plan} = JSON.parse(response.body);
    assert.equal(plan.usedFallback, true);
    if (userRequest.includes('4 people')) assert.equal(plan.peopleCount, 4);
    if (userRequest.includes('under 500')) for (const cart of Object.values(plan.cartModes)) assert.ok(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0) <= 500);
    for (const mode of ['fastest','bestValue','mostComplete']) {
      assert.ok(plan.cartModes[mode].items.length > 0);
      for (const item of plan.cartModes[mode].items) {
        assert.ok(inventory.some(p => p.id === item.productId));
        assert.ok(item.quantity > 0);
      }
    }
  });
}
test('protected customer actions reject an absent token', async () => {
  for (const name of ['getNowCart','saveNowCart','clearNowCart','checkoutNowOrder','listNowOrders','saveNowFeedback','trackNowOrder','generateNowPlan']) {
    assert.equal((await handlers[name]({headers:{}, body:'{}'})).statusCode, 401, name);
  }
});
test('administrator actions reject an absent token', async () => {
  for (const name of ['listAdminInventory','createAdminInventory','updateAdminInventory','deleteAdminInventory','getAdminAnalytics','generateAdminInsights']) {
    assert.equal((await handlers[name]({headers:{}, body:'{}'})).statusCode, 403, name);
  }
});
test('empty guest prompt is rejected', async () => {
  assert.equal((await handlers.generateGuestNowPlan({headers:{}, body:'{}'})).statusCode, 400);
});
test.after(() => { storage.docClient.send = original; });
