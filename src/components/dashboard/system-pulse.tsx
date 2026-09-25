"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

import type { CompanyDataset, Integration, ReportingChangeEvent } from "@/lib/data/types";
import { Card, StatusPill } from "./ui";

const syncableProviders = new Set<Integration["provider"]>([
  "meta",
  "google_ads",
  "ga4",
  "search_console",
  "google_business",
  "monday",
  "hubspot",
  "robaws",
]);

export function SystemPulse({ data }: { data: CompanyDataset }) {
  const router = useRouter();
  const [syncing,setSyncing]=useState(false);
  const [message,setMessage]=useState("");
  const [tone,setTone]=useState<"good"|"warn">("good");
  const connected = data.integrations.filter(item=>item.status==="Connected"&&syncableProviders.has(item.provider)&&item.resource!=="Not selected");
  const setupRequired = data.integrations.filter(item=>item.status==="Connected"&&syncableProviders.has(item.provider)&&item.resource==="Not selected");
  const metaLeadPermissionMissing = data.integrations.some(item=>item.provider==="meta"&&item.metaMissingPermissions?.includes("leads_retrieval"));
  const healthWarnings=[
    setupRequired.length?`${setupRequired.map(item=>item.name).join(", ")} need a resource selected before they can sync`:"",
    metaLeadPermissionMissing?"Meta Lead Ads matching is missing leads_retrieval permission":"",
  ].filter(Boolean);
  const scheduleLabel=`CRM + ROBAWS hourly · marketing every 3 hours${healthWarnings.length?` · ${healthWarnings.length} blocker(s)`:""}`;
  const lastSync = useMemo(() => latestDate(data.integrations.map(item=>item.lastSuccess)), [data.integrations]);
  const changes=(data.changeEvents??[]).slice(0,6);
  const autoEnabled=Boolean(data.automation?.enabled);

  useEffect(()=>{
    if(!autoEnabled)return;
    const id=window.setInterval(()=>{
      if(document.visibilityState==="visible") router.refresh();
    },300_000);
    return ()=>window.clearInterval(id);
  },[autoEnabled,router]);

  async function syncAll(){
    setSyncing(true);setMessage("");
    let success=0;const errors:string[]=[];
    for(const integration of connected){
      const response=await fetch(`/api/integrations/${integration.provider}/sync`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({companyId:data.company.id}),
      });
      const body=await response.json().catch(()=>({}));
      if(response.ok)success+=1;else errors.push(`${integration.name}: ${body.error??"sync failed"}`);
    }
    setSyncing(false);
    if(errors.length){
      setTone("warn");
      setMessage(`${success} sources synced. ${errors.length} need attention.`);
    }else{
      setTone("good");
      setMessage(`${success} connected sources synced successfully.`);
    }
    router.refresh();
  }

  return <Card className="overflow-hidden">
    <div className="system-pulse-head">
      <div className="system-live">
        <span className={`system-live-dot ${autoEnabled?"is-on":"is-off"}`}/>
        <div><strong>{autoEnabled?"Auto-sync is on":"Auto-sync is not configured"}</strong><span>{autoEnabled?scheduleLabel:"Use Data Health to finish automation setup"}</span></div>
      </div>
      <div className="system-pulse-meta">
        <span><Clock3 size={14}/> Last update {lastSync?relativeTime(lastSync):"never"}</span>
        <span><Sparkles size={14}/> {(data.manualOverrides??[]).length} reporting overrides</span>
        <button type="button" onClick={syncAll} disabled={syncing||!connected.length} className="button-primary"><RefreshCw size={14} className={syncing?"animate-spin":""}/>{syncing?"Syncing…":"Sync now"}</button>
      </div>
    </div>
    {message&&<div className={`system-sync-message ${tone==="warn"?"is-warn":"is-good"}`}>{tone==="warn"?<TriangleAlert size={15}/>:<CheckCircle2 size={15}/>}<span>{message}</span></div>}
    {!message&&healthWarnings.length>0&&<div className="system-sync-message is-warn"><TriangleAlert size={15}/><span>{healthWarnings.join(" · ")}</span></div>}
    <div className="system-change-strip">
      <div className="system-change-label"><span>WHAT CHANGED</span><strong>{changes.length?"Since recent syncs":"No recorded changes yet"}</strong></div>
      {changes.length?changes.map(event=><ChangeChip key={event.id} event={event}/>):<div className="system-change-empty">Automatic sync changes will appear here: new leads, signed clients, offer value, paid value and ad spend.</div>}
    </div>
  </Card>;
}

function ChangeChip({event}:{event:ReportingChangeEvent}){
  return <div className={`system-change-chip tone-${event.severity}`} title={event.detail}>
    <span>{providerLabel(event.provider)}</span>
    <strong>{event.title}</strong>
    <small>{relativeTime(event.occurredAt)}</small>
  </div>;
}

function latestDate(values:Array<string|null>){
  return values.filter((value):value is string=>Boolean(value)).sort().at(-1)??null;
}

function relativeTime(value:string){
  const diff=Math.max(0,Date.now()-new Date(value).getTime());
  const minutes=Math.floor(diff/60_000);
  if(minutes<1)return "just now";
  if(minutes<60)return `${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h ago`;
  return `${Math.floor(hours/24)}d ago`;
}

function providerLabel(provider:string){
  return ({
    meta:"META",
    google_ads:"GOOGLE ADS",
    ga4:"GA4",
    search_console:"SEARCH",
    google_business:"GBP",
    monday:"MONDAY",
    hubspot:"HUBSPOT",
    robaws:"ROBAWS",
  } as Record<string,string>)[provider]??provider.toUpperCase();
}
