import { Fn } from "cdktf";
import { Construct } from "constructs";
import { HcloudProvider } from "../.gen/providers/hcloud/provider";
import { VultrProvider } from "../.gen/providers/vultr/provider";
import * as hcloud from "../.gen/providers/hcloud";
import * as vultr from "../.gen/providers/vultr";

class HetznerServer extends Construct {
  public server: hcloud.server.Server;
  constructor(
    protected scope: Construct,
    protected name: string,
    protected provider: HcloudProvider,
    protected config: Pick<
      hcloud.server.ServerConfig,
      "serverType" | "location" | "image"
    >
  ) {
    super(scope, name);
    this.server = new hcloud.server.Server(this, name, {
      name,
      rebuildProtection: true,
      deleteProtection: true,
      ...config,
      provider,
    });
    new hcloud.rdns.Rdns(this, `rdns4-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv4Address,
      dnsPtr: name,
      provider,
    });
    new hcloud.rdns.Rdns(this, `rdns6-${name}`, {
      serverId: Fn.tonumber(this.server.id),
      ipAddress: this.server.ipv6Address,
      dnsPtr: name,
      provider,
    });
  }
}

class VultrServer extends Construct {
  public server: vultr.instance.Instance;
  constructor(
    protected scope: Construct,
    protected name: string,
    protected provider: VultrProvider,
    protected config: Pick<vultr.instance.InstanceConfig, "plan" | "region">
  ) {
    super(scope, name);
    this.server = new vultr.instance.Instance(this, name, {
      hostname: name,
      ddosProtection: false,
      ...config,
      provider,
    });
    new vultr.reverseIpv4.ReverseIpv4(this, `rdns4-${name}`, {
      instanceId: this.server.id,
      ip: this.server.mainIp,
      reverse: name,
    });
    new vultr.reverseIpv6.ReverseIpv6(this, `rdns6-${name}`, {
      instanceId: this.server.id,
      ip: this.server.v6MainIp,
      reverse: name,
    });
  }
}

interface Providers {
  hcloud: HcloudProvider;
  vultr: VultrProvider;
}

export class Resources extends Construct {
  constructor(protected scope: Construct, protected providers: Providers) {
    super(scope, "luffy-servers");
    new HetznerServer(this, "web03.luffy.cx", providers.hcloud, {
      serverType: "cpx11",
      location: "hel1",
    });
    new HetznerServer(this, "web04.luffy.cx", providers.hcloud, {
      serverType: "cpx11",
      location: "nbg1",
    });
    new HetznerServer(this, "web05.luffy.cx", providers.hcloud, {
      serverType: "cpx11",
      location: "ash",
      image: "39644359",
    });
    new VultrServer(this, "web06.luffy.cx", providers.vultr, {
      plan: "vc2-1c-1gb",
      region: "ord",
    });
  }
}
