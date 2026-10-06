export async function registerPlayerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;

  const registration = await navigator.serviceWorker.register(
    "/player-sw-v2.js?v=wolf-compat-11",
    { scope: "/" },
  );
  if (!navigator.serviceWorker.controller) {
    await navigator.serviceWorker.ready;
  }
  return registration;
}
