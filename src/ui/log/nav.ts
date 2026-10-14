// The VIEWFINDER key on the history screen. Plain navigation: it pops back to the finder when the
// finder is already in the stack, or goes there. It never calls the interstitial cadence
// (`onBackToViewfinder` is for the explicit return from a result), so it is not a break.
export function openViewfinder(router: { dismissTo: (href: '/viewfinder') => void }): void {
  router.dismissTo('/viewfinder');
}
