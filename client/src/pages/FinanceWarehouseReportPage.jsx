import { useCallback } from 'react';
import ManagerLayout from '../components/layout/ManagerLayout';
import FinanceWarehouseReportView from '../features/finance/FinanceWarehouseReportView';
import { getFinanceReport } from '../services/financeAPI';

export default function FinanceWarehouseReportPage() {
  const loadReport = useCallback((params) => getFinanceReport(params), []);

  return (
    <ManagerLayout>
      <FinanceWarehouseReportView loadReport={loadReport} />
    </ManagerLayout>
  );
}
