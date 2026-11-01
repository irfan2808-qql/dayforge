// Calendar-only dates are YYYY-MM-DD strings. Never convert them through UTC to determine the user's local day.
export function localDate(timezone = 'Asia/Jakarta', when:Date=new Date()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(when)
}
export function toDate(iso:string):Date {const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12))}
export function dateKey(date:Date):string {return date.toISOString().slice(0,10)}
export function shiftDays(iso:string, days:number):string {const d=toDate(iso);d.setUTCDate(d.getUTCDate()+days);return dateKey(d)}
export function monthStart(iso:string):string {return iso.slice(0,7)+'-01'}
export function monthEnd(iso:string):string {const d=toDate(monthStart(iso));d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return dateKey(d)}
export function startOfWeek(iso:string):string {const d=toDate(iso);return shiftDays(iso,-((d.getUTCDay()+6)%7))}
export function endOfWeek(iso:string):string {return shiftDays(startOfWeek(iso),6)}
export function eachDate(start:string,end:string):string[]{const result:string[]=[];if(end<start)return result;for(let key=start;key<=end && result.length<=4000;key=shiftDays(key,1))result.push(key);return result}
export function addMonths(iso:string,offset:number):string {const d=toDate(monthStart(iso));d.setUTCMonth(d.getUTCMonth()+offset);return dateKey(d)}
export function prettyDate(iso:string,opts:Intl.DateTimeFormatOptions={month:'short',day:'numeric',year:'numeric'}):string{return new Intl.DateTimeFormat('en-US',{...opts,timeZone:'UTC'}).format(toDate(iso))}
export function weekday(iso:string):number {return (toDate(iso).getUTCDay()+6)%7+1}
export function safeTimezone(tz:string):boolean {try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return true}catch{return false}}
