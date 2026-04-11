import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Loader2, 
  Send,
  User,
  Clock,
  MapPin,
  AlertTriangle,
  Ban,
  Shield,
  FileQuestion,
  HelpCircle,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { formatAddress } from '@/components/address/AddressCard';
import BossBottomNav from '@/components/boss/BossBottomNav';

const CATEGORY_INFO = {
  wrong_address: { label: 'Wrong Address', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  cant_access: { label: "Can't Access", icon: Ban, color: 'bg-orange-100 text-orange-700' },
  safety_concern: { label: 'Safety Concern', icon: Shield, color: 'bg-yellow-100 text-yellow-700' },
  missing_documents: { label: 'Missing Documents', icon: FileQuestion, color: 'bg-purple-100 text-purple-700' },
  other: { label: 'Other', icon: HelpCircle, color: 'bg-gray-100 text-gray-700' }
};

export default function AddressQuestionDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const questionId = urlParams.get('id');

  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: question, isLoading } = useQuery({
    queryKey: ['addressQuestion', questionId],
    queryFn: async () => {
      if (!questionId) return null;
      const questions = await base44.entities.AddressQuestion.filter({ id: questionId });
      return questions[0] || null;
    },
    enabled: !!questionId
  });

  const { data: address } = useQuery({
    queryKey: ['questionAddress', question?.address_id],
    queryFn: async () => {
      if (!question?.address_id) return null;
      const addresses = await base44.entities.Address.filter({ id: question.address_id });
      return addresses[0] || null;
    },
    enabled: !!question?.address_id
  });

  const { data: route } = useQuery({
    queryKey: ['questionRoute', question?.route_id],
    queryFn: async () => {
      if (!question?.route_id) return null;
      const routes = await base44.entities.Route.filter({ id: question.route_id });
      return routes[0] || null;
    },
    enabled: !!question?.route_id
  });

  const { data: asker } = useQuery({
    queryKey: ['questionAsker', question?.asked_by],
    queryFn: async () => {
      if (!question?.asked_by) return null;
      const users = await base44.entities.User.filter({ id: question.asked_by });
      return users[0] || null;
    },
    enabled: !!question?.asked_by
  });

  const handleSendReply = async () => {
    if (!reply.trim() || !question || !user) return;

    setIsSending(true);
    try {
      await base44.entities.AddressQuestion.update(questionId, {
        status: 'answered',
        answered_by: user.id,
        answered_at: new Date().toISOString(),
        answer: reply.trim()
      });

      // Notify the worker
      await base44.entities.Notification.create({
        user_id: question.asked_by,
        company_id: user.company_id,
        recipient_role: 'server',
        type: 'message_received',
        title: 'Question Answered',
        body: `Boss replied to your question about ${address ? formatAddress(address).line1 : 'an address'}`,
        related_id: questionId,
        related_type: 'address_question',
        priority: 'normal'
      });

      toast.success('Reply sent');
      queryClient.invalidateQueries({ queryKey: ['addressQuestions'] });
      queryClient.invalidateQueries({ queryKey: ['addressQuestion', questionId] });
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!question) return;

    try {
      await base44.entities.AddressQuestion.update(questionId, {
        status: 'resolved',
        resolved_at: new Date().toISOString()
      });

      toast.success('Marked as resolved');
      queryClient.invalidateQueries({ queryKey: ['addressQuestions'] });
      navigate(-1);
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <p className="text-center text-gray-500">Question not found</p>
      </div>
    );
  }

  const formatted = address ? formatAddress(address) : { line1: 'Unknown', line2: '' };
  const categoryInfo = CATEGORY_INFO[question.category] || CATEGORY_INFO.other;
  const CategoryIcon = categoryInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Address Question</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* From & Date */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{asker?.full_name || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-4 h-4" />
            {format(new Date(question.asked_at), 'MMM d, yyyy h:mm a')}
          </div>
        </div>

        {/* Address Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{formatted.line1}</p>
                <p className="text-sm text-gray-600">{formatted.line2}</p>
                {route && (
                  <p className="text-xs text-gray-500 mt-1">Route: {route.folder_name}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category */}
        <Badge className={`${categoryInfo.color} text-sm`}>
          <CategoryIcon className="w-4 h-4 mr-1" />
          {categoryInfo.label}
        </Badge>

        {/* Message */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-gray-500 mb-2">MESSAGE:</p>
            <p className="text-gray-900">{question.message}</p>
          </CardContent>
        </Card>

        {/* Photo */}
        {question.photo_url && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-gray-500 mb-2">ATTACHED PHOTO:</p>
              <img 
                src={question.photo_url} 
                alt="Attached" 
                className="rounded-lg max-w-full"
              />
            </CardContent>
          </Card>
        )}

        {/* Reply Section */}
        {question.status === 'pending' ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-gray-500 mb-2">REPLY:</p>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your response..."
                rows={4}
              />
              <Button
                className="w-full mt-3 bg-blue-500 hover:bg-blue-600"
                onClick={handleSendReply}
                disabled={!reply.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Reply
              </Button>
            </CardContent>
          </Card>
        ) : question.answer ? (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">ANSWERED</p>
              </div>
              <p className="text-gray-900">{question.answer}</p>
              <p className="text-xs text-gray-500 mt-2">
                {question.answered_at && format(new Date(question.answered_at), 'MMM d, h:mm a')}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Mark Resolved */}
        {question.status !== 'resolved' && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleMarkResolved}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Mark as Resolved
          </Button>
        )}
      </div>

      <BossBottomNav currentPage="" />
    </div>
  );
}