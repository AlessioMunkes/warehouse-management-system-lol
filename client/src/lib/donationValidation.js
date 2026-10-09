// ─────────────────────────────────────────────────────────────
// client/src/lib/donationValidation.js
//
// The donation form's rules, as shown while someone types: names, email,
// phone, descriptions, quantities, money and dates.
//
// A copy of the matching rules in server/src/utils/donationValidation.js,
// which is the source of truth and checks everything again. Change a
// rule there first, then here, so the screen and the server agree.
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
