export type WolfPlayerToParentMessage = {
  type: "wolf-assets-request";
  gameId: string;
  requestId: string;
};

export type WolfParentToPlayerMessage = {
  type: "wolf-assets-response";
  requestId: string;
  assets?: Array<{ path: string; url: string; size: number }>;
  error?: string;
};
