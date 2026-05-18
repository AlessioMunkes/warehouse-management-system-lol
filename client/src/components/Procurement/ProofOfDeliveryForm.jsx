import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import FormCard from '../Shared/FormCard';
import FormInput from '../Shared/FormInput';
import FormSelect from '../Shared/FormSelect';
import FormButton from '../Shared/FormButton';
import LineItemRow from '../Shared/LineItemRow';
import SignatureCanvas from '../Shared/SignatureCanvas';

const ProofOfDeliveryForm = ({
  onSubmit,
  stockItems = [],
  suppliers = [],
  drivers = [],
  purchaseOrders = [],
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    supplierId: '',
    driverId: '',
    purchaseOrderId: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    programme: 'NOC',
    lineItems: [{ stockItemId: '', quantity: '' }],
    signatureData: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const programmeOptions = [
    { value: 'NOC', label: 'Nourish Our Children' },
    { value: 'FTS', label: 'Feed the Soil' },
    { value: 'LOVE_ACTIVISM', label: 'Love Activism' },
  ];

  const filteredDrivers = formData.supplierId
    ? drivers.filter(driver => driver.supplierId === parseInt(formData.supplierId))
    : [];

  const supplierOptions = suppliers.map(sup => ({ value: sup.id.toString(), label: sup.name }));
  const driverOptions = filteredDrivers.map(drv => ({ value: drv.id.toString(), label: drv.name }));

  const filteredPurchaseOrders = formData.supplierId
    ? purchaseOrders.filter(po => po.supplierId === parseInt(formData.supplierId))
    : [];
  const purchaseOrderOptions = filteredPurchaseOrders.map(po => ({ value: po.id.toString(), label: po.poNumber }));

  const validateForm = () => {
    const newErrors = {};

    if (!formData.supplierId) newErrors.supplierId = 'Please select a supplier';
    if (!formData.driverId) newErrors.driverId = 'Please select a driver';
    if (!formData.purchaseOrderId) newErrors.purchaseOrderId = 'Please select a Purchase Order ID';
    if (!formData.deliveryDate) newErrors.deliveryDate = 'Delivery date is required';
    else if (new Date(formData.deliveryDate) > new Date()) newErrors.deliveryDate = 'Delivery date cannot be in the future';
    if (!formData.programme) newErrors.programme = 'Programme selection is required';
    if (!formData.signatureData) newErrors.signatureData = 'Digital signature is required';

    if (formData.lineItems.length === 0) {
      newErrors.lineItems = 'At least one line item is required';
    } else {
      const lineItemErrors = [];
      formData.lineItems.forEach((item, index) => {
        const itemError = {};
        if (!item.stockItemId) itemError.stockItemId = 'Select an item';
        if (!item.quantity || parseFloat(item.quantity) <= 0) itemError.quantity = 'Quantity must be > 0';
        if (Object.keys(itemError).length > 0) lineItemErrors[index] = itemError;
      });
      if (lineItemErrors.length > 0) newErrors.lineItems = lineItemErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const selectedSupplier = suppliers.find(s => s.id.toString() === formData.supplierId);
      const selectedDriver = drivers.find(d => d.id.toString() === formData.driverId);
      const selectedPO = purchaseOrders.find(po => po.id.toString() === formData.purchaseOrderId);
      const submissionData = {
        ...formData,
        supplierName: selectedSupplier ? selectedSupplier.name : '',
        driverName: selectedDriver ? selectedDriver.name : '',
        purchaseOrderNumber: selectedPO ? selectedPO.poNumber : '',
      };
      await onSubmit(submissionData);
      setIsSubmitting(false);
    } catch (error) {
      setErrors({ general: error.message || 'Failed to submit delivery note' });
      setIsSubmitting(false);
    }
  };

  const addLineItem = () => setFormData({ ...formData, lineItems: [...formData.lineItems, { stockItemId: '', quantity: '' }] });
  const updateLineItem = (index, updatedItem) => {
    const newLineItems = [...formData.lineItems];
    newLineItems[index] = updatedItem;
    setFormData({ ...formData, lineItems: newLineItems });
  };
  const removeLineItem = (index) => {
    if (formData.lineItems.length === 1) return;
    setFormData({ ...formData, lineItems: formData.lineItems.filter((_, i) => i !== index) });
  };

  // Force re-render of driver and PO dropdowns when supplier changes
  const dropdownKey = formData.supplierId || 'no-supplier';

  return (
    <FormCard title="Record New Delivery" width="550px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <FormSelect label="Supplier Company" value={formData.supplierId}
          onChange={(e) => {
            setFormData({
              ...formData,
              supplierId: e.target.value,
              driverId: '',
              purchaseOrderId: ''
            });
          }}
          options={supplierOptions} placeholder="Select supplier..." required error={errors.supplierId} />

        <FormSelect key={`driver-${dropdownKey}`} label="Driver Name" value={formData.driverId}
          onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
          options={driverOptions} placeholder="Select driver..." disabled={!formData.supplierId} required error={errors.driverId} />

        <FormSelect key={`po-${dropdownKey}`} label="Purchase Order ID" value={formData.purchaseOrderId}
          onChange={(e) => setFormData({ ...formData, purchaseOrderId: e.target.value })}
          options={purchaseOrderOptions} placeholder="Select PO..." disabled={!formData.supplierId} required error={errors.purchaseOrderId} />

        <FormInput label="Delivery Date" type="date" value={formData.deliveryDate}
          onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })} required error={errors.deliveryDate} />

        <FormSelect label="Programme" value={formData.programme}
          onChange={(e) => setFormData({ ...formData, programme: e.target.value })}
          options={programmeOptions} required error={errors.programme} />

        {/* Line Items Section */}
        <div style={{ marginTop: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Items Received <span style={{ color: '#ef4444' }}>*</span></label>
            <button type="button" onClick={addLineItem} style={{ padding: '6px 12px', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '8px', color: '#3b82f6', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Add Item
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 32px', gap: '8px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>Stock Item</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', textAlign: 'center' }}>Quantity</span>
            <span></span>
          </div>
          {formData.lineItems.map((item, index) => (
            <LineItemRow key={index} item={item} onChange={(updatedItem) => updateLineItem(index, updatedItem)}
              onRemove={() => removeLineItem(index)} stockItems={stockItems} error={errors.lineItems?.[index]} />
          ))}
          {typeof errors.lineItems === 'string' && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{errors.lineItems}</p>}
        </div>

        <SignatureCanvas onSave={(dataURL) => setFormData({ ...formData, signatureData: dataURL })} onClear={() => setFormData({ ...formData, signatureData: '' })} />
        {errors.signatureData && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>{errors.signatureData}</p>}

        {errors.general && <div style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.2)', borderLeft: '4px solid #ef4444', color: '#fca5a5', fontSize: '14px', fontWeight: 700, borderRadius: '6px', marginBottom: '16px' }}>{errors.general}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
          <FormButton variant="secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</FormButton>
          <FormButton type="submit" variant="primary" isLoading={isSubmitting}>Submit</FormButton>
        </div>
      </form>
    </FormCard>
  );
};

export default ProofOfDeliveryForm;
