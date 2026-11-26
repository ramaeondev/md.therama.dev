import { Github } from "lucide-react";

import { BrandIcon } from "./BrandIcon";
import { SOCIAL_BRANDS } from "./brands";
import { REPOSITORY } from "@/features/open-source/repository";
import { PROFILE, type SocialLink } from "./staticApi";
import { useSocialLinks } from "./useSocialLinks";

/**
 * Social buttons from the shared static.social_links API, rendered with the
 * same brand marks and button shape as apps.therama.dev.
 */
function SocialLinks({ links }: { links: SocialLink[] }) {
  const known = links.filter((link) => SOCIAL_BRANDS[link.platform?.toLowerCase()]);
  if (!known.length) return null;

  return (
    <ul className="flex items-center gap-2">
      {known.map((link) => {
        const brand = SOCIAL_BRANDS[link.platform.toLowerCase()];
        if (!brand) return null;
        return (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={link.label}
              title={link.label}
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandIcon brand={brand} size={17} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Site footer, copied from apps.therama.dev: the project name, a
 * "Built and maintained by" credit, the repository link, and social buttons
 * loaded from the shared static.social_links API.
 */
export function SiteFooter() {
  const { links } = useSocialLinks();

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <div>
          <p className="text-sm font-semibold text-foreground">{PROFILE.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Built and maintained by{" "}
            <a href={PROFILE.website} className="text-primary hover:underline">
              {PROFILE.owner}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={REPOSITORY.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Github className="size-4" aria-hidden="true" />
            Open source on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {links.length > 0 ? <SocialLinks links={links} /> : null}
        </div>
      </div>
    </footer>
  );
}
