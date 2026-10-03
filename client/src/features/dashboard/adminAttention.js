// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/adminAttention.js
//
// The admin's Needs attention lines, from the figures the admin
// dashboard already loads (CustomisableDashboard's sources). Same
// shape as the manager's: a count, a sentence, where to go. A line
// whose count is zero is not shown. Null while anything is loading,
// so the list shows a placeholder rather than "all clear".
// ─────────────────────────────────────────────────────────────
import { FileBadge, Gift, Mail, PackageSearch, ScrollText } from 'lucide-react';
import { ADMIN } from '../../routes/paths';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The sources the lines read; the admin page asks the board for them.
export const ADMIN_ATTENTION_SOURCES = ['donations', 's18a', 'gmail', 'products'];

export const adminAttentionItems = (data) => {
  if (ADMIN_ATTENTION_SOURCES.some((k) => data[k] === undefined)) return null;
  const { donations, s18a, gmail, products } = data;
  const gaps = products.filter((p) => p.isActive && (p.unitCost == null || p.weightKg == null)).length;
  return [
    { key: 'email', tone: 'bad', icon: Mail, count: gmail?.connected ? 0 : 1,
      text: () => 'Email sending is off — certificates, reminders and Finance emails are not going out',
      to: ADMIN.emailIntegration },
    { key: 'donations', tone: 'warn', icon: Gift, count: donations ?? 0,
      text: (n) => `${plural(n, 'donation is', 'donations are')} waiting in the classification queue`,
      to: ADMIN.donationManagement },
    { key: 'certificates', tone: 'warn', icon: FileBadge, count: s18a?.queued ?? 0,
      text: (n) => `${plural(n, 'Section 18A certificate is', 'Section 18A certificates are')} ready to issue`,
      to: ADMIN.section18aManagement },
    { key: 'donorDetails', tone: 'info', icon: ScrollText, count: s18a?.qualifying_pending_donor ?? 0,
      text: (n) => `${plural(n, 'certificate is', 'certificates are')} waiting on the donor’s details`,
      to: ADMIN.section18aManagement },
    { key: 'catalogueGaps', tone: 'info', icon: PackageSearch, count: gaps,
      text: (n) => `${plural(n, 'product has', 'products have')} no cost or weight, so orders cannot estimate them`,
      to: ADMIN.products },
  ];
};
