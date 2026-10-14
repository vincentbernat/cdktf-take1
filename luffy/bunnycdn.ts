import { Construct } from "constructs";
import { BunnynetProvider } from "../.gen/providers/bunnynet/provider";
import { Pullzone } from "../.gen/providers/bunnynet/pullzone";
import { PullzoneHostname } from "../.gen/providers/bunnynet/pullzone-hostname";

/* Pull zone for media files. */
class MediaPullzone extends Construct {
  constructor(
    protected scope: Construct,
    protected domain: string,
    protected provider: BunnynetProvider
  ) {
    super(scope, domain);
    const pullzone = new Pullzone(this, domain, {
      provider,
      name: domain.replace(/\./g, "-"),
      origin: {
        type: "OriginUrl",
        url: `https://${domain}`,
        verifySsl: true,
      },
      routing: { tier: "Standard" },
      cacheVary: ["avif", "webp"],
      cacheStale: ["offline"],
      safehopEnabled: true,
      safehopRetryCount: 1,
      safehopRetryDelay: 0,
      safehopRetryReasons: ["connectionTimeout", "responseTimeout"],
      safehopConnectionTimeout: 3,
      safehopResponseTimeout: 5,
      logEnabled: false,
      websocketsEnabled: false,
      corsEnabled: false,
      optimizerEnabled: false,
      tlsLevel: "ModernOnly",
      tlsSupport: [],
    });
    // Existing b-cdn.net hostname
    new PullzoneHostname(this, "hostname", {
      provider,
      pullzone: pullzone.id,
      name: `${pullzone.name}.${pullzone.cdnDomain}`,
      tlsEnabled: true,
      forceSsl: true,
    });
  }
}

export class Resources extends Construct {
  constructor(
    protected scope: Construct,
    protected provider: BunnynetProvider
  ) {
    super(scope, "luffy-bunnycdn");
    new MediaPullzone(this, "media.bernat.ch", provider);
    new MediaPullzone(this, "media.une-oasis-une-ecole.fr", provider);
  }
}
