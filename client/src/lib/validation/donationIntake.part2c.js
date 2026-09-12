// Validators part 2c: quantities + dates + fingerprint.
import { trimOrEmpty } from './donationIntake.part1.js';
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
