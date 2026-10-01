import assert from "node:assert/strict";
import test from "node:test";

import { effectiveAcquisitionDate } from "../src/lib/metrics/acquisition-date.ts";
import { buildCalendarActivity } from "../src/lib/metrics/calendar-activity.ts";
import { groupByStableLeadIdentity } from "../src/lib/metrics/lead-identity.ts";
import { metricDefinitions } from "../src/lib/metrics/metric-definitions.ts";

test("historical commercial activity does not move a lead into a later acquisition month",()=>{
  assert.equal(effectiveAcquisitionDate("2026-06-12T10:00:00Z","2026-09-03T00:00:00Z"),"2026-06-12");
});

test("same-name people are not automatically merged",()=>{
  const groups=groupByStableLeadIdentity([
    {id:"a",email:"first@example.com",phone:"",name:"Same Name"},
    {id:"b",email:"second@example.com",phone:"",name:"Same Name"},
  ]);
  assert.equal(groups.length,2);
});

test("exact email and phone evidence forms one transitive identity",()=>{
  const groups=groupByStableLeadIdentity([
    {id:"a",email:"person@example.com",phone:""},
    {id:"b",email:"person@example.com",phone:"+32 470 00 00 01"},
    {id:"c",email:"",phone:"0470 00 00 01"},
  ]);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].map(row=>row.id),["a","b","c"]);
});

test("calendar activity counts documents, not clients, and keeps dates separate",()=>{
  const activity=buildCalendarActivity({
    offers:[
      {id:"o1",date:"2026-08-31",sentAt:"2026-09-01",acceptedAt:"2026-09-05"},
      {id:"o2",date:"2026-09-30",sentAt:null,acceptedAt:null},
      {id:"o2",date:"2026-09-30",sentAt:null,acceptedAt:null},
    ],
    projects:[
      {id:"p1",date:"2026-09-15",completedAt:"2026-10-02",valueInclVat:10000},
      {id:"p2",date:"2026-09-20",completedAt:null,valueInclVat:5000},
    ],
    invoices:[
      {id:"i1",date:"2026-09-30",totalInclVat:1210,totalExclVat:1000,creditedTotal:210,paidTotal:500},
      {id:"i2",date:"2026-10-01",totalInclVat:2420,totalExclVat:2000,creditedTotal:0,paidTotal:0},
    ],
  },"2026-09-01","2026-09-30");
  assert.equal(activity.offersCreated.length,1);
  assert.equal(activity.offersSent.length,1);
  assert.equal(activity.offersAccepted.length,1);
  assert.equal(activity.projectsWon.length,2);
  assert.equal(activity.projectsCompleted.length,0);
  assert.equal(activity.invoices.length,1);
  assert.equal(activity.wonProjectValue,15000);
  assert.equal(activity.invoicedInclVat,1000);
  assert.equal(activity.paidSnapshotOnPeriodInvoices,500);
  assert.equal(activity.paymentsReceived,null);
});

test("metric dictionary never labels invoice paid_total as payment-date revenue",()=>{
  assert.equal(metricDefinitions.receivedRevenue.dateField,"payment_received_at");
  assert.match(metricDefinitions.receivedRevenue.definition,/Unavailable/);
});
