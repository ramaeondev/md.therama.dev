import { useQuery } from "@tanstack/react-query";

import { getSocialLinks, siteFooterQueryKeys, type SocialLink } from "./staticApi";

/**
 * Social links from the shared static.social_links API. Best-effort: the footer
 * omits the buttons if the request fails, so a backend hiccup never breaks a page.
 */
export function useSocialLinks() {
  const query = useQuery<SocialLink[]>({
    queryKey: siteFooterQueryKeys.socialLinks,
    queryFn: getSocialLinks,
    staleTime: 10 * 60_000,
    retry: false,
    throwOnError: false,
  });

  return { links: query.data ?? [] };
}
