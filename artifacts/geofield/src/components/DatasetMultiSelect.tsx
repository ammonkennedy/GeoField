import { ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import { datasetSelected, datasetSelectionLabel, toggleDataset, type DatasetOption, type DatasetSelection } from '@/lib/dataset-selection';
import type { DatasetIdentity } from '@/lib/dataset-identity';

export function DatasetMultiSelect({ id, options, value, onChange, identities = [] }: {
  id?: string;
  options: DatasetOption[];
  value: DatasetSelection;
  onChange: (selection: DatasetSelection) => void;
  identities?: DatasetIdentity[];
}) {
  const count = options.filter(option => datasetSelected(value, option.id, identities)).length;
  const all = value === 'all' || (options.length > 0 && count === options.length);
  const label = datasetSelectionLabel(value, options, identities);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button id={id} variant="outline" aria-label={`Datasets: ${label}`} className="min-h-10 min-w-0 w-full sm:w-auto max-w-full justify-between gap-2">
          <span className="min-w-0 max-w-80 truncate">{value === 'all' || count <= 1 ? label : `${count} selected`}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onEscapeKeyDown={event => event.stopPropagation()} align="start" className="z-[210] max-h-64 w-72 max-w-[calc(100vw-2rem)] bg-card text-card-foreground" aria-label="Datasets">
        <DropdownMenuCheckboxItem checked={all ? true : count > 0 ? 'indeterminate' : false} onCheckedChange={() => onChange(all ? [] : 'all')} onSelect={event => event.preventDefault()} className="min-h-11 font-medium [&>span]:rounded-sm [&>span]:border [&>span]:border-input">
          Select all
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map(option => (
          <DropdownMenuCheckboxItem key={option.id} checked={datasetSelected(value, option.id, identities)} onCheckedChange={() => onChange(toggleDataset(value, option.id, options, identities))} onSelect={event => event.preventDefault()} className="min-h-11 gap-2 [&>span:first-child]:rounded-sm [&>span:first-child]:border [&>span:first-child]:border-input">
            <span className="min-w-0 break-words">{option.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
