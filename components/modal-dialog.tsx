'use client';

import type { ComponentPropsWithRef } from 'react';
import { dismissDialogOnBackdrop } from '@/lib/dialog';

type ModalDialogProps = Omit<ComponentPropsWithRef<'dialog'>, 'closedby' | 'onClick' | 'open'> & {
  dismissOnBackdrop?: boolean;
};

export default function ModalDialog({ dismissOnBackdrop = false, ...props }: ModalDialogProps) {
  return (
    <dialog
      {...props}
      closedby={dismissOnBackdrop ? 'any' : undefined}
      onClick={dismissOnBackdrop ? dismissDialogOnBackdrop : undefined}
    />
  );
}
