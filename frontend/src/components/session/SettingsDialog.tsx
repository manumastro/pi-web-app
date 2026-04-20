import { useState } from 'react';
import { CheckSquare, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useUIStore } from '@/stores/uiStore';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
  const setShowReasoningTraces = useUIStore((state) => state.setShowReasoningTraces);
  const [localValue, setLocalValue] = useState(showReasoningTraces);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setLocalValue(showReasoningTraces);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal size={16} />
            Settings
          </DialogTitle>
          <DialogDescription>
            Adjust how the chat renderer displays reasoning traces.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-3">
            <Checkbox checked={localValue} onCheckedChange={(value) => setLocalValue(Boolean(value))} aria-label="Show reasoning traces" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">Show reasoning traces</div>
              <div className="text-xs text-muted-foreground">Default on. Hide the collapsed thinking blocks and traces.</div>
            </div>
            <CheckSquare size={16} className="ml-auto text-muted-foreground opacity-60 group-hover:opacity-100" />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setLocalValue(showReasoningTraces);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setShowReasoningTraces(localValue);
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
