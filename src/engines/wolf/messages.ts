export type WolfAsset = {
  path: string;
  url: string;
  size: number;
  preload?: boolean;
};

export type WolfPlayerToParentMessage = {
  type: "wolf-assets-request";
  gameId: string;
  requestId: string;
};

export type WolfParentToPlayerMessage = {
  type: "wolf-assets-response";
  requestId: string;
  assets?: WolfAsset[];
  error?: string;
};
