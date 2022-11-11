import { Fn } from "cdktf";
import { Construct } from "constructs";
import { HcloudProvider } from "../.gen/providers/hcloud/provider";
import { Server as HcloudServer, ServerConfig as HcloudServerConfig } from "../.gen/providers/hcloud/server";
import { Rdns as HcloudRdns } from "../.gen/providers/hcloud/rdns";

class HetznerServer extends Construct {
  public server: HcloudServer;
  constructor(protected scope: Construct, protected name: string, protected provider: HcloudProvider,
    protected config: Pick<HcloudServerConfig, "serverType" | "location" | "image">) {
    super(scope, name);
    this.server = new HcloudServer(this, name, {
      name,
      rebuildProtection: true,
      deleteProtection: true,
      ...config,
      provider,
    });
    new HcloudRdns(this, `rdns4-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv4Address,
      dnsPtr: name,
      provider,
    });
    new HcloudRdns(this, `rdns6-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv6Address,
      dnsPtr: name,
      provider,
    });
  }
}

export class Resources extends Construct {
  constructor(protected scope: Construct, protected provider: HcloudProvider) {
    super(scope, "luffy-servers");
    new HetznerServer(this, "web03.luffy.cx", provider, {
      serverType: "cpx11",
      location: "hel1",
    });
    new HetznerServer(this, "web04.luffy.cx", provider, {
      serverType: "cpx11",
      location: "nbg1",
    });
    new HetznerServer(this, "web05.luffy.cx", provider, {
      serverType: "cpx11",
      location: "ash",
      image: "39644359",
    });
  }
}
