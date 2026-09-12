// Validators part 2a: address fields.
import { trimOrEmpty, SA_PROVINCES } from './donationIntake.part1.js';
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
