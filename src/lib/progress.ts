import {eachDate,endOfWeek,shiftDays,startOfWeek,localDate} from './dates'
import type {Workspace,Goal,Habit,Occurrence} from './types'
export type Rate={done:number;total:number;pct:number|null}
export function fraction(done:number,total:number):Rate {return {done,total,pct:total>0?Math.round(done/total*100):null}}
export function taskRate(rows:Occurrence[]):Rate {return fraction(rows.filter(o=>o.status==='completed').length,rows.length)}
export function dailyTaskRate(w:Workspace,day:string):Rate {return taskRate(w.task_occurrences.filter(o=>o.activity_date===day))}
export function rangeTaskRate(w:Workspace,start:string,end:string):Rate {return taskRate(w.task_occurrences.filter(o=>o.activity_date>=start&&o.activity_date<=end))}
export function goalAtDate(w:Workspace,goal:Goal,day?:string):Rate {
  if(day&&day<localDate(w.profile.timezone,new Date(goal.created_at)))return {done:0,total:Number(goal.target_value??0),pct:null}
  if(goal.metric_type==='milestone'){
    const all=w.milestones.filter(m=>m.goal_id===goal.id)
    const done=all.filter(m=>m.completed_on&&(!day||m.completed_on<=day)).length
    return fraction(done,all.length)
  }
  const delta=w.goal_progress_entries.filter(e=>e.goal_id===goal.id&&(!day||e.activity_date<=day)).reduce((n,e)=>n+Number(e.delta_value),0)
  const current=Number(goal.initial_value)+delta
  return {done:current,total:Number(goal.target_value??0),pct:goal.target_value?Math.min(100,Math.max(0,Math.round(current/Number(goal.target_value)*100))):null}
}
export function habitTarget(w:Workspace,habit:Habit,day:string):number {
  const versions=w.habit_targets.filter(t=>t.habit_id===habit.id&&t.effective_from<=day).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))
  return versions[0]?.weekly_target ?? 0
}
export function habitRateWeek(w:Workspace,habit:Habit,day:string):Rate {
  const start=startOfWeek(day),end=endOfWeek(day)
  const from=habit.start_date>start?habit.start_date:start
  const to=habit.archived_at&&habit.archived_at<end?shiftDays(habit.archived_at,-1):end
  const eligible=from<=to?eachDate(from,to).length:0
  const target=Math.min(eligible,habitTarget(w,habit,from))
  const done=w.habit_entries.filter(e=>e.habit_id===habit.id&&e.activity_date>=from&&e.activity_date<=to).length
  // A habit can exceed its goal; cap only the numerator of the goal attainment metric.
  return {done,total:target,pct:target?Math.min(100,Math.round(done/target*100)):null}
}
export function habitWeeklyStreak(w:Workspace,habit:Habit,today:string):number {
  let week=startOfWeek(today),streak=0
  // Current unfinished week is optional until it expires.
  if(habitRateWeek(w,habit,today).pct!==100)week=shiftDays(week,-7)
  for(let i=0;i<520;i++){
    if(week<startOfWeek(habit.start_date))break
    if(habitRateWeek(w,habit,week).pct!==100)break
    streak++;week=shiftDays(week,-7)
  }
  return streak
}
export function activityDays(w:Workspace):Set<string>{
  const all=new Set(w.task_occurrences.filter(o=>o.status==='completed').map(o=>o.activity_date))
  w.habit_entries.forEach(e=>all.add(e.activity_date));return all
}
export function streaks(w:Workspace,today:string):{current:number;longest:number}{
  const days=activityDays(w),sorted=[...days].filter(x=>x<=today).sort()
  let longest=0,run=0,last=''
  for(const d of sorted){run=last&&shiftDays(last,1)===d?run+1:1;longest=Math.max(longest,run);last=d}
  let cursor=days.has(today)?today:shiftDays(today,-1),current=0
  while(days.has(cursor)&&current<=40000){current++;cursor=shiftDays(cursor,-1)}
  return {current,longest}
}
export function dailySeries(w:Workspace,start:string,end:string){return eachDate(start,end).map(date=>({...dailyTaskRate(w,date),date,habits:w.habit_entries.filter(e=>e.activity_date===date).length}))}
export function goalSeries(w:Workspace,goal:Goal,start:string,end:string){return eachDate(start,end).map(date=>({date,progress:goalAtDate(w,goal,date).pct}))}
export function categoryBreakdown(w:Workspace,start:string,end:string){
  const categorized=w.categories.map(c=>({name:c.name,completed:w.task_occurrences.filter(o=>o.activity_date>=start&&o.activity_date<=end&&o.status==='completed'&&w.tasks.some(t=>t.id===o.task_id&&t.category_id===c.id)).length})).filter(x=>x.completed>0)
  const uncategorized=w.task_occurrences.filter(o=>o.activity_date>=start&&o.activity_date<=end&&o.status==='completed'&&!w.tasks.find(t=>t.id===o.task_id)?.category_id).length
  return uncategorized?[...categorized,{name:'Uncategorized',completed:uncategorized}]:categorized
}
