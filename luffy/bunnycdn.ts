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
      },
      routing: { tier: "Standard" },
      cacheVary: ["avif", "webp"],
      logEnabled: false,
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
