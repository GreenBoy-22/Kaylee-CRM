export type Mode = 'home' | 'work';
export type Role = 'admin' | 'limited';
export type Priority = 'urgent' | 'warning' | 'normal' | 'good';

export const users = {
  kaylee: { name: 'Kaylee', email: 'green.kayleet@gmail.com', role: 'admin' as Role, color: '#534AB7' },
  adam: { name: 'Adam', email: 'adamlamargreen@gmail.com', role: 'limited' as Role, phone: '470-302-0444', color: '#0F6E56' }
};

export const brand = {
  purple: '#534AB7', purpleBg: '#EEEDFE', purpleDark: '#3C3489',
  green: '#0F6E56', greenBg: '#E1F5EE', red: '#A32D2D', redBg: '#FCEBEB', amber: '#854F0B', amberBg: '#FAEEDA'
};

export const inventoryLocations = [
  'Fridge','Indoor Pantry','Outdoor Pantry','Backstock','Kitchen','Living Room','Bedroom','Guest Bedroom','Office','Bathroom','Laundry Room','Library','Basement','Garage','Outdoor / Yard'
];

export const inventoryItems = [
  { id:'i1', name:'Chicken broth', brand:'Swanson', location:'Indoor Pantry', category:'Food', quantity:3, expires:'2026-07-03', value:8.97 },
  { id:'i2', name:'Laundry detergent', brand:'Tide', location:'Laundry Room', category:'Cleaning', quantity:1, expires:null, value:18.99 },
  { id:'i3', name:'Air fryer', brand:'Ninja', location:'Kitchen', category:'Appliance', quantity:1, expires:null, value:129.00, serial:'INSURANCE-READY' },
  { id:'i4', name:'Greek yogurt', brand:'Chobani', location:'Fridge', category:'Food', quantity:2, expires:'2026-06-19', value:11.98 }
];

export const todayTasks = [
  { id:'t1', title:'Check fridge items expiring this week', owner:'Kaylee', mode:'home', minutes:8, priority:'warning' as Priority },
  { id:'t2', title:'Draft 3 student follow-ups from GROW notes', owner:'Kaylee', mode:'work', minutes:20, priority:'normal' as Priority },
  { id:'t3', title:'Approve Adam’s Friday task plan', owner:'Kaylee', mode:'home', minutes:5, priority:'urgent' as Priority },
  { id:'t4', title:'Quick dishwasher reset', owner:'Adam', mode:'home', minutes:7, priority:'good' as Priority }
];

export const adamPlan = [
  { day:'Mon', tasks:['Take trash out','Clear nightstand'], rationale:'Quick wins first; no tedious stacking.' },
  { day:'Tue', tasks:['Unload dishwasher','Water porch plants'], rationale:'Two light tasks only.' },
  { day:'Wed', tasks:['Vacuum living room'], rationale:'Room-level subtask, not whole-house vacuuming.' },
  { day:'Thu', tasks:['Put laundry in hamper','Wipe bathroom counter'], rationale:'Short, contained, visible finish.' },
  { day:'Fri', tasks:['Reset car trash'], rationale:'One tiny task before weekend.' },
  { day:'Sat', tasks:['Yard work block'], rationale:'Saturday heavy day; only task.' },
  { day:'Sun', tasks:['Rest day'], rationale:'Sunday is always rest.' }
];

export const vehicles = [
  { name:'2016 Toyota Corolla', miles:134000, type:'Gas', urgent:['Spark plugs overdue','Transmission fluid unknown'], ok:['Brakes completed 2025','Tire rotation at 133,900 mi'] },
  { name:'2013 Nissan Leaf', miles:82500, type:'EV', urgent:['12V auxiliary battery likely due','HV battery health check'], ok:['Registration tracked'] }
];

export const homeSuggestions = [
  { title:'Replace HVAC filter', urgency:'urgent', reason:'Georgia pollen + renter-safe maintenance.', effort:'10 min' },
  { title:'Check under sinks for leaks', urgency:'soon', reason:'Tenant-only prevention before humidity damage.', effort:'15 min' },
  { title:'Pest entry point walkthrough', urgency:'seasonal', reason:'Canton summer pest pressure.', effort:'20 min' },
  { title:'Clean dryer lint path', urgency:'routine', reason:'Low-cost fire prevention.', effort:'15 min' }
];

export const briefing = [
  'Today focuses on approval, quick wins, and expiring inventory.',
  'Adam should stay at 2–3 tasks max; no Sunday tasks should be generated.',
  'Work mode should keep student records FERPA-safe: first name or nickname only, GROW notes only, clipboard copy only.',
  'Budget page is scaffolded next; calendar cashflow is the source of truth.'
];

export const students = [
  { displayName:'Andrea', goal:'Finish current study plan checkpoint', grow:'Goal: complete D316 checkpoint. Reality: already on study plan. Options: keep steady pace and use course resources. Will: send update by Friday.', copied:false },
  { displayName:'A.', goal:'Increase weekly study time', grow:'Goal: get back on track. Reality: progress slowed. Options: block study time and ask for help early. Will: set aside focused study this week.', copied:true }
];
