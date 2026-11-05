import { describe,it,expect } from "vitest";
import { canonicalOption,combinationKey,combinationCount,generateCombinations,optionLabel,resolveVariant,type OptionGroup } from "@/modules/catalog/variation-domain";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
const group=(id:string,n:number):OptionGroup=>({id,name:id,allowsImage:false,values:Array.from({length:n},(_,i)=>({id:id+"-"+i,value:"Nilai "+i}))});
const input=(groups:OptionGroup[])=>({name:"Produk uji",slug:"produk-uji",basePrice:100,optionGroups:groups,variants:generateCombinations(groups).map(ids=>({sku:"sku-"+combinationKey(ids),optionValueIds:ids}))});
describe("bounded stable variation identity",()=>{
 it.each([[1,2],[2,4],[3,8]])("generates %i groups without losing dimensions",(n,expected)=>{const groups=Array.from({length:n},(_,i)=>group("g"+i,2));expect(generateCombinations(groups)).toHaveLength(expected);expect(productInputSchema.safeParse(input(groups)).success).toBe(true);});
 it("accepts exactly 50 combinations and stops before materializing overflow",()=>{expect(generateCombinations([group("a",5),group("b",10)])).toHaveLength(50);expect(combinationCount([group("a",50),group("b",50),group("c",50)])).toBe(51);expect(()=>generateCombinations([group("a",50),group("b",50)])).toThrow("50 SKU");});
 it("empty values cannot produce phantom SKU combinations",()=>{expect(generateCombinations([])).toEqual([]);expect(generateCombinations([group("a",0)])).toEqual([]);});
 it("rename and reorder preserve exact key independently of labels and positions",()=>{const groups=[group("a",2),group("b",2)];const keys=generateCombinations(groups).map(combinationKey).sort();groups.reverse();groups[0].name="Kapasitas";groups[0].values.reverse();groups[0].values[0].value="Baru";expect(generateCombinations(groups).map(combinationKey).sort()).toEqual(keys);});
 it("canonicalizes whitespace, Unicode compatibility and case",()=>{expect(canonicalOption(" \u00a0Ｍｅｒａｈ\t BESAR\ufeff")).toBe("merah besar");});
 it("builds labels using every stable value ID",()=>{expect(optionLabel([group("a",1),group("b",1)],["b-0","a-0"])).toBe("a: Nilai 0 / b: Nilai 0");});
 it("does not fall back to an unrelated variant for a missing or incomplete combination",()=>{const rows=[{id:"first",optionValueIds:["a","b"]}];expect(resolveVariant(rows,["a","c"],2)).toBeUndefined();expect(resolveVariant(rows,["a"],2)).toBeUndefined();expect(resolveVariant(rows,["a","a"],2)).toBeUndefined();expect(resolveVariant(rows,["b","a"],2)?.id).toBe("first");});
 it("rejects duplicate normalized groups and values",()=>{const groups=[group("a",2),group("b",2)];groups[0].name="Model";groups[1].name=" ＭＯＤＥＬ ";expect(productInputSchema.safeParse(input(groups)).success).toBe(false);groups[1].name="Motif";groups[0].values[1].value=" nilai 0 ";expect(productInputSchema.safeParse(input(groups)).success).toBe(false);});
 it("rejects multiple image groups and images on an inactive group",()=>{const groups=[group("a",1),group("b",1)];groups.forEach(g=>g.allowsImage=true);expect(productInputSchema.safeParse(input(groups)).success).toBe(false);groups.forEach(g=>g.allowsImage=false);groups[0].values[0].imageId="image";expect(productInputSchema.safeParse(input(groups)).success).toBe(false);});
 it("rejects repeated, foreign and missing selection IDs",()=>{const data=input([group("a",2),group("b",2)]);data.variants[0].optionValueIds=["foreign","b-0"];expect(productInputSchema.safeParse(data).success).toBe(false);data.variants[0].optionValueIds=data.variants[1].optionValueIds;expect(productInputSchema.safeParse(data).success).toBe(false);});
 it("keeps inherited price nullable and enforces explicit SKU discount basis",()=>{const data=input([group("a",1)]);expect(productInputSchema.parse(data).variants[0].price).toBeUndefined();expect(productInputSchema.safeParse({...data,variants:[{...data.variants[0],salePrice:10}]}).success).toBe(false);});
 it("rejects a fourth group on the server and unsafe relational IDs",()=>{const groups=[group("a",1),group("b",1),group("c",1),group("d",1)];expect(()=>generateCombinations(groups)).toThrow();expect(productInputSchema.safeParse({...input(groups.slice(0,3)),optionGroups:groups}).success).toBe(false);groups[0].id="bad|id";expect(productInputSchema.safeParse({...input(groups.slice(0,3)),optionGroups:groups.slice(0,3)}).success).toBe(false);});
});

it("rejects custom mode without groups and duplicate option image IDs",()=>{
 const data=input([group("a",1)]);
 expect(productInputSchema.safeParse({...data,optionsEnabled:true,optionGroups:[]}).success).toBe(false);
 expect(productInputSchema.safeParse({...data,optionsEnabled:true,optionGroups:undefined}).success).toBe(false);
 expect(productInputSchema.safeParse({...data,optionImages:[{id:"same"},{id:"same"}]}).success).toBe(false);
});
