import { Star, StarOff, Phone, Mail } from "lucide-react";

type SupplierCardProps = {
  name: string;
  phone?: string;
  email?: string;
  rating?: number;
};

export default function SupplierCard({ name, phone, email, rating = 0 }: SupplierCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="font-bold text-foreground">{name}</div>
      {phone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="w-3.5 h-3.5" />
          <span>{phone}</span>
        </div>
      )}
      {email && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-3.5 h-3.5" />
          <span>{email}</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) =>
          i < Math.round(rating)
            ? <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
            : <StarOff key={i} className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
