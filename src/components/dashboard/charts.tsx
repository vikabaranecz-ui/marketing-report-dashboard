"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/data/types";
import { formatCurrency, formatNumber } from "@/lib/metrics/kpis";

const tooltipStyle = { border: "1px solid #d9d9d3", borderRadius: 0, boxShadow: "0 8px 28px rgba(22,25,28,.08)", fontSize: 12 };

export function TrendChart({ data, metric, accent }: { data: TrendPoint[]; metric: keyof TrendPoint; accent: string }) {
  return <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={.26}/><stop offset="100%" stopColor={accent} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ecece7" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 12 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 12 }} tickFormatter={(value) => metric === "revenue" || metric === "spend" || metric === "cpl" || metric === "cac" ? formatCurrency(value, true) : formatNumber(value)}/><Tooltip contentStyle={tooltipStyle} formatter={(value) => [metric === "revenue" || metric === "spend" || metric === "cpl" || metric === "cac" ? formatCurrency(Number(value)) : formatNumber(Number(value)), metric]}/><Area type="monotone" dataKey={metric} stroke={accent} strokeWidth={2.5} fill="url(#trendFill)" activeDot={{ r: 4, strokeWidth: 0 }}/></AreaChart></ResponsiveContainer></div>;
}

export function ComparisonBars({ data, accent }: { data: { name: string; value: number; secondary?: number }[]; accent: string }) {
  return <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}><CartesianGrid stroke="#ecece7" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#72746f", fontSize: 11 }} tickFormatter={(v) => formatNumber(v)}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="value" fill={accent} radius={[2,2,0,0]}/>{data.some(d => d.secondary !== undefined) && <Bar dataKey="secondary" fill="#191c1f" radius={[2,2,0,0]}/>}</BarChart></ResponsiveContainer></div>;
}

export function QualityBars({ data }: { data: { name: string; value: number }[] }) {
  const colors = ["#191c1f", "#84924a", "#d4d5cf"];
  return <div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: -22, right: 16 }}><XAxis type="number" hide/><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#4e514d", fontSize: 12 }}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="value" radius={[0,2,2,0]}>{data.map((_, i) => <Cell key={i} fill={colors[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>;
}
