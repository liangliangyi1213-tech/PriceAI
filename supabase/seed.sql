-- Mock catalog only; values are not live marketplace prices.
insert into public.products(id,slug,brand,name,category,description,image,specs) values
('apple-iphone-16-pro','apple-iphone-16-pro','Apple','iPhone 16 Pro','phone','Mock catalog product','/phone-placeholder.svg','{"芯片":"A18 Pro"}'),('apple-iphone-16','apple-iphone-16','Apple','iPhone 16','phone','Mock catalog product','/phone-placeholder.svg','{"芯片":"A18"}'),('huawei-mate-70-pro','huawei-mate-70-pro','华为','Mate 70 Pro','phone','Mock catalog product','/phone-placeholder.svg','{"芯片":"麒麟 9020"}'),('huawei-pura-70','huawei-pura-70','华为','Pura 70','phone','Mock catalog product','/phone-placeholder.svg','{}'),('xiaomi-15','xiaomi-15','小米','小米 15','phone','Mock catalog product','/phone-placeholder.svg','{}'),('xiaomi-redmi-k80','xiaomi-redmi-k80','小米','REDMI K80','phone','Mock catalog product','/phone-placeholder.svg','{}'),('oppo-find-x8','oppo-find-x8','OPPO','Find X8','phone','Mock catalog product','/phone-placeholder.svg','{}'),('vivo-x200','vivo-x200','vivo','X200','phone','Mock catalog product','/phone-placeholder.svg','{}') on conflict(id) do nothing;
insert into public.product_variants(id,product_id,storage,color,region,condition,performance) select p.id||'-256GB-黑色',p.id,'256GB','黑色','国行','全新',case p.id when 'apple-iphone-16-pro' then 94 when 'huawei-mate-70-pro' then 90 when 'xiaomi-15' then 88 else 82 end from public.products p on conflict(id) do nothing;
insert into public.offers(id,variant_id,platform,seller,title,price,rating,sales,shipping,warranty,url,updated_at,match_confidence) select v.id||'-jd',v.id,'京东','品牌旗舰店','官方正品',case when v.product_id='apple-iphone-16-pro' then 7999 else 4999 end,4.8,12000,'免运费','全国联保 1 年','#',now(),.98 from public.product_variants v where v.storage='256GB' on conflict(id) do nothing;
insert into public.offers(id,variant_id,platform,seller,title,price,rating,sales,shipping,warranty,url,updated_at,match_confidence) select v.id||'-tb',v.id,'淘宝','官方旗舰店','官方正品',case when v.product_id='apple-iphone-16-pro' then 7799 else 4799 end,4.8,8700,'免运费','全国联保 1 年','#',now(),.98 from public.product_variants v where v.storage='256GB' on conflict(id) do nothing;
insert into public.offers(id,variant_id,platform,seller,title,price,rating,sales,shipping,warranty,url,updated_at,match_confidence) select v.id||'-pdd',v.id,'拼多多','百亿补贴','正品补贴',case when v.product_id='apple-iphone-16-pro' then 7599 else 4599 end,4.6,41000,'免运费','全国联保 1 年','#',now(),.91 from public.product_variants v where v.storage='256GB' on conflict(id) do nothing;

-- Development/test-only price history. These are fixed Mock records, not live marketplace history.
insert into public.price_history(product_id,variant_id,platform,external_offer_id,price,original_price,currency,recorded_at)
select history.product_id,history.variant_id,history.platform,history.external_offer_id,history.price,history.original_price,history.currency,history.recorded_at
from (values
  ('apple-iphone-16-pro','apple-iphone-16-pro-256GB-黑色','mock-jd','mock-iphone-16-pro-01',7999.00,8299.00,'CNY','2026-08-04T08:00:00Z'::timestamptz),
  ('apple-iphone-16-pro','apple-iphone-16-pro-256GB-黑色','mock-jd','mock-iphone-16-pro-02',7899.00,8299.00,'CNY','2026-08-11T08:00:00Z'::timestamptz),
  ('apple-iphone-16-pro','apple-iphone-16-pro-256GB-黑色','mock-taobao','mock-iphone-16-pro-03',7799.00,8299.00,'CNY','2026-08-18T08:00:00Z'::timestamptz),
  ('apple-iphone-16-pro','apple-iphone-16-pro-256GB-黑色','mock-pdd','mock-iphone-16-pro-04',7699.00,8299.00,'CNY','2026-08-25T08:00:00Z'::timestamptz),
  ('apple-iphone-16-pro','apple-iphone-16-pro-256GB-黑色','mock-pdd','mock-iphone-16-pro-05',7599.00,8299.00,'CNY','2026-09-02T08:00:00Z'::timestamptz),
  ('apple-iphone-16','apple-iphone-16-256GB-黑色','mock-jd','mock-iphone-16-01',5499.00,5799.00,'CNY','2026-08-04T08:00:00Z'::timestamptz),
  ('apple-iphone-16','apple-iphone-16-256GB-黑色','mock-jd','mock-iphone-16-02',5399.00,5799.00,'CNY','2026-08-11T08:00:00Z'::timestamptz),
  ('apple-iphone-16','apple-iphone-16-256GB-黑色','mock-taobao','mock-iphone-16-03',5299.00,5799.00,'CNY','2026-08-18T08:00:00Z'::timestamptz),
  ('apple-iphone-16','apple-iphone-16-256GB-黑色','mock-pdd','mock-iphone-16-04',5249.00,5799.00,'CNY','2026-08-25T08:00:00Z'::timestamptz),
  ('apple-iphone-16','apple-iphone-16-256GB-黑色','mock-pdd','mock-iphone-16-05',5199.00,5799.00,'CNY','2026-09-02T08:00:00Z'::timestamptz),
  ('xiaomi-15','xiaomi-15-256GB-黑色','mock-jd','mock-xiaomi-15-01',4499.00,4699.00,'CNY','2026-08-04T08:00:00Z'::timestamptz),
  ('xiaomi-15','xiaomi-15-256GB-黑色','mock-jd','mock-xiaomi-15-02',4399.00,4699.00,'CNY','2026-08-11T08:00:00Z'::timestamptz),
  ('xiaomi-15','xiaomi-15-256GB-黑色','mock-taobao','mock-xiaomi-15-03',4299.00,4699.00,'CNY','2026-08-18T08:00:00Z'::timestamptz),
  ('xiaomi-15','xiaomi-15-256GB-黑色','mock-pdd','mock-xiaomi-15-04',4199.00,4699.00,'CNY','2026-08-25T08:00:00Z'::timestamptz),
  ('xiaomi-15','xiaomi-15-256GB-黑色','mock-pdd','mock-xiaomi-15-05',4099.00,4699.00,'CNY','2026-09-02T08:00:00Z'::timestamptz)
) as history(product_id,variant_id,platform,external_offer_id,price,original_price,currency,recorded_at)
where exists (select 1 from public.product_variants where id = history.variant_id)
  and not exists (
    select 1 from public.price_history existing
    where existing.variant_id = history.variant_id
      and existing.external_offer_id = history.external_offer_id
      and existing.recorded_at = history.recorded_at
  );
