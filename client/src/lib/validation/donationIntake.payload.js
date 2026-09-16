// Full payload validator. Backend source of truth.
import { trimOrEmpty } from './donationIntake.part1.js';
import { validateDonorName, validateEmail } from './donationIntake.part1.js';
import { validateDescription, validateQuantity, validateMoney, validateIsoDate } from './donationIntake.part2c.js';
export function validateDonationPayload(body={}) {
  const errors={}; const warnings=[]; const sanitized={};
  const consent = body.donorConsentGiven;
  const anonymous = body.isAnonymousDonation===true||body.anonymous===true;
  if (!body.category||typeof body.category!=='string'||!trimOrEmpty(body.category)) errors.category='A donation category is required.';
  else sanitized.category=trimOrEmpty(body.category);
  const money=validateMoney(body.estimatedValueZar,{required:true,field:'Estimated value'});
  if(money.error) errors.estimatedValueZar=money.error; else sanitized.estimatedValueZar=money.value;
  if(body.programmeCode!==undefined&&body.programmeCode!==null&&trimOrEmpty(body.programmeCode)!=='') sanitized.programmeCode=trimOrEmpty(body.programmeCode);
  if(!anonymous){
    const n=validateDonorName(body.donorName,{});
    if(n.error)errors.donorName=n.error; else sanitized.donorName=n.value;
    const e=validateEmail(body.donorContact??body.donorEmail,{required:consent===true});
    if(e.error)errors.donorContact=e.error; else sanitized.donorContact=e.value;
  }
  if(!Array.isArray(body.items)||body.items.length===0) errors.items='At least one donated item is required.';
  else { const ie={}; body.items.forEach((it,idx)=>{ const r={}; const d=validateDescription(it?.description,{required:true,field:'Description'}); if(d.error)r.description=d.error; const q=validateQuantity(it?.quantity); if(q.error)r.quantity=q.error; if(Object.keys(r).length)ie[idx]=r; }); if(Object.keys(ie).length)errors.itemErrors=ie; }
  if(body.donationDate!==undefined&&trimOrEmpty(body.donationDate)!==''){ const dt=validateIsoDate(body.donationDate,{allowFuture:false,field:'Donation date'}); if(dt.error)errors.donationDate=dt.error; else sanitized.donationDate=dt.value; }
  if(body.notes!==undefined&&body.notes!==null&&trimOrEmpty(body.notes)!==''){ const v=trimOrEmpty(body.notes); if(v.length>2000)errors.notes='Notes must be 2000 characters or fewer.'; else sanitized.notes=v; }
  return { valid:Object.keys(errors).length===0, errors, warnings, sanitized };
}
