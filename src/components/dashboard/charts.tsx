"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/data/types";
import { formatCurrency, formatNumber } from "@/lib/metrics/kpis";

const WAT_YELLOW = "#FFE100";
const WAT_BLACK = "#0A0A0A";
const tooltipStyle = { border: "1px solid #e7e7e2", borderRadius: 12, boxShadow: "0 18px 42px rgba(0,0,0,.10)", fontSize: 12 };

export function TrendChart({ data, metric, accent: _accent }: { data: TrendPoint[]; metric: keyof TrendPoint; accent: string }) {
  return <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={WAT_YELLOW} stopOpacity={.28}/><stop offset="100%" stopColor={WAT_YELLOW} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 12 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 12 }} tickFormatter={(value) => metric === "revenue" || metric === "spend" || metric === "cpl" || metric === "cac" ? formatCurrency(value, true) : formatNumber(value)}/><Tooltip contentStyle={tooltipStyle} formatter={(value) => [metric === "revenue" || metric === "spend" || metric === "cpl" || metric === "cac" ? formatCurrency(Number(value)) : formatNumber(Number(value)), metric]}/><Area type="monotone" dataKey={metric} stroke={WAT_BLACK} strokeWidth={2.4} fill="url(#trendFill)" activeDot={{ r: 4, strokeWidth: 0, fill: WAT_YELLOW }}/></AreaChart></ResponsiveContainer></div>;
}

export function ComparisonBars({ data, accent: _accent }: { data: { name: string; value: number; secondary?: number }[]; accent: string }) {
  return <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 11 }} tickFormatter={(v) => formatNumber(v)}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="value" fill={WAT_YELLOW} radius={[6,6,0,0]}/>{data.some(d => d.secondary !== undefined) && <Bar dataKey="secondary" fill={WAT_BLACK} radius={[6,6,0,0]}/>}</BarChart></ResponsiveContainer></div>;
}

export function MoneyTrendChart({ data }: { data: { label: string; paid: number; spend: number; complete: boolean }[] }) {
  return <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#777873", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#777873", fontSize: 11 }} tickFormatter={(value)=>formatCurrency(Number(value),true)}/><Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),name==="paid"?"Paid value on invoices":"Dated marketing spend"]}/><Bar dataKey="paid" fill={WAT_BLACK} radius={[6,6,0,0]}/><Line type="monotone" dataKey="spend" stroke={WAT_YELLOW} strokeWidth={3} dot={{ r: 3, fill: WAT_YELLOW, stroke: WAT_BLACK, strokeWidth: 1 }}/></ComposedChart></ResponsiveContainer></div>;
}

export function QualityBars({ data }: { data: { name: string; value: number }[] }) {
  const colors = [WAT_YELLOW, WAT_BLACK, "#d8d8d4"];
  return <div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: -22, right: 16 }}><XAxis type="number" hide/><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#4e514d", fontSize: 12 }}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="value" radius={[0,2,2,0]}>{data.map((_, i) => <Cell key={i} fill={colors[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>;
}


export function BusinessActivityChart({data,onMonthClick}:{data:Array<{month:string;label:string;won:number;invoiced:number;paid:number;spend:number;complete:boolean}>;onMonthClick?:(month:string)=>void}){
  const click=(state:any)=>{const month=state?.activePayload?.[0]?.payload?.month??state?.activeLabel;if(month&&onMonthClick)onMonthClick(String(month));};
  return <div className="space-y-4">
    <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:12,right:12,left:0,bottom:0}} onClick={click}><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:11}} tickFormatter={(v)=>formatCurrency(Number(v),true)}/><Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),name==="won"?"Won project value":name==="invoiced"?"Invoiced":"Paid value on invoices"]}/><Bar dataKey="won" fill={WAT_YELLOW} radius={[5,5,0,0]}/><Bar dataKey="invoiced" fill="#7f7f78" radius={[5,5,0,0]}/><Bar dataKey="paid" fill={WAT_BLACK} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
    <div className="h-[130px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:6,right:12,left:0,bottom:0}} onClick={click}><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:10}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:10}} tickFormatter={(v)=>formatCurrency(Number(v),true)}/><Tooltip contentStyle={tooltipStyle} formatter={(value)=>[formatCurrency(Number(value)),"Dated marketing spend"]}/><Area type="monotone" dataKey="spend" stroke={WAT_YELLOW} strokeWidth={2.5} fill={WAT_YELLOW} fillOpacity={.12}/></AreaChart></ResponsiveContainer></div>
  </div>;
}

export function CostOutcomeChart({data}:{data:Array<{name:string;value:number|null}>}){
  const rows=data.filter(item=>item.value!==null);
  if(!rows.length)return <div className="chart-empty">Cost-based metrics are unavailable until paid-source spend is complete.</div>;
  return <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{left:10,right:28,top:6,bottom:0}}><CartesianGrid stroke="#eeeeea" horizontal={false}/><XAxis type="number" axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:10}} tickFormatter={(v)=>formatCurrency(Number(v),true)}/><YAxis type="category" dataKey="name" width={105} axisLine={false} tickLine={false} tick={{fill:"#4e514d",fontSize:11}}/><Tooltip contentStyle={tooltipStyle} formatter={(value)=>[formatCurrency(Number(value)),"Cost"]}/><Bar dataKey="value" fill={WAT_YELLOW} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>;
}

export function SourcePerformanceChart({data,onSourceClick}:{data:Array<{source:string;spend:number|null;paid:number;customers:number}>;onSourceClick?:(source:string)=>void}){
  const rows=data.map(item=>({...item,spend:item.spend??0}));
  if(!rows.length)return <div className="chart-empty">No source performance is available for this period.</div>;
  return <div className="h-[320px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{left:24,right:18,top:8,bottom:0}} onClick={(state:any)=>{const source=state?.activePayload?.[0]?.payload?.source;if(source&&onSourceClick)onSourceClick(source)}}><CartesianGrid stroke="#eeeeea" horizontal={false}/><XAxis type="number" axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:10}} tickFormatter={(v)=>formatCurrency(Number(v),true)}/><YAxis type="category" dataKey="source" width={125} axisLine={false} tickLine={false} tick={{fill:"#4e514d",fontSize:11}}/><Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),name==="paid"?"Paid value":"Spend"]} labelFormatter={(label,payload)=>{const customers=payload?.[0]?.payload?.customers;return customers===undefined?String(label):`${label} · ${customers} customer(s)`;}}/><Bar dataKey="spend" fill={WAT_YELLOW} radius={[0,5,5,0]}/><Bar dataKey="paid" fill={WAT_BLACK} radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div>;
}

export function CohortPaybackChart({data,spendReference}:{data:Array<{monthOffset:number;label:string;cumulativePaid:number}>;spendReference:number|null}){
  if(!data.length)return <div className="chart-empty">No invoice-linked paid value is available for this cohort yet.</div>;
  return <div className="h-[290px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:14,right:14,left:0,bottom:0}}><defs><linearGradient id="paybackFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={WAT_YELLOW} stopOpacity={.34}/><stop offset="100%" stopColor={WAT_YELLOW} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#777873",fontSize:11}} tickFormatter={(v)=>formatCurrency(Number(v),true)}/><Tooltip contentStyle={tooltipStyle} formatter={(value)=>[formatCurrency(Number(value)),"Cumulative paid value attached to invoices"]}/>{spendReference!==null&&<ReferenceLine y={spendReference} stroke="#777873" strokeDasharray="4 4" label={{value:"Covered acquisition spend",position:"insideTopRight",fill:"#777873",fontSize:10}}/>}<Area type="monotone" dataKey="cumulativePaid" stroke={WAT_BLACK} strokeWidth={2.5} fill="url(#paybackFill)" activeDot={{r:4,fill:WAT_YELLOW,stroke:WAT_BLACK,strokeWidth:1}}/></AreaChart></ResponsiveContainer></div>;
}
