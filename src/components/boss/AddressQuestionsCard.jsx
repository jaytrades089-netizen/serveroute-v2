import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { formatAddress } from '@/components/address/AddressCard';

export default function AddressQuestionsCard({ companyId }) {
  const { data: questions = [] } = useQuery({
    queryKey: ['addressQuestions', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.AddressQuestion.filter({
        company_id: companyId,
        status: 'pending'
      }, '-asked_at', 10);
    },
    enabled: !!companyId
  });

  const { data: users = [] } = useQuery({
    queryKey: ['companyUsers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.User.filter({ company_id: companyId });
    },
    enabled: !!companyId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['questionAddresses', questions.map(q => q.address_id)],
    queryFn: async () => {
      if (questions.length === 0) return [];
      const addrs = await Promise.all(
        questions.map(q => base44.entities.Address.filter({ id: q.address_id }))
      );
      return addrs.flat();
    },
    enabled: questions.length > 0
  });

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.full_name || 'Unknown';
  };

  const getAddress = (addressId) => {
    return addresses.find(a => a.id === addressId);
  };

  if (questions.length === 0) return null;

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Address Questions ({questions.length})
          </CardTitle>
          <Link to={createPageUrl('BossDashboard')}>
            <Button variant="ghost" size="sm" className="text-orange-600">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {questions.slice(0, 3).map((q) => {
          const addr = getAddress(q.address_id);
          const formatted = addr ? formatAddress(addr) : { line1: 'Unknown', line2: '' };

          return (
            <Link
              key={q.id}
              to={createPageUrl(`AddressQuestionDetail?id=${q.id}`)}
              className="block bg-white rounded-lg p-3 border border-orange-200 hover:border-orange-300 transition-colors"
            >
              <div className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {getUserName(q.asked_by)} asked about
                  </p>
                  <p className="text-sm font-bold truncate">{formatted.line1}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(q.asked_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}