// ─────────────────────────────────────────────────────────────
// client/src/pages/TermsOfServicePage.jsx
//
// Public at /terms. The rules for using the system, written for the
// people who actually use it: staff, volunteers and guests. Change the
// date in features/legal/legalDetails.js whenever this changes.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import LegalPageShell, { ContactDetails } from '../features/legal/LegalPageShell';
import { LEGAL_DETAILS } from '../features/legal/legalDetails';
import { LEGAL } from '../routes/paths';

export default function TermsOfServicePage() {
  const { organisation } = LEGAL_DETAILS;

  return (
    <LegalPageShell
      title="Terms of Service"
      intro={`These are the rules for using the ${organisation} warehouse system. By signing in or using it, you agree to them.`}
    >
      <section>
        <h2>What this system is</h2>
        <p>
          This is an internal system for {organisation} staff, volunteers and partners. It is
          used to run the warehouse: orders, stock, packing, dispatch, donations and volunteer
          sign-ins. It is not a public or commercial app, and it is not offered to the general
          public.
        </p>
      </section>

      <section>
        <h2>Who may use it</h2>
        <ul>
          <li><strong>Staff</strong> (warehouse workers, managers and admins) with an account created for them by an admin.</li>
          <li><strong>Volunteers and guests</strong> who sign in with their name at the warehouse. They can use the guest screens only.</li>
          <li><strong>Donors and partners</strong> who have been sent a personal link, for the one form or report that link opens.</li>
        </ul>
        <p>
          If you have not been given access by {organisation}, you may not use the system.
          What each role can see is explained in the <Link to={LEGAL.privacy}>Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Keep your password to yourself. Do not share your account or let someone else use it.</li>
          <li>Sign out when you finish, especially on a shared tablet or computer.</li>
          <li>Tell an admin straight away if you think someone else has used your account or knows your password.</li>
          <li>What is done with your account is recorded against your name, and you are responsible for it.</li>
          <li>An admin can deactivate an account at any time, for example when someone leaves.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Use the system only for {organisation}&apos;s work. You agree to:</p>
        <ul>
          <li>enter accurate information, and give your real name if you sign in as a guest</li>
          <li>use only the screens and records your role is meant for, and not try to get around that</li>
          <li>keep other people&apos;s personal information inside the system, and not copy it elsewhere or share it unless your work requires it</li>
          <li>not try to break, overload or test the security of the system, or interfere with how it works for others</li>
          <li>not enter anything unlawful, offensive or misleading</li>
        </ul>
      </section>

      <section>
        <h2>The organisation owns the data</h2>
        <p>
          The records and information entered in the system belong to {organisation}, not to
          the person who typed them in. Personal information in them is handled as described in
          the <Link to={LEGAL.privacy}>Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          We do our best to keep the system running, but we do not promise it will always be
          available or free of errors. It may be slow to start after a quiet period, and it may
          be unavailable for maintenance or because of problems with our hosting or other
          services. Some screens can be used with no signal and send their changes once the
          connection returns, but screens that need up-to-date information may not.
        </p>
        <p>
          The system is provided as it is, and to the extent the law allows, {organisation} is
          not responsible for losses caused by it being unavailable or by mistakes in the
          information in it.
        </p>
      </section>

      <section>
        <h2>Suspending access</h2>
        <p>
          {organisation} may suspend or remove access to the system for anyone who breaks these
          terms, or who no longer needs access.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may change these terms. The updated version will be on this page with a new date at
          the top, and carrying on using the system after that means you accept the change.
        </p>
      </section>

      <section>
        <h2>Law</h2>
        <p>These terms are governed by the laws of South Africa.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <ContactDetails />
      </section>
    </LegalPageShell>
  );
}
