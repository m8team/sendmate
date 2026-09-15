/** Below this width the list is the page and the detail opens as a full-screen sheet. */
export const MOBILE_QUERY = '(max-width: 720px)';

export const isMobile = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
