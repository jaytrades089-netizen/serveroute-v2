import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  UserX, 
  Home, 
  Ban, 
  CheckCircle, 
  HelpCircle,
  Loader2 
} from 'lucide-react';

const outcomes = [
  {
    value: 'no_answer',
    label: 'No Answer',
    description: 'Knocked/rang, no response',
    icon: UserX,
    color: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300'
  },
  {
    value: 'not_home',
    label: 'Not Home',
    description: 'Confirmed not present',
    icon: Home,
    color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300'
  },
  {
    value: 'refused',
    label: 'Refused',
    description: 'Person refused service',
    icon: Ban,
    color: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300'
  },
  {
    value: 'served',
    label: 'Served',
    description: 'Documents delivered successfully',
    icon: CheckCircle,
    color: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-300'
  },
  {
    value: 'other',
    label: 'Other',
    description: 'See notes for details',
    icon: HelpCircle,
    color: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300'
  }
];

export default function OutcomeSelectorModal({ 
  open, 
  onClose, 
  onSelect, 
  loading = false,
  attemptNumber = 1
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-center">
            Log Attempt {attemptNumber} Outcome
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 text-center mb-4">
          What happened at this address?
        </p>

        <div className="space-y-2">
          {outcomes.map((outcome) => {
            const Icon = outcome.icon;
            return (
              <Button
                key={outcome.value}
                variant="outline"
                onClick={() => onSelect(outcome.value)}
                disabled={loading}
                className={`w-full h-auto py-3 px-4 justify-start border-2 ${outcome.color}`}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-bold text-sm">{outcome.label}</p>
                    <p className="text-xs opacity-75">{outcome.description}</p>
                  </div>
                  {loading && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>

        <Button 
          variant="ghost" 
          onClick={onClose}
          disabled={loading}
          className="w-full mt-2"
        >
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}