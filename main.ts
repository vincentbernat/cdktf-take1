import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import {
  provider,
  cloudfrontDistribution,
} from "@cdktf/provider-aws";

class LuffyStack extends TerraformStack {
  constructor(scope: Construct, ns: string) {
    super(scope, ns);

    const awsProvider = new provider.AwsProvider(this, "aws", {
      region: "us-east-1",
    });

    new cloudfrontDistribution.CloudfrontDistribution(
      this,
      "media.bernat.ch",
      {
        provider: awsProvider,
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
            originId: "MyOrigin",
            originPath: "",
            domainName: "media.bernat.ch",
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
          targetOriginId: "MyOrigin",
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
      }
    );
  }
}

const app = new App();
new LuffyStack(app, "cdktf-take1");
app.synth();
