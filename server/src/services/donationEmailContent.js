// ─────────────────────────────────────────────────────────────
// server/src/services/donationEmailContent.js
//
// What the donation emails say: the thank-you to a donor, the Section
// 18A certificate email, and the Finance/Tax handoff. Builds subject,
// text and HTML only. Sending, logging and retrying are in
// donationEmail.service.js.
// ─────────────────────────────────────────────────────────────
import { escapeHtml, renderLadlesEmail } from '../utils/emailTemplate.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const donorEmailFor = (donation) => {
  const email = String(donation?.donor_contact || '').trim();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
};

// ── Email helpers ───────────────────────────────────────────────
// Brand colours (from client/src/styles/staff.css) used for inline styles
const BRAND = {
  ink: '#2b3336',
  inkDeep: '#171b1c',
  accent: '#ef3a40',
  accentDeep: '#d42d33',
  gold: '#979168',
  goldDeep: '#8a8058',
  sand: '#e9e3dd',
  border: '#ddd4c8',
  text: '#5c5c5c',
  textSub: '#6f6a5e',
  textMeta: '#8b8578',
  white: '#ffffff',
  accentDeep: '#d42d33',
  goldDeep: '#8a8058',
  attention: '#8a3227',
  attentionBg: '#f6efe9',
  attentionBorder: '#e2d3c6',
  fontDisplay: '"Montserrat", "Inter", system-ui, -apple-system, sans-serif',
  fontSans: '"Inter", system-ui, -apple-system, sans-serif',
  radius: '12px',
  radiusSm: '8px',
};

const buildEmailLayout = ({ title, body, footer }) => renderLadlesEmail({
  title,
  preheader: title,
  bodyHtml: body,
  footerHtml: footer || 'Warm regards,<br>The Ladles of Love Team',
});

const getRoutingMessage = (category) => {
  switch (category) {
    case 'recipe_food':
      return 'Your donation will help us prepare nutritious cooked meals that will be served to people and families in our communities.';
    case 'non_recipe_food':
      return 'Your donation will be sorted and packed into food parcels that support vulnerable households and community organisations.';
    case 'add_on_food':
      return 'Your donation will be combined with other essential food items to create complete food parcels for families in need.';
    case 'non_food':
      return 'Your donation will support our programmes with essential everyday items that help our beneficiaries beyond food alone.';
    default:
      return 'Your donation will be used where it is needed most.';
  }
};

const generateThankYouEmailContent = (donation, section18ALink = null) => {
  const donorName = donation.donor_name || 'Friend';
  const reference = donationReferenceFor(donation);
  const routingMessage = getRoutingMessage(donation.donation_category);
  const ctaStyle = `display:inline-block;padding:12px 24px;background:${BRAND.accent};color:${BRAND.white};border-radius:${BRAND.radiusSm};font-weight:600;text-decoration:none;`;

  const section18AText = section18ALink
    ? `\n\nYour donation qualifies for a Section 18A certificate. Please complete your secure donor details form here:\n${section18ALink}`
    : '';

  const text = `Dear ${donorName},\n\nThank you for your generous donation (reference ${reference}).\n\n${routingMessage}${section18AText}\n\nYour support helps Ladles of Love continue its work.\n\nWarm regards,\nLadles of Love`;

  const body = `
    <p style="margin:0 0 16px;font-size:16px;">Dear ${donorName},</p>
    <p style="margin:0 0 16px;font-size:16px;">Thank you for your generous donation (reference <strong>${reference}</strong>).</p>
    <p style="margin:0 0 16px;font-size:16px;">${routingMessage}</p>
    ${section18ALink ? `
      <p style="margin:0 0 16px;font-size:16px;">Your donation qualifies for a Section 18A certificate. Please complete your secure donor details form.</p>
      <p style="margin:0 0 16px;font-size:16px;"><a href="${section18ALink}" style="${ctaStyle}">Complete Section 18A Form</a></p>
    ` : ''}
    <p style="margin:0 0 16px;font-size:16px;">Your support helps Ladles of Love continue its work.</p>
    <p style="margin:0 0 8px;font-size:16px;">Warm regards,</p>
    <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND.ink};">Ladles of Love</p>
  `;

  const footer = `Sent by Ladles of Love · ${new Date().toLocaleDateString()}`;

  const html = buildEmailLayout({
    title: 'Thank you for your donation',
    body,
    footer,
  });

  return { text, html };
};

const generateSection18ACertificateEmailContent = (donation, certificate, settings) => {
  const donorName = donation.donor_name || 'Donor';
  const certNumber = certificate.certificate_number;
  const orgName = settings?.organisation_name || 'Ladles of Love';
  const pboName = settings?.pbo_name || '';
  const pboNumber = settings?.pbo_number || '';
  const section18aRef = settings?.section18a_reference || '';
  const orgAddress = settings?.organisation_address || '';
  const contactEmail = settings?.contact_email || '';
  const contactPhone = settings?.contact_phone || '';

  const text = `Dear ${donorName},\n\nThank you for your generous support of ${orgName}.\n\nYour donation qualified for a Section 18A tax certificate. Please find your certificate (${certNumber}) attached as a PDF.\n\nThis certificate may be used when preparing your South African tax return, where applicable.\n\nIf you have any questions or notice any issues with the certificate, please contact us:\n${orgName}\n${orgAddress}\nEmail: ${contactEmail}\nPhone: ${contactPhone}\n\nWarm regards,\n${orgName}`;

  const body = `
    <p style="margin:0 0 16px;font-size:16px;">Dear ${donorName},</p>
    <p style="margin:0 0 16px;font-size:16px;">Thank you for your generous support of <strong>${orgName}</strong>.</p>
    <p style="margin:0 0 16px;font-size:16px;">Your donation qualified for a Section 18A tax certificate. Please find your certificate (<strong>${certNumber}</strong>) attached as a PDF.</p>
    <p style="margin:0 0 16px;font-size:16px;">This certificate may be used when preparing your South African tax return, where applicable.</p>
    <p style="margin:0 0 16px;font-size:16px;">If you have any questions or notice any issues with the certificate, please contact us:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:16px;">
      <li>${orgName}</li>
      ${orgAddress ? `<li>${orgAddress}</li>` : ''}
      ${contactEmail ? `<li>Email: <a href="mailto:${contactEmail}" style="color:${BRAND.accent};">${contactEmail}</a></li>` : ''}
      ${contactPhone ? `<li>Phone: ${contactPhone}</li>` : ''}
    </ul>
    <p style="margin:0 0 8px;font-size:16px;">Warm regards,</p>
    <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND.ink};">${orgName}</p>
  `;

  const footer = `
    <p style="margin:0 0 8px;font-size:13px;color:${BRAND.textMeta};">${orgName}</p>
    ${pboName ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">PBO: ${pboName}</p>` : ''}
    ${pboNumber ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">PBO Number: ${pboNumber}</p>` : ''}
    ${section18aRef ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Section 18A Reference: ${section18aRef}</p>` : ''}
    ${orgAddress ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">${orgAddress}</p>` : ''}
    ${contactEmail ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Email: <a href="mailto:${contactEmail}" style="${ 'color:'+BRAND.accent+';text-decoration:none;' }">${contactEmail}</a></p>` : ''}
    ${contactPhone ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Phone: ${contactPhone}</p>` : ''}
  `;

  const html = buildEmailLayout({
    title: 'Your Section 18A tax certificate',
    body,
    footer,
  });

  return {
    text: `Dear ${donorName},\n\nThank you for your generous support of ${orgName}.\n\nYour donation qualified for a Section 18A tax certificate. Please find your certificate (${certNumber}) attached as a PDF.\n\nThis certificate may be used when preparing your South African tax return, where applicable.\n\nIf you have any questions or notice any issues with the certificate, please contact us:\n${orgName}\n${orgAddress}\nEmail: ${contactEmail}\nPhone: ${contactPhone}\n\nWarm regards,\n${orgName}`,
    html,
    attachments: [{
      filename: certificate.pdf_filename,
      content: certificate.pdf_content,
      contentType: certificate.pdf_content_type,
    }],
  };
};

const donationReferenceFor = (donation) =>
  donation.section_18a_certificate_ref || `DON-${donation.id}`;

const formatSection18AValue = (value) => {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not recorded';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const section18AFormDetailLines = (formData = {}) =>
  Object.entries(formData)
    .map(([key, value]) => `- ${key}: ${formatSection18AValue(value)}`)
    .join('\n');

const donationItemLines = (donation = {}) => {
  const items = Array.isArray(donation.items) ? donation.items : [];
  if (!items.length) return '- No donated items recorded on the donation.';
  return items.map((item) => {
    const name = item.product_name || item.product || item.description || item.product_description || 'Item';
    const quantity = item.quantity ?? item.qty ?? 'quantity not recorded';
    const unit = item.unit ? ` ${item.unit}` : '';
    return `- ${name}: ${quantity}${unit}`;
  }).join('\n');
};

const generateSection18AHandoffEmailContent = (donation, formData) => {
  const donorName = formData.fullNameOrCompanyName || donation.donor_name || 'Donor';
  const donorEmail = formData.email || donorEmailFor(donation) || 'Not recorded';
  const donorPhone = formData.phone || donation.donor_phone || donation.phone || null;
  const donorContact = donorPhone ? `${donorEmail} / ${donorPhone}` : donorEmail;
  const reference = donationReferenceFor(donation);
  const estimatedValue = formatSection18AValue(donation.estimated_value_zar);
  const taxReference = formData.incomeTaxNumber || donation.donor_tax_reference || 'Not recorded';

  const text = `Finance/Tax handoff: Section 18A donor details received.

${donorName} donated these items. Here are the submitted details Finance/Tax needs to generate the Section 18A certificate.

Donor name: ${donorName}
Donor email/contact: ${donorContact}
Donation reference/id: ${reference}
Estimated donation value: ${estimatedValue}
Tax reference: ${taxReference}

Donated items:
${donationItemLines(donation)}

Submitted Section18A form details:
${section18AFormDetailLines(formData)}
`;
  const html = buildEmailLayout({
    title: 'Finance/Tax handoff',
    body: `
      <p style="margin:0 0 16px;font-size:16px;">Finance/Tax handoff: Section 18A donor details received.</p>
      <p style="margin:0 0 16px;font-size:16px;"><strong>${escapeHtml(donorName)}</strong> donated these items. Here are the submitted details Finance/Tax needs to generate the Section 18A certificate.</p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:16px;">
        <li>Donor name: ${escapeHtml(donorName)}</li>
        <li>Donor email/contact: ${escapeHtml(donorContact)}</li>
        <li>Donation reference/id: ${escapeHtml(reference)}</li>
        <li>Estimated donation value: ${escapeHtml(estimatedValue)}</li>
        <li>Tax reference: ${escapeHtml(taxReference)}</li>
      </ul>
      <p style="margin:0 0 8px;font-size:16px;"><strong>Donated items:</strong></p>
      <pre style="white-space:pre-wrap;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${escapeHtml(donationItemLines(donation))}</pre>
      <p style="margin:0 0 8px;font-size:16px;"><strong>Submitted Section18A form details:</strong></p>
      <pre style="white-space:pre-wrap;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${escapeHtml(section18AFormDetailLines(formData))}</pre>
    `,
    footer: 'Internal Finance/Tax handoff from WMS',
  });

  return {
    subject: `Finance/Tax handoff: Section 18A details for ${reference}`,
    text,
    html,
  };
};

export {
  generateThankYouEmailContent,
  generateSection18ACertificateEmailContent,
  generateSection18AHandoffEmailContent,
};
