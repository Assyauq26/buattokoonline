import type { JntTrackingEvent } from "@/infrastructure/shipping/jnt/official-transport";
export function trackingTime(value:string|null):Date|null {
  if(!value || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const date=new Date(value.replace(" ","T")+"+07:00");
  return Number.isFinite(+date)&&+date<=Date.now()+300000?date:null;
}
export function latestTracking(events:JntTrackingEvent[]) {
  return events.map(event=>({event,time:trackingTime(event.time)})).filter((x):x is {event:JntTrackingEvent;time:Date}=>!!x.time).sort((a,b)=>+b.time-+a.time)[0] ?? null;
}
export function trackingOutcome(events:JntTrackingEvent[]) {
  const latest=latestTracking(events);
  if(!latest) return null;
  // Conflicting events at the same timestamp must not complete an order.
  if(events.some(event=>trackingTime(event.time)?.getTime()===latest.time.getTime()&&event.code!==latest.event.code))return null;
  // Explicit carrier codes only: "received by station" is not delivery.
  return latest.event.code==="200"?"DELIVERED":latest.event.code==="100"?"IN_TRANSIT":null;
}
