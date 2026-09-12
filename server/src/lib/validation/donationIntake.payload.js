// Full payload validator. Backend source of truth.
import { trimOrEmpty } from './donationIntake.part1.js';
import { validateDonorName, validateCompanyName, validateEmail, validateSaPhone } from './donationIntake.part1.js';
import { validateCountry, validateProvince, validateCity, validatePostalCode, validateStreetAddress } from './donationIntake.part2a.js';
import { validateSaIdNumber, validatePassportNumber, validateTaxReference, validatePboNumber } from './donationIntake.part2b.js';
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
  if(consent===true&&!anonymous){
    const donorType=trimOrEmpty(body.donorType);
    const isCompany=donorType==='company'||donorType==='trust'||donorType==='other';
    if(isCompany){ const c=validateCompanyName(body.donorName??body.companyName,{required:true}); if(c.error)errors.donorName=c.error; else sanitized.donorName=c.value; }
    else { const n=validateDonorName(body.donorName,{}); if(n.error)errors.donorName=n.error; else sanitized.donorName=n.value; }
    const e=validateEmail(body.donorContact??body.donorEmail,{required:true});
    if(e.error)errors.donorContact=e.error; else sanitized.donorContact=e.value;
    const ph=validateSaPhone(body.donorContactNumber??body.donorPhone,{required:true});
    if(ph.error)errors.donorContactNumber=ph.error; else sanitized.donorContactNumber=ph.value;
    const tx=validateTaxReference(body.donorTaxReference,{required:true});
    if(tx.error)errors.donorTaxReference=tx.error; else sanitized.donorTaxReference=tx.value;
    const co=validateCountry(body.donorCountry??body.country,{required:true});
    if(co.error)errors.donorCountry=co.error; else sanitized.donorCountry=co.value;
    const pr=validateProvince(body.donorProvince??body.province,{country:sanitized.donorCountry??''});
    if(pr.error)errors.donorProvince=pr.error; else if(pr.value)sanitized.donorProvince=pr.value;
    const ci=validateCity(body.donorCity??body.city,{required:true});
    if(ci.error)errors.donorCity=ci.error; else sanitized.donorCity=ci.value;
    const pc=validatePostalCode(body.donorPostalCode??body.postalCode,{country:sanitized.donorCountry??'',required:true});
    if(pc.error)errors.donorPostalCode=pc.error; else sanitized.donorPostalCode=pc.value;
    const st=validateStreetAddress(body.donorAddress??body.streetAddress,{required:true});
    if(st.error)errors.donorAddress=st.error; else sanitized.donorAddress=st.value;
    if(!isCompany){
      const idType=trimOrEmpty(body.donorIdType);
      const idVal=trimOrEmpty(body.donorIdNumber);
      if(idType==='passport'){ const p=validatePassportNumber(body.donorIdNumber,{required:true}); if(p.error)errors.donorIdNumber=p.error; else sanitized.donorIdNumber=p.value; }
      else if(idType==='south_african_id'||/^\d*$/.test(idVal)){ const id=validateSaIdNumber(body.donorIdNumber,{required:true}); if(id.error)errors.donorIdNumber=id.error; else sanitized.donorIdNumber=id.value; }
      else if(idType){ const d=validateDescription(body.donorIdNumber,{required:true,field:'Identification number'}); if(d.error)errors.donorIdNumber=d.error; else sanitized.donorIdNumber=d.value; }
    }
    if(body.donorPboNumber!==undefined&&trimOrEmpty(body.donorPboNumber)!==''){ const p=validatePboNumber(body.donorPboNumber,{}); if(p.error)errors.donorPboNumber=p.error; else sanitized.donorPboNumber=p.value; }
  }
  if(!Array.isArray(body.items)||body.items.length===0) errors.items='At least one donated item is required.';
  else { const ie={}; body.items.forEach((it,idx)=>{ const r={}; const d=validateDescription(it?.description,{required:true,field:'Description'}); if(d.error)r.description=d.error; const q=validateQuantity(it?.quantity); if(q.error)r.quantity=q.error; if(Object.keys(r).length)ie[idx]=r; }); if(Object.keys(ie).length)errors.itemErrors=ie; }
  if(body.donationDate!==undefined&&trimOrEmpty(body.donationDate)!==''){ const dt=validateIsoDate(body.donationDate,{allowFuture:false,field:'Donation date'}); if(dt.error)errors.donationDate=dt.error; else sanitized.donationDate=dt.value; }
  if(body.notes!==undefined&&body.notes!==null&&trimOrEmpty(body.notes)!==''){ const v=trimOrEmpty(body.notes); if(v.length>2000)errors.notes='Notes must be 2000 characters or fewer.'; else sanitized.notes=v; }
  return { valid:Object.keys(errors).length===0, errors, warnings, sanitized };
}
