import { Construct } from "constructs";
import { BunnynetProvider } from "../.gen/providers/bunnynet/provider";
import { Pullzone } from "../.gen/providers/bunnynet/pullzone";

/* Pull zone for media files. */
class MediaPullzone extends Construct {
  constructor(
    protected scope: Construct,
    protected domain: string,
    protected provider: BunnynetProvider
  ) {
    super(scope, domain);
    new Pullzone(this, domain, {
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
      logEnabled: false,
      websocketsEnabled: false,
      corsEnabled: false,
      optimizerEnabled: false,
      tlsLevel: "ModernOnly",
      tlsSupport: [],
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
