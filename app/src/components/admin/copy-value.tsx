"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
export function CopyValue({value,label}:{value:string;label:string}) {
  const [result,setResult]=useState("");
  return <span><button type="button" className="copy-button" aria-label={label} onClick={async()=>{try{await navigator.clipboard.writeText(value);setResult("Disalin");}catch{setResult("Gagal menyalin. Salin teks secara manual.");}}}>{result==="Disalin"?<Check size={19}/>:<Copy size={19}/>}</button><span role="status" className="sr-only">{result}</span></span>;
}
