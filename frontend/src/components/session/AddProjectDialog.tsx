import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Home, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DirectoryTree } from './DirectoryTree';
import { formatProjectPath, normalizeProjectPath } from '@/lib/path';

interface AddProjectDialogProps {
  open: boolean;
  homeDirectory: string;
  onOpenChange: (open: boolean) => void;
  onAddProject: (path: string) => boolean;
}

export function AddProjectDialog({ open, homeDirectory, onOpenChange, onAddProject }: AddProjectDialogProps) {
  const [selectedPath, setSelectedPath] = useState(homeDirectory);
  const [inputValue, setInputValue] = useState('~');
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const homeLabel = useMemo(() => formatProjectPath(homeDirectory, homeDirectory), [homeDirectory]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPath(homeDirectory);
    setInputValue('~');
    setError('');
    setShowHidden(false);
  }, [homeDirectory, open]);

  const handleSelectPath = (path: string) => {
    setSelectedPath(path);
    setInputValue(formatProjectPath(path, homeDirectory));
    setError('');
  };

  const handleConfirm = () => {
    const normalized = normalizeProjectPath(inputValue || selectedPath, homeDirectory);
    if (!normalized) {
      setError('Use a path that starts from ~.');
      return;
    }

    const added = onAddProject(normalized);
    if (!added) {
      setError('Project already exists or the path is invalid.');
      return;
    }

    setSelectedPath(homeDirectory);
    setInputValue('~');
    setError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-[min(560px,100vw)] flex-col gap-0 overflow-hidden p-0 sm:p-6">
        <DialogHeader className="flex-shrink-0 px-4 pb-2 pt-[calc(var(--oc-safe-area-top,0px)+0.5rem)] sm:px-0 sm:pb-3 sm:pt-0">
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus size={16} />
            Add project directory
          </DialogTitle>
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
            <DialogDescription className="flex-1">
              Choose a folder to add as a project.
            </DialogDescription>
            <button
              type="button"
              onClick={() => setShowHidden((value) => !value)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 typography-meta text-muted-foreground transition-colors hover:bg-interactive-hover/40"
            >
              {showHidden ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4" />}
              Show hidden
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 px-4 pb-4 sm:px-0">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Home size={14} />
            </span>
            <Input
              value={inputValue}
              onChange={(event) => {
                const next = event.target.value;
                setInputValue(next);
                setError('');
                const normalized = normalizeProjectPath(next, homeDirectory);
                if (normalized) {
                  setSelectedPath(normalized);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="~/openchamber"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="font-mono pl-9"
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="rounded-xl border border-border/40 bg-sidebar/70 overflow-hidden flex-1 min-h-0">
            <div className="px-3 py-2 border-b border-border/40 text-xs text-muted-foreground flex items-center justify-between">
              <span>Root: {homeLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedPath(homeDirectory);
                  setInputValue('~');
                  setError('');
                }}
                className="rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-surface-3"
              >
                Reset
              </button>
            </div>
            <div className="max-h-[calc(80vh-260px)] overflow-auto p-2">
              <DirectoryTree
                homeDirectory={homeDirectory}
                currentPath={selectedPath}
                onSelectPath={handleSelectPath}
                onDoubleClickPath={(path) => {
                  handleSelectPath(path);
                  const normalized = normalizeProjectPath(path, homeDirectory);
                  if (normalized) {
                    const added = onAddProject(normalized);
                    if (added) {
                      onOpenChange(false);
                    }
                  }
                }}
                showHidden={showHidden}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Projects must start from <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px]">~</code>. Use the tree or type a path directly.
          </p>
        </div>

        <DialogFooter className="sticky bottom-0 flex w-full flex-shrink-0 flex-row gap-2 border-t border-border/40 bg-sidebar px-4 py-3 sm:static sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-4 sm:pb-0">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedPath(homeDirectory);
              setInputValue('~');
              setError('');
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddProjectDialog;
