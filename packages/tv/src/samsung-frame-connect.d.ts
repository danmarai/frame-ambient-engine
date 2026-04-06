declare module "samsung-frame-connect" {
  export class SamsungFrameClient {
    constructor(options: { host: string; name?: string; verbosity?: number });
    connect(): Promise<void>;
    close(): Promise<void>;
    upload(
      data: Buffer,
      options: { fileType?: string; matteType?: string; matteColor?: string },
    ): Promise<string>;
    setCurrentArt(options: { id: string; category?: string }): Promise<void>;
    inArtMode(): Promise<boolean>;
  }
}
