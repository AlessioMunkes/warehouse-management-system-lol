// Shared donation-intake validators (part 1: constants + names/emails/phones).
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
