const PLAYER_SERVICE_WORKER_VERSION = "player-sw-2";

export async function registerPlayerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;

  const registration = await navigator.serviceWorker.register(
    `/player-sw.js?v=${PLAYER_SERVICE_WORKER_VERSION}`,
    { scope: "/" },
  );
  if (!navigator.serviceWorker.controller) {
    await navigator.serviceWorker.ready;
  }
  return registration;
}
