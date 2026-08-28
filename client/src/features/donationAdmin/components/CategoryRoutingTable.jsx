// This table shows all four donation category rules in one place.
// Each row is clickable so the admin can open the inline editor for that category and
// change the routing outcome, storage area, or description without leaving the page.
import { PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const formatCategoryLabel = (category = '') =>
  category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CategoryRoutingTable({ rules, onEdit }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#e9e3dd] bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Routing outcome</TableHead>
            <TableHead>Storage area</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[72px] text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rules.map((rule) => (
            <TableRow
              key={rule.category}
              className="cursor-pointer align-top hover:bg-[#f7f3ef]"
              onClick={() => onEdit(rule)}
            >
              <TableCell className="font-medium text-[#2b3336]">
                {formatCategoryLabel(rule.category)}
              </TableCell>

              <TableCell className="max-w-[280px] text-[#2b3336]">
                {rule.routing_outcome || '—'}
              </TableCell>

              <TableCell className="text-[#2b3336]">
                {rule.storage_area || '—'}
              </TableCell>

              <TableCell className="max-w-[360px] text-[#2b3336]">
                {rule.description || '—'}
              </TableCell>

              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${formatCategoryLabel(rule.category)}`}
                  className="text-[#2b3336] hover:bg-[#f2eee9]"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(rule);
                  }}
                >
                  <PencilLine className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
