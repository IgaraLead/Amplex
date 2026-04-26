import ToastContainer from '@/shared/ui/Toast';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastContainer />
      <AppRoutes />
    </ErrorBoundary>
  );
}
