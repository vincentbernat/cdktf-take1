import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import { provider } from "./.gen/providers/aws";
import { MediaCloudfrontDistribution } from "./lib/cloudfront";

class LuffyStack extends TerraformStack {
  constructor(scope: Construct, ns: string) {
    super(scope, ns);

    const awsProvider = new provider.AwsProvider(this, "aws", {
      region: "us-east-1",
    });

    new MediaCloudfrontDistribution(this, "media.bernat.ch", awsProvider);
    new MediaCloudfrontDistribution(this, "media.une-oasis-une-ecole.fr", awsProvider);
  }
}

const app = new App();
new LuffyStack(app, "cdktf-take1");
app.synth();
