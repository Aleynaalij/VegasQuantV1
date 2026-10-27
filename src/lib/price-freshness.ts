export function priceFreshness(at?: string | null, now=Date.now()) {
  const t=at ? Date.parse(at) : NaN;
  if(!Number.isFinite(t) || t>now) return {state:'unknown',label:'Quote time unverified'};
  const minutes=Math.floor((now-t)/60000);
  return minutes>=30 ? {state:'stale',label:`Historical quote · ${minutes<1440 ? `${minutes}m` : `${Math.floor(minutes/1440)}d`} old`} : {state:'recent',label:`Quote checked ${minutes}m ago`};
}
