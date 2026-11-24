const {getClient, requestAuth} = require('../src/storage');
const products = require('../data/products.seed.json');
async function seed() {
  const now = new Date().toISOString();
  const rows = products.map(p => ({id: p.id, data: {...p, quantity: p.quantity ?? 100, isAvailable: p.available !== false, createdAt: p.createdAt || now, updatedAt: now, searchText: [p.name,p.category,p.aisle,...(p.tags || [])].join(' ').toLowerCase()}}));
  const {error} = await getClient().from('commerce_entities').upsert(rows, {onConflict: 'id', ignoreDuplicates: true});
  if (error) throw error;
  console.log(`Seeded ${rows.length} catalog products (existing products preserved).`);
}
requestAuth.run(process.env.SUPABASE_ACCESS_TOKEN, seed).catch(error => {console.error(error.message); process.exit(1);});
