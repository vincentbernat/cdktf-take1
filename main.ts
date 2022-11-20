import { Construct } from "constructs";
import { App, TerraformStack, TerraformVariable } from "cdktf";
import { AwsProvider } from "./.gen/providers/aws/provider";
import { HcloudProvider } from "./.gen/providers/hcloud/provider";
import { VultrProvider } from "./.gen/providers/vultr/provider";
import { GandiProvider } from "./.gen/providers/gandi/provider";
import * as cloudfront from "./luffy/cloudfront";
import * as servers from "./luffy/servers";
import * as dns from "./luffy/dns";
import * as kms from "./luffy/kms";

class LuffyStack extends TerraformStack {
  constructor(scope: Construct, ns: string) {
    super(scope, ns);

    /* AWS provider */
    const awsProvider = new AwsProvider(this, "aws", {
      region: "us-east-1",
    });

    /* Hetzner cloud provider */
    const hcloudToken = new TerraformVariable(this, "hcloudToken", {
      type: "string",
      sensitive: true,
    });
    const hcloudProvider = new HcloudProvider(this, "hcloud", {
      token: hcloudToken.value,
    });

    /* Vultr provider */
    const vultrApiKey = new TerraformVariable(this, "vultrApiKey", {
      type: "string",
      sensitive: true,
    });
    const vultrProvider = new VultrProvider(this, "vultr", {
      apiKey: vultrApiKey.value,
    });

    /* Gandi providers */
    const gandiProviders = {
      vb: new GandiProvider(this, "gandiVB", {
        key: new TerraformVariable(this, "gandiVBKey", {
          type: "string",
          sensitive: true,
        }).value,
        alias: "vb",
      }),
      rb: new GandiProvider(this, "gandiRB", {
        key: new TerraformVariable(this, "gandiRBKey", {
          type: "string",
          sensitive: true,
        }).value,
        alias: "rb",
      }),
    };

    new cloudfront.Resources(this, awsProvider);
    const serverResource = new servers.Resources(this, {
      hcloud: hcloudProvider,
      vultr: vultrProvider,
    });
    const kmsResource = new kms.Resources(this, awsProvider);
    new dns.Resources(
      this,
      serverResource.servers,
      {
        aws: awsProvider,
        gandiVB: gandiProviders.vb,
        gandiRB: gandiProviders.rb,
      },
      kmsResource
    );
  }
}

const app = new App();
new LuffyStack(app, "cdktf-take1");
app.synth();
