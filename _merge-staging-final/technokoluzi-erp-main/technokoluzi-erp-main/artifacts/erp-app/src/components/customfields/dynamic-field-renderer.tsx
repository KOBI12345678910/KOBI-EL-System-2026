import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function DynamicFieldRenderer({ field, value, onChange, error }) {
  const baseProps = {
    disabled: false,
    className: error ? 'border-red-500' : ''
  };

  const renderField = () => {
    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return (
          <Input
            {...baseProps}
            type={field.field_type}
            placeholder={field.description}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            {...baseProps}
            placeholder={field.description}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        );

      case 'number':
        return (
          <Input
            {...baseProps}
            type="number"
            placeholder={field.description}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            min={field.options?.min_value}
            max={field.options?.max_value}
          />
        );

      case 'currency':
        return (
          <div className="flex gap-2">
            <span className="inline-flex items-center px-3 bg-slate-100 text-slate-700 rounded-l border border-slate-300">
              {field.options?.currency_code || 'ILS'}
            </span>
            <Input
              {...baseProps}
              type="number"
              placeholder={field.description}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              step={0.01}
              className="rounded-l-none"
            />
          </div>
        );

      case 'date':
        return (
          <Input
            {...baseProps}
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'datetime':
        return (
          <Input
            {...baseProps}
            type="datetime-local"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'select':
        return (
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger {...baseProps}>
              <SelectValue placeholder={field.description} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.choices?.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {field.options?.choices?.map((choice) => (
              <label key={choice.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value || []).includes(choice.value)}
                  onChange={(e) => {
                    const newValue = e.target.checked
                      ? [...(value || []), choice.value]
                      : (value || []).filter(v => v !== choice.value);
                    onChange(newValue);
                  }}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-700">{choice.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-700">{field.label}</span>
          </label>
        );

      case 'rating':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((rate) => (
              <button
                key={rate}
                onClick={() => onChange(rate)}
                className={`w-10 h-10 rounded-full font-bold text-sm transition-all ${
                  value === rate
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-amber-200'
                }`}
              >
                {rate}⭐
              </button>
            ))}
          </div>
        );

      default:
        return <Input {...baseProps} placeholder={field.description} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-900">
        {field.label}
        {field.required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {renderField()}
      {field.description && !['checkbox', 'rating'].includes(field.field_type) && (
        <p className="text-xs text-slate-500">{field.description}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}