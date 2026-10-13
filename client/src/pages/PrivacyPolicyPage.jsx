// ─────────────────────────────────────────────────────────────
// client/src/pages/PrivacyPolicyPage.jsx
//
// Public at /privacy. Written from what the system actually stores
// and does (server/database/schema.sql, the Gmail, Gemini and push
// code), not from a template. If the system changes what it keeps or
// who it sends it to, change this page, and the date in
// features/legal/legalDetails.js, in the same commit.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import LegalPageShell, { ContactDetails } from '../features/legal/LegalPageShell';
import { LEGAL_DETAILS } from '../features/legal/legalDetails';
import { LEGAL } from '../routes/paths';

export default function PrivacyPolicyPage() {
  const { organisation } = LEGAL_DETAILS;

  return (
    <LegalPageShell
      title="Privacy Policy"
      intro={`This explains what personal information the ${organisation} warehouse system keeps, why, and who can see it.`}
    >
      <section>
        <h2>About this system</h2>
        <p>
          This is an internal system for {organisation} staff, volunteers and partners. It is
          not a public or commercial app, and it is not open to the general public. Without an
          account or a personal link, only the home page, the staff and guest sign-in pages, this
          Privacy Policy and the Terms of Service can be opened.
        </p>
        <p>
          {organisation} is responsible for the information in it. The contact details are at
          the end of this page.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <h3>Staff</h3>
        <ul>
          <li>Name, username, email address, role (warehouse worker, manager or admin) and preferred language.</li>
          <li>Your password, which is stored only as a one-way scrambled value, never as readable text.</li>
          <li>A record of what each account did and when, such as approving an order or changing a record.</li>
          <li>When you ask for a password reset, the time of the request and the internet address it came from.</li>
        </ul>
        <h3>Guests and volunteers</h3>
        <ul>
          <li>The name you type when you sign in as a guest, and the times you sign in and out.</li>
          <li>For volunteer events: first and last name, email address, phone number and whether you checked in. These are entered here or received from the volunteer management system when it is linked.</li>
        </ul>
        <h3>Donors</h3>
        <ul>
          <li>Name, contact details, address and the donation made.</li>
          <li>When a Section 18A tax certificate is requested: tax reference, South African ID number or passport number and country, registration type and whether consent was given.</li>
          <li>The Section 18A certificates issued, kept as PDF files.</li>
        </ul>
        <h3>Partners and callers</h3>
        <ul>
          <li>Early childhood development (ECD) centres: centre name, contact person, phone numbers, email address and location.</li>
          <li>Suppliers: contact name, email address, phone number and address.</li>
          <li>Benevolent requests: the caller&apos;s name and contact details and what they asked for.</li>
        </ul>
        <h3>Other records</h3>
        <ul>
          <li>A history of emails sent from the system: the recipient&apos;s address, subject, whether it was sent, and who sent it.</li>
          <li>Questions typed into the help assistant, with the screen they were asked on.</li>
          <li>Photos of pallets, items and purchase orders taken during receiving and packing.</li>
          <li>If you turn on phone alerts: your browser&apos;s push address, its keys and a description of the browser.</li>
        </ul>
      </section>

      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To let the right people sign in and do their work, and to keep a record of who did what.</li>
          <li>To run the warehouse: orders, receiving, stock, packing, dispatch, collections and reminders for ECD centres.</li>
          <li>To record donations, thank donors and issue Section 18A certificates.</li>
          <li>To record who was in the building and how many volunteer hours were given.</li>
          <li>To send the emails listed under Gmail below.</li>
          <li>To see where staff and volunteers get stuck using the system, so it can be improved.</li>
        </ul>
        <p>We do not sell personal information and we do not use it for advertising.</p>
      </section>

      <section>
        <h2>Where it is stored</h2>
        <p>
          The information is held in a hosted database provided by Supabase. The application
          runs on Render&apos;s servers in Frankfurt, Germany, so your information is handled
          outside South Africa.
        </p>
        <p>
          Some information is also saved on the device you use, as described under Cookies and
          device storage.
        </p>
      </section>

      <section>
        <h2>Who can see it</h2>
        <p>Access depends on the role of the account.</p>
        <ul>
          <li><strong>Warehouse staff</strong> see the floor screens they need: receiving, packing, decanting, dispatch, donation intake and benevolent requests. They can enter donor and caller details when they record a donation or a request.</li>
          <li><strong>Managers</strong> see the office screens: purchase orders, stock, ECD centres, collection reminders, benevolent requests, volunteer events, the guest log, donations, Section 18A certificates and reports.</li>
          <li><strong>Admins</strong> manage accounts, suppliers, settings and the email connection, and can see the activity log, archived records and the history of emails sent. They also handle donations and Section 18A certificates.</li>
          <li><strong>Guests and volunteers</strong> who sign in with a name see only the guest screens. They cannot see anyone else&apos;s information.</li>
          <li><strong>Donors</strong> who are sent a link to complete a Section 18A form see only that form.</li>
        </ul>
        <p>
          The people who build and maintain the system, and the hosting providers named below,
          can technically reach stored data in order to keep the system running.
        </p>
      </section>

      <section>
        <h2>How it is protected</h2>
        <ul>
          <li>Passwords are stored as one-way scrambled values.</li>
          <li>Every request is checked on the server against the account&apos;s role, not only hidden on screen.</li>
          <li>Sign-in sessions end automatically after 8 hours for staff and 12 hours for guests, and the sign-in cookie cannot be read by scripts on the page.</li>
          <li>Repeated failed sign-in attempts are slowed down.</li>
          <li>The Gmail and QuickBooks connection tokens are encrypted before they are stored.</li>
          <li>Links sent to donors, new users and password resets use long random codes, and only a scrambled copy of each code is stored.</li>
          <li>On shared devices, the saved copy of recent screens is cleared when you sign out or when a different person signs in.</li>
        </ul>
        <p>No system is perfectly secure, but these are the measures in place today.</p>
      </section>

      <section>
        <h2>How Gmail is used</h2>
        <p>
          An admin can connect one Google account so the system can send email from it. When
          connecting, the system asks Google for permission to:
        </p>
        <ul>
          <li>send email from that account (the Gmail send permission), and</li>
          <li>read the connected account&apos;s email address and name, only to show which account is connected.</li>
        </ul>
        <p>
          The system never reads, lists, searches or deletes mail in that account. It cannot do
          so with the permissions it asks for.
        </p>
        <p>The connection is used only to send these emails:</p>
        <ul>
          <li>account invitations and password resets</li>
          <li>purchase orders and finance report links sent to finance</li>
          <li>collection reminders for ECD centres</li>
          <li>donation thank-you emails and Section 18A certificates</li>
          <li>scheduled reports, and test emails sent by an admin</li>
        </ul>
        <p>
          The connection tokens are stored encrypted. An admin can disconnect the account in
          the system at any time, and the account owner can also remove access in their Google
          account settings.
        </p>
        <p>
          The system&apos;s use of information received from Google APIs follows the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>Other services that receive information</h2>
        <ul>
          <li><strong>Supabase</strong> hosts the database and <strong>Render</strong> hosts the application.</li>
          <li><strong>Google Gemini</strong>: questions typed into the help assistant and the report question box are sent to Google Gemini to generate an answer. Names are removed from help questions before they are sent. Google&apos;s terms may allow it to use these inputs to improve its services, so please do not type personal details about individuals into either box.</li>
          <li><strong>Phone alert services</strong> run by your browser&apos;s maker deliver phone alerts, only if you turn them on.</li>
          <li><strong>QuickBooks Online</strong> (Intuit) receives approved purchase orders, only if an admin has connected it.</li>
          <li><strong>The volunteer management system</strong> exchanges volunteer event bookings with this system, only if it has been linked.</li>
          <li><strong>WhatsApp</strong>: collection reminders can be sent through WhatsApp. The system prepares the message and a staff member sends it from their own WhatsApp, so WhatsApp then handles the phone number and the message under its own terms.</li>
        </ul>
        <p>We do not share personal information with anyone else, except where the law requires it.</p>
      </section>

      <section>
        <h2>Cookies and device storage</h2>
        <p>
          The only cookie is the sign-in cookie, which keeps you signed in. It is removed when
          you sign out or when your session ends. There is no analytics and no advertising or
          tracking of any kind.
        </p>
        <p>
          The system also saves a few things on your device, outside of cookies, so it works
          on a poor connection: the signed-in user&apos;s name and role, display settings such as
          theme and language, unfinished forms, and a copy of recently viewed screens. The copy
          of screens is cleared when you sign out or when someone else signs in, and anything
          older than 7 days is dropped. The app also saves its own files for offline use.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          Records are kept for as long as {organisation} needs them for its records and legal
          duties. Section 18A and donation records may need to be kept longer, to meet tax
          record-keeping requirements. Accounts of people who leave are deactivated and archived
          rather than erased, so past records still show who did what.
        </p>
        <p>
          To ask for your information to be deleted, contact us using the details below.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Under South Africa&apos;s Protection of Personal Information Act (POPIA) you can ask us
          what we hold about you, ask us to correct it, and ask us to delete it. We may have to
          keep some of it, for example donation records needed for tax purposes, and if so we
          will tell you why. If you are unhappy with how we handle your information you can also
          complain to the Information Regulator.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          If the system changes what it keeps or who it shares it with, this page will be
          updated and the date at the top changed. See also our{' '}
          <Link to={LEGAL.terms}>Terms of Service</Link>.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <ContactDetails />
      </section>
    </LegalPageShell>
  );
}
