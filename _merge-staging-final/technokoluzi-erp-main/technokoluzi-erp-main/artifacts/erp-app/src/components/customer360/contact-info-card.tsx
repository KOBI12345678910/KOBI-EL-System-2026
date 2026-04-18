import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Globe, Building2, Briefcase, Edit2, Share2 } from 'lucide-react';

export default function ContactInfoCard({ customer }) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-3xl mb-2">{customer.name}</CardTitle>
            <Badge className="bg-white/20 text-white">{customer.type}</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="icon" className="bg-white/20 hover:bg-white/30">
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button size="icon" className="bg-white/20 hover:bg-white/30">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="text-sm font-medium text-slate-900">{customer.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Phone</p>
              <p className="text-sm font-medium text-slate-900">{customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Location</p>
              <p className="text-sm font-medium text-slate-900">{customer.city}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Company</p>
              <p className="text-sm font-medium text-slate-900">{customer.company}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Status</p>
              <Badge className={customer.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                {customer.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Last Contact</p>
              <p className="text-sm font-medium text-slate-900">{customer.last_contact}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}