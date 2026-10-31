import {addCalendarMonths} from "./accounting";
// Monthly charges resume at next_due_date; months_in_advance is paid coverage, not a billing interval.
export function anticipatedRent(row:any,month:string):number|null{
 if(row.is_active===false)return 0;
 const due=row.next_due_date;if(!due||!/^\d{4}-\d{2}$/.test(month))return null;
 if(due.slice(0,7)>month)return 0;
 const [y,m]=month.split('-').map(Number),[dy,dm]=due.split('-').map(Number);
 const date=addCalendarMonths(due,(y-dy)*12+m-dm);
 if(date.slice(0,7)!==month)return 0;
 return Math.max(0,Number(row.monthly_rent||0)-(due.slice(0,7)===month?Number(row.partial_credit||0):0));
}
