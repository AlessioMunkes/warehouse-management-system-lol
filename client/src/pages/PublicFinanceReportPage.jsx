import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import FinanceWarehouseReportView from '../features/finance/FinanceWarehouseReportView';
import { getPublicFinanceReport } from '../services/financeAPI';

export default function PublicFinanceReportPage() {
  const { token } = useParams();
  const loadReport = useCallback(
    (params) => getPublicFinanceReport(token, params),
    [token],
  );

  return <FinanceWarehouseReportView loadReport={loadReport} showReset={false} />;
}
