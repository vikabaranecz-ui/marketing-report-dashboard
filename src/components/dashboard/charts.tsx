"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  return <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="#eeeeea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#777873", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#777873", fontSize: 11 }} tickFormatter={(value)=>formatCurrency(Number(value),true)}/><Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),name==="paid"?"Paid cash":"Marketing spend"]}/><Bar dataKey="paid" fill={WAT_BLACK} radius={[6,6,0,0]}/><Line type="monotone" dataKey="spend" stroke={WAT_YELLOW} strokeWidth={3} dot={{ r: 3, fill: WAT_YELLOW, stroke: WAT_BLACK, strokeWidth: 1 }}/></ComposedChart></ResponsiveContainer></div>;
}

export function QualityBars({ data }: { data: { name: string; value: number }[] }) {
  const colors = [WAT_YELLOW, WAT_BLACK, "#d8d8d4"];
  return <div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: -22, right: 16 }}><XAxis type="number" hide/><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#4e514d", fontSize: 12 }}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="value" radius={[0,2,2,0]}>{data.map((_, i) => <Cell key={i} fill={colors[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>;
}


export function BusinessActivityChart({data}:{data:Array<{label:string;won:number;invoiced:number;paid:number;spend:number;complete:boolean}>}){
  return <div className="h-[320px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:12,right:18,left:0,bottom:0}}>
    <CartesianGrid stroke="#eeeeea" vertical={false}/>
    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}}/>
    <YAxis yAxisId="money" axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}} tickFormatter={(value)=>formatCurrency(Number(value),true)}/>
    <Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),String(name)]}/>
    <Bar yAxisId="money" dataKey="won" name="Won project value" fill="#d7d7d0" radius={[5,5,0,0]}/>
    <Bar yAxisId="money" dataKey="invoiced" name="Invoiced value" fill={WAT_BLACK} radius={[5,5,0,0]}/>
    <Bar yAxisId="money" dataKey="paid" name="Paid value on invoices" fill="#6c6f6a" radius={[5,5,0,0]}/>
    <Line yAxisId="money" type="monotone" dataKey="spend" name="Marketing spend" stroke={WAT_YELLOW} strokeWidth={3} dot={{r:3,fill:WAT_YELLOW,stroke:WAT_BLACK,strokeWidth:1}}/>
  </ComposedChart></ResponsiveContainer></div>;
}

export function CostOutcomeChart({data}:{data:Array<{name:string;value:number}>}){
  return <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{top:6,right:18,left:12,bottom:0}}>
    <CartesianGrid stroke="#eeeeea" horizontal={false}/>
    <XAxis type="number" axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}} tickFormatter={(value)=>formatCurrency(Number(value),true)}/>
    <YAxis type="category" dataKey="name" width={98} axisLine={false} tickLine={false} tick={{fill:"#4e514d",fontSize:11}}/>
    <Tooltip contentStyle={tooltipStyle} formatter={(value)=>[formatCurrency(Number(value)),"Cost"]}/>
    <Bar dataKey="value" fill={WAT_YELLOW} radius={[0,5,5,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function SourcePerformanceChart({data}:{data:Array<{source:string;spend:number|null;customers:number;paid:number}>}){
  return <div className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{top:4,right:18,left:20,bottom:0}}>
    <CartesianGrid stroke="#eeeeea" horizontal={false}/>
    <XAxis type="number" axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}} tickFormatter={(value)=>formatCurrency(Number(value),true)}/>
    <YAxis type="category" dataKey="source" width={128} axisLine={false} tickLine={false} tick={{fill:"#4e514d",fontSize:11}}/>
    <Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),String(name)]}/>
    <Bar dataKey="paid" name="Paid value" fill={WAT_BLACK} radius={[0,5,5,0]}/>
    <Bar dataKey="spend" name="Spend" fill={WAT_YELLOW} radius={[0,5,5,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function CohortPaybackChart({data,spend}:{data:Array<{label:string;cumulativePaid:number;cumulativeInvoiced:number}>;spend:number}){
  const chart=data.map(item=>({...item,spend}));
  return <div className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{top:12,right:18,left:0,bottom:0}}>
    <CartesianGrid stroke="#eeeeea" vertical={false}/>
    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}}/>
    <YAxis axisLine={false} tickLine={false} tick={{fill:"#72746f",fontSize:11}} tickFormatter={(value)=>formatCurrency(Number(value),true)}/>
    <Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),String(name)]}/>
    <Line type="monotone" dataKey="cumulativePaid" name="Cumulative paid value" stroke={WAT_BLACK} strokeWidth={3} dot={{r:3,fill:WAT_BLACK}}/>
    <Line type="monotone" dataKey="cumulativeInvoiced" name="Cumulative invoiced value" stroke="#858782" strokeWidth={2} strokeDasharray="5 4" dot={false}/>
    <Line type="monotone" dataKey="spend" name="Acquisition spend" stroke={WAT_YELLOW} strokeWidth={3} dot={false}/>
  </ComposedChart></ResponsiveContainer></div>;
}
