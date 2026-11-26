import { Github, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPOSITORY } from "./repository";

/**
 * Small "Open source · MIT" badge that links to the repository. Used in page
 * headers and hero sections where a compact, non-competing link is enough.
 */
export function OpenSourceBadge({
  className,
  label = "Open source",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={REPOSITORY.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Github className="size-3.5" aria-hidden="true" />
      {label}
      <span className="text-primary/50" aria-hidden="true">
        ·
      </span>
      <span className="inline-flex items-center gap-1">
        <Scale className="size-3" aria-hidden="true" />
        {REPOSITORY.license}
      </span>
      <span className="sr-only"> on GitHub (opens in a new tab)</span>
    </a>
  );
}

/** Primary repository call to action: "Star on GitHub". */
export function StarOnGitHubButton({
  size = "lg",
  variant = "outline",
  className,
}: {
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  return (
    <Button asChild size={size} variant={variant} className={className}>
      <a href={REPOSITORY.url} target="_blank" rel="noopener noreferrer">
        <Github aria-hidden="true" />
        Star on GitHub
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}
