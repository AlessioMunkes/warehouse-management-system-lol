// ─────────────────────────────────────────────────────────────
// client/src/features/donationManagement/components/CertificateSettings.jsx
// ─────────────────────────────────────────────────────────────
// CRUD interface for Certificate Settings.
// Reflects the backend singleton CRUD operations:
// - GET    /api/certificate-settings  (read current settings)
// - POST   /api/certificate-settings  (create initial settings)
// - PUT    /api/certificate-settings  (update existing settings)
// - DELETE /api/certificate-settings  (delete settings, admin only)
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Loader2, Trash2, Save, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/context/AuthContext';
import { getSettings, createSettings, updateSettings, deleteSettings } from '@/services/section18aSettingsAPI';

const FIELD_GROUPS = [
  {
    title: 'Organisation',
    description: 'Organisation details used on certificates.',
    fields: [
      { name: 'organisationName', label: 'Organisation Name', type: 'input', required: true },
      { name: 'pboNumber', label: 'PBO Number', type: 'input', required: true },
      { name: 'section18AReference', label: 'Section 18A Reference', type: 'input', required: true },
      { name: 'physicalAddress', label: 'Physical Address', type: 'textarea' },
      { name: 'postalAddress', label: 'Postal Address', type: 'textarea' },
      { name: 'contactEmail', label: 'Contact Email', type: 'email', required: true },
      { name: 'contactPhone', label: 'Contact Phone', type: 'text' },
    ],
  },
  {
    title: 'Email Defaults',
    description: 'Default email settings for certificate notifications.',
    fields: [
      { name: 'senderDisplayName', label: 'Sender Display Name', type: 'text' },
      { name: 'replyToEmail', label: 'Reply-To Email', type: 'email' },
      { name: 'subjectTemplate', label: 'Subject Template', type: 'text' },
    ],
  },
  {
    title: 'Certificate Defaults',
    description: 'Default text for certificate templates.',
    fields: [
      { name: 'footerText', label: 'Footer Text', type: 'textarea' },
      { name: 'signatureName', label: 'Signature Name', type: 'input', required: true },
      { name: 'signatureTitle', label: 'Signature Title', type: 'input' },
      { name: 'defaultAcknowledgementMessage', label: 'Default Acknowledgement Message', type: 'textarea' },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
const EMPTY_FORM = ALL_FIELDS.reduce((acc, f) => (acc[f.name] = '', acc), {});
const normalizeSettings = (data) => ({ ...EMPTY_FORM, ...(data || {}) });

const firstErrorMessage = (err, fallback) => {
  const fieldMessages = Object.values(err?.errors || {}).filter(Boolean);
  return fieldMessages[0] || err?.message || fallback;
};

const validateField = (name, value) => {
  const trimmed = (value || '').trim();
  if (name === 'organisationName' && !trimmed) return 'Organisation Name is required';
  if (name === 'pboNumber' && !trimmed) return 'PBO Number is required';
  if (name === 'section18AReference' && !trimmed) return 'Section 18A Reference is required';
  if (name === 'contactEmail' && !trimmed) return 'Contact Email is required';
  if (name === 'contactEmail' && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Please enter a valid email address';
  if (name === 'replyToEmail' && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Please enter a valid email address';
  if (name === 'signatureName' && !trimmed) return 'Authorised Signatory (Signature Name) is required';
  return '';
};

export default function CertificateSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [initialFormData, setInitialFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const isMounted = useRef(true);

  const hasWriteAccess = useMemo(() => user?.role === 'admin' || user?.role === 'manager', [user]);
  const isAdmin = useMemo(() => user?.role === 'admin', [user]);
  const settingsExist = settings !== null && settings.id != null;
  const isDirty = useMemo(() => ALL_FIELDS.some((f) => formData[f.name] !== initialFormData[f.name]), [formData, initialFormData]);

  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => { if (isDirty && settingsExist) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, settingsExist]);

  const handleChange = useCallback((name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
  }, [fieldErrors]);

  const handleBlur = useCallback((name) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = validateField(name, formData[name]);
    setFieldErrors((prev) => { const next = { ...prev }; if (err) next[name] = err; else delete next[name]; return next; });
  }, [formData]);

  const validateAll = useCallback(() => {
    const errors = {};
    let hasErrors = false;
    ALL_FIELDS.forEach((f) => {
      const msg = validateField(f.name, formData[f.name]);
      if (msg) { errors[f.name] = msg; hasErrors = true; }
    });
    return { errors, hasErrors };
  }, [formData]);

  const handleCreate = useCallback(async () => {
    if (actionLoading) return;
    const { errors, hasErrors } = validateAll();
    setTouched(ALL_FIELDS.reduce((acc, f) => ({ ...acc, [f.name]: true }), {}));
    setFieldErrors(errors);
    if (hasErrors) { setFeedback({ type: 'error', message: 'Please fix the validation errors before creating.' }); return; }
    setActionLoading('create');
    setFeedback(null);
    try {
      await createSettings(formData);
      const result = normalizeSettings(await getSettings());
      if (!isMounted.current) return;
      setSettings(result);
      setInitialFormData(result);
      setFormData(result);
      setFeedback({ type: 'success', message: 'Certificate settings created successfully.' });
    } catch (err) {
      if (!isMounted.current) return;
      setFeedback({ type: 'error', message: firstErrorMessage(err, 'Failed to create settings.') });
    } finally {
      if (isMounted.current) setActionLoading(null);
    }
  }, [actionLoading, formData, validateAll]);

  const handleUpdate = useCallback(async () => {
    if (actionLoading) return;
    const { errors, hasErrors } = validateAll();
    setTouched(ALL_FIELDS.reduce((acc, f) => ({ ...acc, [f.name]: true }), {}));
    setFieldErrors(errors);
    if (hasErrors) { setFeedback({ type: 'error', message: 'Please fix the validation errors before updating.' }); return; }
    setActionLoading('update');
    setFeedback(null);
    try {
      await updateSettings(formData);
      const result = normalizeSettings(await getSettings());
      if (!isMounted.current) return;
      setSettings(result);
      setInitialFormData(result);
      setFormData(result);
      setFeedback({ type: 'success', message: 'Certificate settings updated successfully.' });
    } catch (err) {
      if (!isMounted.current) return;
      setFeedback({ type: 'error', message: firstErrorMessage(err, 'Failed to update settings.') });
    } finally {
      if (isMounted.current) setActionLoading(null);
    }
  }, [actionLoading, formData, validateAll]);

  const handleDelete = useCallback(async () => {
    setActionLoading('delete');
    setShowDeleteDialog(false);
    setFeedback(null);
    try {
      await deleteSettings();
      if (!isMounted.current) return;
      setSettings(null);
      setFormData({ ...EMPTY_FORM });
      setInitialFormData({ ...EMPTY_FORM });
      setFieldErrors({});
      setTouched({});
      setFeedback({ type: 'success', message: 'Certificate settings deleted successfully.' });
    } catch (err) {
      if (!isMounted.current) return;
      setFeedback({ type: 'error', message: firstErrorMessage(err, 'Failed to delete settings.') });
    } finally {
      if (isMounted.current) setActionLoading(null);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (isDirty) setShowUnsavedChangesDialog(true);
    else {
      setFormData(initialFormData);
      setFieldErrors({});
      setTouched({});
      setFeedback(null);
    }
  }, [isDirty, initialFormData]);

  const handleUnsavedChangesConfirm = useCallback(() => {
    setShowUnsavedChangesDialog(false);
    setFormData(initialFormData);
    setFieldErrors({});
    setTouched({});
    setFeedback(null);
    getSettings().then((data) => {
      if (data) { const normalized = normalizeSettings(data); setSettings(normalized); setFormData(normalized); setInitialFormData(normalized); }
    }).catch(() => { setSettings(null); setFormData({ ...EMPTY_FORM }); setInitialFormData({ ...EMPTY_FORM }); });
  }, [initialFormData]);

  const handleUnsavedChangesCancel = useCallback(() => setShowUnsavedChangesDialog(false), []);

  // ── Initial load ─────────────────────────────────────────────
  // `loading` starts true and is only cleared here, so the form gates
  // on it until the singleton settings row has been read (or its
  // absence confirmed with a clean slate for the Create flow).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getSettings();
        if (!active) return;
        if (data) {
          const normalized = normalizeSettings(data);
          setSettings(normalized);
          setFormData(normalized);
          setInitialFormData(normalized);
        }
      } catch (err) {
        if (active) setFeedback({ type: 'error', message: firstErrorMessage(err, 'Failed to load certificate settings.') });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const busy = actionLoading !== null;
  const submit = () => {
    if (busy) return;
    if (settingsExist) handleUpdate();
    else handleCreate();
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${feedback.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
        >
          {feedback.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Certificate Settings</CardTitle>
          <CardDescription>
            Organisation details, email defaults and certificate wording used for
            Section 18A tax certificates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Loading settings…
            </div>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(e) => { e.preventDefault(); submit(); }}
            >
              {FIELD_GROUPS.map((group) => (
                <section key={group.title} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">{group.title}</h3>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.name} className={field.type === 'textarea' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                        <Label htmlFor={field.name}>
                          {field.label}
                          {field.required && <span aria-hidden="true"> *</span>}
                        </Label>
                        {field.type === 'textarea' ? (
                          <Textarea
                            id={field.name}
                            value={formData[field.name] || ''}
                            onChange={(e) => handleChange(field.name, e.target.value)}
                            onBlur={() => handleBlur(field.name)}
                            disabled={!hasWriteAccess}
                            aria-invalid={Boolean(fieldErrors[field.name])}
                          />
                        ) : (
                          <Input
                            id={field.name}
                            type={field.type === 'email' ? 'email' : 'text'}
                            value={formData[field.name] || ''}
                            onChange={(e) => handleChange(field.name, e.target.value)}
                            onBlur={() => handleBlur(field.name)}
                            disabled={!hasWriteAccess}
                            aria-invalid={Boolean(fieldErrors[field.name])}
                          />
                        )}
                        {touched[field.name] && fieldErrors[field.name] && (
                          <p className="text-xs text-red-600" role="alert">{fieldErrors[field.name]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {hasWriteAccess && (
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
                    Cancel
                  </Button>
                  {settingsExist ? (
                    <>
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={busy}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Delete
                        </Button>
                      )}
                      <Button type="button" onClick={submit} disabled={busy || !isDirty}>
                        {actionLoading === 'update' ? (
                          <>
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Save
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={submit} disabled={busy}>
                      {actionLoading === 'create' ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                          Creating…
                        </>
                      ) : (
                        <>
                          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Create settings
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
              {!hasWriteAccess && (
                <p className="text-xs text-muted-foreground">
                  You have read-only access to certificate settings.
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation (admin only) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete certificate settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored certificate settings. Certificates already
              issued are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              {actionLoading === 'delete' ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes confirmation */}
      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have edits that have not been saved. Discarding restores the
              stored settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleUnsavedChangesCancel}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnsavedChangesConfirm}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
