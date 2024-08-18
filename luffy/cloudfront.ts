import { Construct } from "constructs";
import { AwsProvider } from "../.gen/providers/aws/provider";
import { CloudfrontDistribution } from "../.gen/providers/aws/cloudfront-distribution";
import { CloudfrontCachePolicy } from "../.gen/providers/aws/cloudfront-cache-policy";

/* Cookie-less cloudfront distribution. */
class MediaCloudfrontDistribution extends Construct {
  constructor(
    protected scope: Construct,
    protected domain: string,
    protected cachePolicy: CloudfrontCachePolicy,
    protected provider: AwsProvider
  ) {
    super(scope, domain);
    const originId = "MyOrigin";
    new CloudfrontDistribution(this, domain, {
      provider,
      enabled: true,
      isIpv6Enabled: true,
      httpVersion: "http2and3",
      priceClass: "PriceClass_All",
      viewerCertificate: {
        cloudfrontDefaultCertificate: true,
      },
      restrictions: {
        geoRestriction: {
          restrictionType: "none",
        },
      },
      origin: [
        {
          originId,
          originPath: "",
          domainName: domain,
          customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originKeepaliveTimeout: 5,
            originProtocolPolicy: "https-only",
            originReadTimeout: 30,
            originSslProtocols: ["TLSv1.2"],
          },
        },
      ],
      defaultCacheBehavior: {
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        targetOriginId: originId,
        viewerProtocolPolicy: "allow-all",
        compress: false,
        cachePolicyId: cachePolicy.id,
      },
    });
  }
}

export class Resources extends Construct {
  constructor(protected scope: Construct, protected provider: AwsProvider) {
    super(scope, "luffy-cloudfront");
    const cachePolicy = new CloudfrontCachePolicy(
      this,
      "CachingOptimized-Accept",
      {
        name: "CachingOptimized-Accept",
        comment:
          "Policy with caching enabled. Gzip and Brotli compression. Forwards Accept header.",
        defaultTtl: 86400,
        maxTtl: 31536000,
        minTtl: 0,
        parametersInCacheKeyAndForwardedToOrigin: {
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
          cookiesConfig: {
            cookieBehavior: "none",
          },
          headersConfig: {
            headerBehavior: "whitelist",
            headers: {
              items: ["Accept"],
            },
          },
          queryStringsConfig: {
            queryStringBehavior: "none",
          },
        },
      }
    );
    new MediaCloudfrontDistribution(
      this,
      "media.bernat.ch",
      cachePolicy,
      provider
    );
    new MediaCloudfrontDistribution(
      this,
      "media.une-oasis-une-ecole.fr",
      cachePolicy,
      provider
    );
  }
}
