// ─────────────────────────────────────────────────────────────
// server/src/utils/donationValidation.js
//
// Every rule for the donation form and the Section 18A donor details:
// what a name, email, phone, address, ID or amount must look like, and
// the check of a whole donation as it arrives (validateDonationPayload).
//
// THE SERVER IS THE SOURCE OF TRUTH. The client keeps a copy of the
// rules it shows while someone types (client/src/lib/donationValidation.js);
// whatever the screen allowed, these are checked again here.
//
// Each validator returns { value, error }: the cleaned value, and the
// message to show or null. This was five files named part1, part2a,
// part2b, part2c and payload; nothing separated them but the names.
// ─────────────────────────────────────────────────────────────

// ── Limits, names, email, phone ───────────────────────────────
export const SA_PROVINCES = ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'];
export const LIMITS = { donorName:{min:2,max:120}, companyName:{min:2,max:200}, email:{max:254}, country:{min:2,max:80}, city:{min:2,max:80}, street:{min:3,max:200}, description:{min:1,max:500}, notes:{max:2000} };
export const trimOrEmpty = (v) => (v===null||v===undefined?'':String(v).trim());
export function validateDonorName(value, opts={}) {
  const v = trimOrEmpty(value);
  if (opts.anonymous) return { value:'', error:null };
  if (!v) return { value:v, error:'Donor name is required.' };
  if (v.length<2) return { value:v, error:'Donor name must be at least 2 characters.' };
  if (v.length>120) return { value:v, error:'Donor name must be 120 characters or fewer.' };
  // Allowlist below already rejects every control character (they match none
  // of the permitted letters/spaces/apostrophes/hyphens), so no separate
  // control-character regex is needed here.
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]+$/.test(v) || /\d/.test(v)) return { value:v, error:'Donor name may only contain letters, spaces, apostrophes and hyphens.' };
  return { value:v, error:null };
}
export function validateCompanyName(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Company / organisation name is required.' } : { value:v, error:null };
  if (v.length<2) return { value:v, error:'Company name must be at least 2 characters.' };
  if (v.length>200) return { value:v, error:'Company name must be 200 characters or fewer.' };
  if (!/^[A-Za-z0-9À-ÖØ-öø-ÿ&.,'’()\- ]+$/.test(v)) return { value:v, error:'Company name contains invalid characters.' };
  return { value:v, error:null };
}
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export function validateEmail(value, opts={}) {
  const raw = value===null||value===undefined?'':String(value);
  const v = raw.trim().toLowerCase();
  if (!v) return opts.required ? { value:v, error:'Email address is required.' } : { value:v, error:null };
  if (/\s/.test(v) || v.length>254 || !EMAIL_RE.test(v)) return { value:v, error:'Email address is not in a valid format.' };
  const parts = v.split('@');
  if (parts.length!==2 || !parts[0] || !parts[1].includes('.')) return { value:v, error:'Email address is not in a valid format.' };
  return { value:v, error:null };
}
export function validateSaPhone(value, opts={}) {
  const raw = trimOrEmpty(value);
  if (!raw) return opts.required ? { value:'', error:'Phone number is required.' } : { value:'', error:null };
  if (/[A-Za-z]/.test(raw)) return { value:raw, error:'Phone number is not a valid South African number.' };
  let s = raw.replace(/[()\s.-]/g,'');
  if (!/^\+?\d+$/.test(s)) return { value:s, error:'Phone number is not a valid South African number.' };
  let d = s;
  if (d.startsWith('+27')) d = '0'+d.slice(3);
  else if (d.startsWith('27') && d.length===11) d = '0'+d.slice(2);
  if (!/^0\d{9}$/.test(d)) return { value:d, error:'Phone number is not a valid South African number.' };
  return { value:d, error:null };
}

// ── Address ───────────────────────────────────────────────────
export function validateCountry(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Country is required.' } : { value:v, error:null };
  if (v.length<2) return { value:v, error:'Country name must be at least 2 characters.' };
  if (v.length>80) return { value:v, error:'Country name must be 80 characters or fewer.' };
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]+$/.test(v) || /\d/.test(v)) return { value:v, error:'Country name may only contain letters, spaces and hyphens.' };
  return { value:v, error:null };
}
export function validateProvince(value, opts={}) {
  const v = trimOrEmpty(value);
  const c = trimOrEmpty(opts.country).toLowerCase();
  const isSA = c==='south africa'||c==='republic of south africa'||c==='rsa';
  if (!v) return isSA ? { value:v, error:'Province is required for South African addresses. Select one of the 9 official provinces.' } : { value:v, error:null };
  if (isSA && !SA_PROVINCES.includes(v)) return { value:v, error:'Province must be one of: '+SA_PROVINCES.join(', ')+'.' };
  return { value:v, error:null };
}
export function validateCity(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'City is required.' } : { value:v, error:null };
  if (v.length<2) return { value:v, error:'City must be at least 2 characters.' };
  if (v.length>80) return { value:v, error:'City must be 80 characters or fewer.' };
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]+$/.test(v) || /\d/.test(v)) return { value:v, error:'City may only contain letters, spaces, hyphens and apostrophes.' };
  return { value:v, error:null };
}
export function validatePostalCode(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Postal code is required.' } : { value:v, error:null };
  const c = trimOrEmpty(opts.country).toLowerCase();
  const isSA = !c||c==='south africa'||c==='republic of south africa'||c==='rsa';
  if (isSA) { if (!/^\d{4}$/.test(v)) return { value:v, error:'Postal code must contain exactly 4 digits.' }; return { value:v, error:null }; }
  if (v.length<3||v.length>12) return { value:v, error:'Postal code must be between 3 and 12 characters.' };
  if (!/^[A-Za-z0-9\- ]+$/.test(v)) return { value:v, error:'Postal code contains invalid characters.' };
  return { value:v, error:null };
}
export function validateStreetAddress(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Street address is required.' } : { value:v, error:null };
  if (v.length<3) return { value:v, error:'Street address must be at least 3 characters.' };
  if (v.length>200) return { value:v, error:'Street address must be 200 characters or fewer.' };
  if (!/^[A-Za-z0-9À-ÖØ-öø-ÿ.,'’\-/#() ]+$/.test(v)) return { value:v, error:'Street address contains invalid characters.' };
  return { value:v, error:null };
}

// ── ID, passport, tax and PBO numbers, Section 18A reference ──
function luhnOk(d) {
  let sum=0;
  for (let i=0;i<12;i++){ let x=Number(d[i]); if(i%2===1){x*=2; if(x>9)x-=9;} sum+=x; }
  return ((10-(sum%10))%10)===Number(d[12]);
}
function saIdDateOk(yy,mm,dd) {
  if(mm<1||mm>12||dd<1||dd>31) return false;
  const now=new Date(); const curYY=now.getFullYear()%100; const base=Math.floor(now.getFullYear()/100)*100;
  let y = yy<=curYY ? base+yy : base-100+yy;
  if (y>now.getFullYear()) y-=100;
  if (now.getFullYear()-y>120) return false;
  const p=new Date(Date.UTC(y,mm-1,dd));
  return p.getUTCFullYear()===y&&p.getUTCMonth()===mm-1&&p.getUTCDate()===dd;
}
export function validateSaIdNumber(value, opts={}) {
  const raw = trimOrEmpty(value);
  if (!raw) return opts.required ? { value:'', error:'South African ID number is required.' } : { value:'', error:null };
  if (/\s/.test(raw)||!/^\d+$/.test(raw)) return { value:raw, error:'South African ID number is invalid.' };
  if (raw.length!==13) return { value:raw, error:'South African ID number must contain exactly 13 digits.' };
  if (/^0{13}$/.test(raw)) return { value:raw, error:'South African ID number is invalid.' };
  if (!saIdDateOk(Number(raw.slice(0,2)),Number(raw.slice(2,4)),Number(raw.slice(4,6)))) return { value:raw, error:'South African ID number contains an invalid date of birth.' };
  const cz=Number(raw[10]);
  if (cz!==0&&cz!==1) return { value:raw, error:'South African ID number is invalid.' };
  if (!luhnOk(raw)) return { value:raw, error:'South African ID number is invalid.' };
  return { value:raw, error:null };
}
export function validatePassportNumber(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Passport number is required.' } : { value:v, error:null };
  if (/\s/.test(v)) return { value:v, error:'Passport number is not in a valid format.' };
  if (v.length<6||v.length>20) return { value:v, error:'Passport number must be between 6 and 20 characters.' };
  if (!/^[A-Za-z0-9-]+$/.test(v)) return { value:v, error:'Passport number may only contain letters, numbers and hyphens.' };
  return { value:v.toUpperCase(), error:null };
}
export function validateTaxReference(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Income tax reference number is required.' } : { value:v, error:null };
  if (!/^\d+$/.test(v)) return { value:v, error:'Income tax reference number must contain digits only.' };
  if (v.length!==10) return { value:v, error:'Income tax reference number must contain exactly 10 digits.' };
  return { value:v, error:null };
}
export function validatePboNumber(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'PBO number is required.' } : { value:v, error:null };
  const d = v.replace(/\s/g,'');
  if (!/^\d+$/.test(d)) return { value:d, error:'PBO number must contain digits only.' };
  if (d.length<9||d.length>10) return { value:d, error:'PBO number must contain 9 to 10 digits.' };
  return { value:d, error:null };
}
export function validateSection18AReference(value, opts={}) {
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:'Section 18A reference is required.' } : { value:v, error:null };
  if (v.length<3||v.length>40) return { value:v, error:'Section 18A reference must be between 3 and 40 characters.' };
  if (!/^[A-Za-z0-9\-/]+$/.test(v)) return { value:v, error:'Section 18A reference may only contain letters, numbers, hyphens and forward slashes.' };
  return { value:v, error:null };
}

// ── Descriptions, quantities, money, dates ────────────────────
export function validateDescription(value, opts={}) {
  const field = opts.field||'Description';
  const v = trimOrEmpty(value);
  const req = opts.required!==false;
  if (!v) return req ? { value:v, error:field+' is required.' } : { value:v, error:null };
  if (v.length>500) return { value:v, error:field+' must be 500 characters or fewer.' };
  return { value:v, error:null };
}
export function validateQuantity(value) {
  const raw = trimOrEmpty(value);
  if (!raw) return { value:null, error:'Quantity is required.' };
  if (typeof value==='string'&&/[A-Za-z]/.test(value)) return { value:null, error:'Quantity must be a positive number.' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value:null, error:'Quantity must be a positive number.' };
  if (n<=0) return { value:null, error:'Quantity must be greater than zero.' };
  if (n>100000) return { value:null, error:'Quantity must not exceed 100,000.' };
  return { value:n, error:null };
}
export function validateMoney(value, opts={}) {
  const field = opts.field||'Amount';
  const raw = trimOrEmpty(value);
  if (!raw) return opts.required ? { value:null, error:field+' is required.' } : { value:null, error:null };
  if (/[A-Za-z]/.test(raw)) return { value:null, error:field+' must be a valid monetary amount.' };
  if (raw.startsWith('-')) return { value:null, error:field+' must not be negative.' };
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return { value:null, error:field+' may have at most two decimal places.' };
  const n = Number(raw);
  if (!Number.isFinite(n)||n>100000000) return { value:null, error:field+' must be a valid monetary amount.' };
  return { value:Math.round(n*100)/100, error:null };
}
export function validateIsoDate(value, opts={}) {
  const field = opts.field||'Date';
  const v = trimOrEmpty(value);
  if (!v) return opts.required ? { value:v, error:field+' is required.' } : { value:v, error:null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { value:v, error:field+' must be a valid calendar date (YYYY-MM-DD).' };
  const p=v.split('-').map(Number);
  const d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
  if(d.getUTCFullYear()!==p[0]||d.getUTCMonth()!==p[1]-1||d.getUTCDate()!==p[2]) return { value:v, error:field+' must be a valid calendar date (YYYY-MM-DD).' };
  if(!opts.allowFuture){ const t=new Date(); const tu=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate()); if(Date.UTC(p[0],p[1]-1,p[2])>tu) return { value:v, error:field+' must not be in the future.' }; }
  return { value:v, error:null };
}
export function donationFingerprint(input={}) {
  const norm = (s) => trimOrEmpty(s).toLowerCase().replace(/\s+/g,' ');
  const itemPart = (input.items||[]).map((it)=>norm(it.description)+'|'+Number(it.quantity)+'|'+norm(it.unit)).sort().join(';');
  return norm(input.donorKey)+'#'+trimOrEmpty(input.donationDate)+'#'+itemPart;
}

// ── A whole donation ──────────────────────────────────────────
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
