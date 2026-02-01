import React from 'react';
import { usePolling } from './PollingProvider';
import { RefreshCw, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function AutoRefreshIndicator() {
  const { isActive, isPaused, lastUpdate, refresh, togglePause } = usePolling();
  
  const formatTime = (date) => {
    if (!date) return '--:--:--';
    return format(date, 'h:mm:ss a');
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center gap-1 text-gray-500">
        <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="hidden sm:inline">
          {isPaused ? 'Paused' : isActive ? 'Live' : 'Background'}
        </span>
      </div>
      
      <span className="text-gray-400 hidden sm:inline">|</span>
      
      <span className="text-gray-500 hidden sm:inline">
        Updated: {formatTime(lastUpdate)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={togglePause}
        className="h-7 px-2"
      >
        {isPaused ? (
          <Play className="w-3 h-3" />
        ) : (
          <Pause className="w-3 h-3" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={refresh}
        className="h-7 px-2"
      >
        <RefreshCw className="w-3 h-3" />
      </Button>
    </div>
  );
}