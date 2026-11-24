-- Run as the project owner in SQL Editor. Everything rolls back.
begin;
insert into public.commerce_entities(id,data) values
('test_rls_product', '{"id":"test_rls_product","entityType":"PRODUCT","name":"Test","price":42,"quantity":1,"etaMinutes":10}'),
('cart_11111111-1111-4111-8111-111111111111', '{"id":"cart_11111111-1111-4111-8111-111111111111","entityType":"CART","userId":"11111111-1111-4111-8111-111111111111","items":[]}'),
('cart_22222222-2222-4222-8222-222222222222', '{"id":"cart_22222222-2222-4222-8222-222222222222","entityType":"CART","userId":"22222222-2222-4222-8222-222222222222","items":[]}');
set local role anon;
do $$ begin
  if exists(select 1 from public.commerce_entities where entity_type <> 'PRODUCT') then raise exception 'Guest data leak'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ declare result jsonb; begin
  if (select count(*) from public.commerce_entities where entity_type='CART') <> 1 then raise exception 'Cart isolation failed'; end if;
  begin
    insert into public.commerce_entities(id,data) values ('test_rls_forged_product','{"id":"test_rls_forged_product","entityType":"PRODUCT"}');
    raise exception 'Customer product write allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.commerce_entities(id,data) values ('test_rls_forged_order','{"id":"test_rls_forged_order","entityType":"ORDER","userId":"11111111-1111-4111-8111-111111111111"}');
    raise exception 'Customer direct order insert allowed';
  exception when insufficient_privilege then null; end;
  result := public.checkout_order('{"id":"test_rls_order","entityType":"ORDER","userId":"11111111-1111-4111-8111-111111111111","selectedMode":"fastest","plan":{"cartModes":{"fastest":{"items":[]}},"checkoutSummary":{"estimatedTotal":0,"itemCount":0}}}'::jsonb,'[{"productId":"test_rls_product","quantity":1}]'::jsonb);
  if result#>>'{plan,checkoutSummary,estimatedTotal}' <> '42' then raise exception 'Canonical price failed'; end if;
  if (select data->>'quantity' from public.commerce_entities where id='test_rls_product') <> '0' then raise exception 'Stock deduction failed'; end if;
  begin
    perform public.checkout_order('{"id":"test_rls_order2","entityType":"ORDER","userId":"11111111-1111-4111-8111-111111111111","selectedMode":"fastest","plan":{"cartModes":{"fastest":{"items":[]}},"checkoutSummary":{}}}'::jsonb,'[{"productId":"test_rls_product","quantity":1}]'::jsonb);
    raise exception 'Oversell allowed';
  exception when raise_exception then if sqlerrm <> 'Insufficient stock' then raise; end if; end;
  begin
    perform public.checkout_order('{"id":"test_rls_forged_owner","entityType":"ORDER","userId":"22222222-2222-4222-8222-222222222222","selectedMode":"fastest"}'::jsonb,'[{"productId":"test_rls_product","quantity":1}]'::jsonb);
    raise exception 'Forged owner allowed';
  exception when raise_exception then if sqlerrm <> 'Authenticated order owner required' then raise; end if; end;
end $$;
reset role;
select true as public_catalog_only, true as private_cart_isolation, true as customer_admin_writes_denied, true as forged_orders_denied, true as canonical_price_verified, true as stock_deduction_verified, true as oversell_denied;
rollback;
