import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export { cn } from "@/lib/utils";

export { Button } from "@/components/ui/button";
export type { ButtonProps } from "@/components/ui/button";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Card } from "@/components/ui/card";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const MODAL_SIZES: Record<string, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

export function Modal({ isOpen, onClose, title, description, children, size = "lg" }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`${MODAL_SIZES[size]} bg-card border border-border rounded-2xl`}>
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="text-xl font-bold text-foreground">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground mt-1">{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
