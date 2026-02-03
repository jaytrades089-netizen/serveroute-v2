import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, WifiOff, Lock, FileQuestion, RefreshCw } from 'lucide-react';

const ERROR_MESSAGES = {
  network_error: {
    icon: WifiOff,
    title: 'Connection Error',
    message: 'Unable to connect. Check your internet.',
    action: 'Retry'
  },
  permission_denied: {
    icon: Lock,
    title: 'Access Denied',
    message: "You don't have permission to view this.",
    action: null
  },
  not_found: {
    icon: FileQuestion,
    title: 'Not Found',
    message: "This item doesn't exist or was deleted.",
    action: 'Go Back'
  },
  upload_failed: {
    icon: AlertCircle,
    title: 'Upload Failed',
    message: 'Could not upload file. Try again.',
    action: 'Retry'
  },
  unknown: {
    icon: AlertCircle,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    action: 'Retry'
  }
};

export function getErrorMessage(error) {
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code].message;
  }
  if (error?.message) {
    return error.message;
  }
  return ERROR_MESSAGES.unknown.message;
}

export function getErrorType(error) {
  if (!navigator.onLine) return 'network_error';
  if (error?.status === 403) return 'permission_denied';
  if (error?.status === 404) return 'not_found';
  if (error?.code) return error.code;
  return 'unknown';
}

export default function ErrorState({ 
  error, 
  type: forcedType,
  onRetry, 
  onGoBack,
  className = '' 
}) {
  const errorType = forcedType || getErrorType(error);
  const config = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.unknown;
  const Icon = config.icon;

  const handleAction = () => {
    if (config.action === 'Retry' && onRetry) {
      onRetry();
    } else if (config.action === 'Go Back' && onGoBack) {
      onGoBack();
    } else if (onRetry) {
      onRetry();
    }
  };

  return (
    <div className={`text-center py-12 px-4 ${className}`}>
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{config.title}</h3>
      <p className="text-gray-600 mb-4 max-w-sm mx-auto">
        {error?.message || config.message}
      </p>
      {config.action && (onRetry || onGoBack) && (
        <Button onClick={handleAction} variant="outline" className="gap-2">
          {config.action === 'Retry' && <RefreshCw className="w-4 h-4" />}
          {config.action}
        </Button>
      )}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      {onDismiss && (
        <button 
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 text-sm font-medium"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}