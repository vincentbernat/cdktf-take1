import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import { AwsProvider } from "./.gen/providers/aws/provider";
import { HcloudProvider } from "./.gen/providers/hcloud/provider";
import * as cloudfront from "./luffy/cloudfront";
import * as servers from "./luffy/servers";

class LuffyStack extends TerraformStack {
  constructor(scope: Construct, ns: string) {
    super(scope, ns);

    const awsProvider = new AwsProvider(this, "aws", {
      region: "us-east-1",
    });
    const hcloudProvider = new HcloudProvider(this, "hcloud", {
      token: process.env.HCLOUD_TOKEN!,
    });

    new cloudfront.Resources(this, awsProvider);
    new servers.Resources(this, hcloudProvider);
  }
}

const app = new App();
new LuffyStack(app, "cdktf-take1");
app.synth();
