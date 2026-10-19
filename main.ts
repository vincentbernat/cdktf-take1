import { Construct } from "constructs";
import { App, TerraformStack, TerraformVariable } from "cdktn";
import { HcloudProvider } from "./.gen/providers/hcloud/provider";
import { VultrProvider } from "./.gen/providers/vultr/provider";
import { GandiProvider } from "./.gen/providers/gandi/provider";
import { BunnynetProvider } from "./.gen/providers/bunnynet/provider";
import * as bunnycdn from "./luffy/bunnycdn";
import * as servers from "./luffy/servers";
import * as dns from "./luffy/dns";

class LuffyStack extends TerraformStack {
  constructor(scope: Construct, ns: string) {
    super(scope, ns);

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

    /* Bunny provider */
    const bunnyApiKey = new TerraformVariable(this, "bunnyApiKey", {
      type: "string",
      sensitive: true,
    });
    const bunnyProvider = new BunnynetProvider(this, "bunny", {
      apiKey: bunnyApiKey.value,
    });

    new bunnycdn.Resources(this, bunnyProvider);
    const serverResource = new servers.Resources(this, {
      hcloud: hcloudProvider,
      vultr: vultrProvider,
    });
    new dns.Resources(this, serverResource.servers, {
      gandiVB: gandiProviders.vb,
      gandiRB: gandiProviders.rb,
      bunny: bunnyProvider,
    });
  }
}

const app = new App();
new LuffyStack(app, "cdktf-take1");
app.synth();
