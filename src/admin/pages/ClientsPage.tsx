import { useEffect, useState } from 'react';
import { Users, Mail, Phone, Calendar, Building2, FileText, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageHeader, EmptyState, Spinner } from '../components/ui';

interface Client {
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  company: string | null;
  bookingCount: number;
  quoteCount: number;
  lastBooking: string;
}

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('contact_name, contact_phone, contact_email, created_at, details, services(slug)')
        .order('created_at', { ascending: false });

      const clientMap = new Map<string, Client>();
      (data || []).forEach((b: any) => {
        const key = `${b.contact_name}::${b.contact_phone}`;
        const company = b.details?.company_name || b.details?.company || null;
        const isQuote = b.details?.quote_request === true;
        const existing = clientMap.get(key);
        if (existing) {
          existing.bookingCount += 1;
          if (isQuote) existing.quoteCount += 1;
          if (!existing.company && company) existing.company = company;
        } else {
          clientMap.set(key, {
            contact_name: b.contact_name,
            contact_phone: b.contact_phone,
            contact_email: b.contact_email,
            company,
            bookingCount: 1,
            quoteCount: isQuote ? 1 : 0,
            lastBooking: b.created_at,
          });
        }
      });
      setClients(Array.from(clientMap.values()));
      setLoading(false);
    };
    fetchClients();
  }, []);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Clients"
        description={`${clients.length} registered clients`}
        icon={Users}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Clients will appear here when bookings are made."
        />
      ) : (
        <div className="grid gap-3">
          {clients.map((client) => (
            <div key={`${client.contact_name}-${client.contact_phone}`} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-slate-700 font-semibold">
                      {client.contact_name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{client.contact_name}</h3>
                    {client.company && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {client.company}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {client.contact_phone}
                      </span>
                      {client.contact_email && (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          {client.contact_email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-50 rounded-full text-xs font-medium text-slate-600">
                    <Briefcase className="w-3 h-3" />
                    {client.bookingCount - client.quoteCount} hire
                  </span>
                  {client.quoteCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-full text-xs font-medium text-blue-700">
                      <FileText className="w-3 h-3" />
                      {client.quoteCount} quote{client.quoteCount > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 ml-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(client.lastBooking).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
