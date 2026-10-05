export type FeedRun = { provider: string; status: string; created_at: string };
export function feedAlerts(rows: FeedRun[], now: number) {
  const required=["ESPN","ESPN injuries","ESPN news","The Odds API props"];
  return required.flatMap(provider => {
    const latest=rows.filter(r=>r.provider===provider && Date.parse(r.created_at)<=now)
      .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
    if(!latest)return [{provider,reason:"No verified refresh recorded"}];
    if(now-Date.parse(latest.created_at)>30*60000)return [{provider,reason:"Refresh older than 30 minutes"}];
    if(!["ok","no upcoming events"].includes(latest.status))return [{provider,reason:latest.status}];
    return [];
  });
}
export function researchDeadline(latest: string | null, now: number) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(now));
  const get=(key:string)=>parts.find(p=>p.type===key)?.value || "";
  const current=Number(get("hour"))*60+Number(get("minute"));
  const hour=[19,15,12].find(h=>current>=h*60+15);
  if(hour===undefined)return null;
  const day=`${get("year")}-${get("month")}-${get("day")}`;
  const then=latest?new Date(latest):null;
  if(then && Number.isFinite(then.getTime()) && then.getTime()<=now){
    const f=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(then);
    const val=(k:string)=>f.find(p=>p.type===k)?.value;
    if(`${val("year")}-${val("month")}-${val("day")}`===day && Number(val("hour"))>=hour)return null;
  }
  return `No research publication recorded since ${hour===12?"noon":hour===15?"3 PM":"7 PM"} ET today`;
}
