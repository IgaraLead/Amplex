import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-12 text-center">
          <div className="card bg-base-300 max-w-lg mx-auto">
            <div className="card-body">
              <h2 className="text-xl font-bold text-error mb-4">Algo deu errado</h2>
              <p className="text-sm text-base-content/50 mb-6">
                {this.state.error?.message || 'Erro inesperado'}
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
