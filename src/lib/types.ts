export type Profile = { id:string; display_name:string;timezone:string;theme:'dark'|'light' }
export type Category = {id:string;user_id:string;name:string;color:string}
export type Task = {id:string;user_id:string;title:string;description:string;priority:'low'|'medium'|'high';scheduled_date:string;due_date:string|null;category_id:string|null;goal_id:string|null;created_at:string}
export type Rule = {id:string;user_id:string;task_id:string;frequency:'daily'|'weekly'|'monthly';interval_count:number;weekdays:number[];starts_on:string;ends_on:string|null}
export type Occurrence = {id:string;user_id:string;task_id:string;activity_date:string;status:'pending'|'completed';completed_at:string|null}
export type Habit = {id:string;user_id:string;title:string;color:string;start_date:string;archived_at:string|null}
export type HabitTarget = {id:string;user_id:string;habit_id:string;weekly_target:number;effective_from:string}
export type HabitEntry = {id:string;user_id:string;habit_id:string;activity_date:string;completed_at:string}
export type Goal = {id:string;user_id:string;title:string;description:string;metric_type:'numeric'|'milestone';target_value:number|null;initial_value:number;target_date:string|null;status:'not_started'|'in_progress'|'completed'|'paused';created_at:string}
export type Milestone = {id:string;user_id:string;goal_id:string;title:string;due_date:string|null;completed_on:string|null;completed_at:string|null}
export type GoalEntry = {id:string;user_id:string;goal_id:string;delta_value:number;activity_date:string;note:string}
export type Reflection = {id:string;user_id:string;activity_date:string;accomplishments:string;challenges:string;learnings:string;tomorrow_focus:string;mood:number|null;rating:number|null}
export type Workspace = {
  profile:Profile;categories:Category[];tasks:Task[];recurrence_rules:Rule[];task_occurrences:Occurrence[];
  habits:Habit[];habit_targets:HabitTarget[];habit_entries:HabitEntry[];
  goals:Goal[];milestones:Milestone[];goal_progress_entries:GoalEntry[];daily_reflections:Reflection[]
}
