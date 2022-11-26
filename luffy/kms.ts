import { Fn } from "cdktf";
import { Construct } from "constructs";
import { AwsProvider } from "../.gen/providers/aws/provider";
import * as aws from "../.gen/providers/aws";

/** KMS resource for Amazon AWS */
export class Resources extends Construct {
  public readonly key: aws.kmsKey.KmsKey;
  constructor(scope: Construct, provider: AwsProvider) {
    super(scope, "luffy-kms");
    const caller = new aws.dataAwsCallerIdentity.DataAwsCallerIdentity(
      this,
      "current",
      { provider: provider }
    );
    this.key = new aws.kmsKey.KmsKey(this, "kms-key", {
      customerMasterKeySpec: "ECC_NIST_P256",
      enableKeyRotation: false,
      isEnabled: true,
      keyUsage: "SIGN_VERIFY",
      policy: Fn.jsonencode({
        Version: "2012-10-17",
        Id: "dnssec-policy",
        Statement: [
          {
            Sid: "Enable IAM User Permissions",
            Effect: "Allow",
            Principal: {
              AWS: Fn.format("arn:aws:iam::%s:root", [caller.accountId]),
            },
            Action: "kms:*",
            Resource: "*",
          },
          {
            Sid: "Allow Route 53 DNSSEC Service",
            Effect: "Allow",
            Principal: { Service: "dnssec-route53.amazonaws.com" },
            Action: ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"],
            Resource: "*",
          },
          {
            Sid: "Allow Route 53 DNSSEC to CreateGrant",
            Effect: "Allow",
            Principal: { Service: "dnssec-route53.amazonaws.com" },
            Action: "kms:CreateGrant",
            Resource: "*",
            // FIXME: see https://github.com/hashicorp/terraform-cdk/issues/1795
            Condition: { Bool: { '"kms:GrantIsForAWSResource"': "true" } },
          },
        ],
      }),
      provider,
    });
  }
}
