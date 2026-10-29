import { supabase } from "./supabase";
export async function invokeRentozi(name: string,body: Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke(name,{body,signal:name === "send-email" ? AbortSignal.timeout(20000) : undefined});
 if(error||data?.error){let message=data?.error||error?.message||"Request failed";try{const response=(error as any)?.context;if(response?.clone){const detail=await response.clone().json();message=detail.error||detail.message||message;}}catch{}throw Error(String(message));}return data;
}
export async function notifyRentozi(body: Record<string,unknown>){try{await invokeRentozi("send-email",body);return{ok:true,error:null};}catch(error){return{ok:false,error:(error as Error).message};}}
export function escapeEmail(value: unknown){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
