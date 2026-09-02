import { describe, expect, it } from "vitest";
import { mapCatalog } from "./mapper";

describe("mapCatalog", () => {
  it("preserves product, variant, and offer relationships", () => {
    const [product] = mapCatalog([{ id:"p",slug:"phone",brand:"品牌",name:"手机",category:"phone",description:"d",image:"i",specs:{} }], [{ id:"v",product_id:"p",storage:"256GB",color:"黑色",region:"国行",condition:"全新",performance:80 }], [{ id:"o",variant_id:"v",platform:"京东",seller:"店铺",title:"标题",price:1,original_price:null,rating:4.5,sales:2,shipping:"免运费",warranty:"联保",url:"#",updated_at:"2026-01-01T00:00:00Z",match_confidence:.9 }]);
    expect(product.variants[0].offers[0]).toMatchObject({ variantId:"v", price:1, originalPrice:undefined });
  });
});
