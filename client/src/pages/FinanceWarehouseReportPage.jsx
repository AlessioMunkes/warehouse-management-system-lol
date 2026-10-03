import { useCallback } from 'react';
import FinanceWarehouseReportView from '../features/finance/FinanceWarehouseReportView';
import { getFinanceReport } from '../services/financeAPI';

export default function FinanceWarehouseReportPage() {
  const loadReport = useCallback((params) => getFinanceReport(params), []);

  return <FinanceWarehouseReportView loadReport={loadReport} />;
}
