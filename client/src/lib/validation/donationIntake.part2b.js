// Validators part 2b: SA ID + passport + tax + pbo + 18A ref.
import { trimOrEmpty } from './donationIntake.part1.js';
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
