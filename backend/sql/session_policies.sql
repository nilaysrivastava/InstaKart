create schema if not exists private;

create function private.checkout_order(p_order jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb; product jsonb; qty integer; remaining integer;
  canonical jsonb := '[]'::jsonb; total numeric := 0; count_items integer := 0;
  mode text := p_order->>'selectedMode';
begin
  if auth.uid() is null or p_order->>'userId' is distinct from auth.uid()::text then
    raise exception 'Authenticated order owner required';
  end if;
  if p_order->>'entityType' is distinct from 'ORDER' then raise exception 'Invalid order type'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 99
     or mode not in ('fastest','bestValue','mostComplete')
     or nullif(p_order->>'userId','') is null then
    raise exception 'Invalid checkout';
  end if;
  for item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    qty := (item->>'quantity')::integer;
    if qty < 1 or qty > 10000 then raise exception 'Invalid quantity'; end if;
    select data into product from public.commerce_entities where id = item->>'productId' and entity_type = 'PRODUCT' for update;
    if product is null or product->>'available' = 'false' or product->>'isAvailable' = 'false' then
      raise exception 'Product unavailable';
    end if;
    remaining := coalesce((product->>'quantity')::integer, 100);
    if remaining < qty then raise exception 'Insufficient stock'; end if;
    update public.commerce_entities set data = data || jsonb_build_object('quantity', remaining - qty, 'updatedAt', now()) where id = item->>'productId';
    canonical := canonical || jsonb_build_array(jsonb_build_object('productId', product->>'id', 'name', product->>'name', 'price', (product->>'price')::numeric, 'quantity', qty, 'etaMinutes', (product->>'etaMinutes')::integer, 'reason', 'Confirmed against live inventory at checkout.'));
    total := total + (product->>'price')::numeric * qty;
    count_items := count_items + qty;
  end loop;
  p_order := jsonb_set(p_order, array['plan','cartModes', mode, 'items'], canonical);
  p_order := jsonb_set(p_order, '{plan,checkoutSummary,estimatedTotal}', to_jsonb(total));
  p_order := jsonb_set(p_order, '{plan,checkoutSummary,itemCount}', to_jsonb(count_items));
  insert into public.commerce_entities(id, data) values(p_order->>'id', p_order);
  return p_order;
end;
$$;
revoke all on function private.checkout_order(jsonb,jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.checkout_order(jsonb,jsonb) to authenticated;

create or replace function public.checkout_order(p_order jsonb, p_items jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.checkout_order(p_order, p_items);
$$;
revoke all on function public.checkout_order(jsonb,jsonb) from public, anon;
grant execute on function public.checkout_order(jsonb,jsonb) to authenticated;

-- Current role comes from server-controlled Auth app metadata, never user metadata.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid()
    and raw_app_meta_data->'groups' @> '["admin"]'::jsonb);
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

grant select on public.commerce_entities to anon, authenticated;
grant insert, update, delete on public.commerce_entities to authenticated;
create policy public_catalog on public.commerce_entities for select to anon, authenticated
  using (entity_type = 'PRODUCT');
create policy owner_read on public.commerce_entities for select to authenticated
  using (user_id = (select auth.uid())::text);
create policy admin_read on public.commerce_entities for select to authenticated
  using ((select private.is_admin()));
create policy owner_insert on public.commerce_entities for insert to authenticated
  with check (user_id = (select auth.uid())::text and entity_type in ('CART','SHOPPING_PLAN','FEEDBACK')
    and (entity_type <> 'CART' or id = 'cart_' || (select auth.uid())::text));
create policy owner_update on public.commerce_entities for update to authenticated
  using (user_id = (select auth.uid())::text and entity_type in ('CART','SHOPPING_PLAN','FEEDBACK'))
  with check (user_id = (select auth.uid())::text and entity_type in ('CART','SHOPPING_PLAN','FEEDBACK')
    and (entity_type <> 'CART' or id = 'cart_' || (select auth.uid())::text));
create policy owner_delete on public.commerce_entities for delete to authenticated
  using (user_id = (select auth.uid())::text and entity_type in ('CART','SHOPPING_PLAN','FEEDBACK'));
create policy admin_insert on public.commerce_entities for insert to authenticated
  with check ((select private.is_admin()) and entity_type in ('PRODUCT','ITEM'));
create policy admin_update on public.commerce_entities for update to authenticated
  using ((select private.is_admin()) and entity_type in ('PRODUCT','ITEM'))
  with check ((select private.is_admin()) and entity_type in ('PRODUCT','ITEM'));
create policy admin_delete on public.commerce_entities for delete to authenticated
  using ((select private.is_admin()) and entity_type in ('PRODUCT','ITEM'));
