import { Construct } from "constructs";
import { AwsProvider } from "../.gen/providers/aws/provider";
import { CloudfrontDistribution } from "../.gen/providers/aws/cloudfront-distribution";

/* Cookie-less cloudfront distribution. */
export class MediaCloudfrontDistribution extends Construct {
  constructor(protected scope: Construct, protected domain: string, protected provider: AwsProvider) {
    super(scope, domain);
    const originId = "MyOrigin";
    new CloudfrontDistribution(
      this,
      domain,
      {
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
          minTtl: 0,
          defaultTtl: 86400,
          maxTtl: 31536000,
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          targetOriginId: originId,
          viewerProtocolPolicy: "allow-all",
          compress: true,
          forwardedValues: {
            cookies: {
              forward: "none",
              whitelistedNames: [],
            },
            headers: ["Accept"],
            queryString: false,
          },
        },
      },
    );
  }
}
