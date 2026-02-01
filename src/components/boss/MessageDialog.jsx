import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function MessageDialog({ open, onOpenChange, recipient, sender, companyId }) {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Create message
      const message = await base44.entities.Message.create({
        company_id: companyId,
        sender_id: sender.id,
        recipient_id: recipient.id,
        content: content.trim()
      });

      // Create notification for recipient
      await base44.entities.Notification.create({
        user_id: recipient.id,
        company_id: companyId,
        recipient_role: recipient.role === 'boss' ? 'boss' : 'server',
        type: 'message_received',
        title: `Message from ${sender.full_name}`,
        body: content.trim().substring(0, 100) + (content.length > 100 ? '...' : ''),
        data: { message_id: message.id, sender_id: sender.id },
        priority: 'normal'
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'message_sent',
        actor_id: sender.id,
        actor_role: sender.role || 'boss',
        target_type: 'message',
        target_id: message.id,
        details: { recipient_id: recipient.id },
        timestamp: new Date().toISOString()
      });

      return message;
    },
    onSuccess: () => {
      toast.success('Message sent');
      setContent('');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send message');
    }
  });

  const handleSend = () => {
    if (!content.trim()) return;
    sendMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message {recipient?.full_name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={!content.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}