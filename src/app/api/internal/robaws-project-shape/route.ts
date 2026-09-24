import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchAllRobaws } from "@/lib/integrations/robaws-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime="nodejs";

export async function GET(request:Request){
  const url=new URL(request.url);
  const token=url.searchParams.get("token")??"";
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const admin=createSupabaseAdminClient();
  const now=new Date().toISOString();
  const {data}=await admin.from("internal_job_tokens").select("token_hash,job,expires_at,used_at").eq("token_hash",tokenHash).eq("job","robaws-project-shape").maybeSingle();
  if(!data||data.used_at||data.expires_at<=now)return NextResponse.json({error:"invalid"},{status:403});
  const consumed=await admin.from("internal_job_tokens").update({used_at:now}).eq("token_hash",tokenHash).is("used_at",null).select("token_hash").maybeSingle();
  if(!consumed.data)return NextResponse.json({error:"used"},{status:409});
  const [projects,invoices]=await Promise.all([
    fetchAllRobaws<Record<string,unknown>>("projects",{}),
    fetchAllRobaws<Record<string,unknown>>("sales-invoices",{}),
  ]);
  const summarize=(sample:Record<string,unknown>)=>({
    keys:Object.keys(sample).sort(),
    dateLike:Object.fromEntries(Object.entries(sample).filter(([key,value])=>/date|start|end|plan|status|paid|payment/i.test(key)&&["string","number","boolean"].includes(typeof value))),
  });
  const scalarObject=(value:unknown)=>{
    const one=(item:unknown)=>item&&typeof item==="object"&&!Array.isArray(item)
      ?Object.fromEntries(Object.entries(item as Record<string,unknown>).filter(([,v])=>["string","number","boolean"].includes(typeof v)))
      :item;
    return Array.isArray(value)?value.slice(0,6).map(one):one(value);
  };
  const project=projects[0]??{};
  return NextResponse.json({project:{...summarize(project),statusHistory:scalarObject(project.statusHistory),statusDetails:scalarObject(project.statusDetails)},invoice:summarize(invoices[0]??{})});
}
