import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2 } from 'lucide-react';

export default function EvidenceCommentModal({ 
  open, 
  onClose, 
  onSave, 
  photoPreview,
  saving = false 
}) {
  const [comment, setComment] = useState('');

  const handleSave = () => {
    onSave(comment);
    setComment('');
  };

  const handleClose = () => {
    setComment('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-500" />
            Add Description
          </DialogTitle>
        </DialogHeader>

        {/* Photo Preview */}
        {photoPreview && (
          <div className="rounded-lg overflow-hidden border mb-4">
            <img 
              src={photoPreview} 
              alt="Evidence" 
              className="w-full h-40 object-cover"
            />
          </div>
        )}

        <p className="text-sm text-gray-500 mb-2">
          Describe what you observed (vehicles, occupants, house details, license plates, etc.)
        </p>
        
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="No answer at door. Blue Honda Civic in driveway, plate ABC-1234. House appears occupied, lights on inside."
          className="h-32 resize-none"
          autoFocus
        />

        <div className="flex gap-3 mt-4">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 bg-green-500 hover:bg-green-600"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Evidence'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}