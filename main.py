#!/usr/bin/env python
from constructs import Construct
from cdktf import App, TerraformStack

from cdktf_cdktf_provider_aws.provider import AwsProvider
from cdktf_cdktf_provider_aws.cloudfront_distribution import (
    CloudfrontDistribution,
    CloudfrontDistributionDefaultCacheBehavior,
    CloudfrontDistributionDefaultCacheBehaviorForwardedValues,
    CloudfrontDistributionDefaultCacheBehaviorForwardedValuesCookies,
    CloudfrontDistributionOrigin,
    CloudfrontDistributionOriginCustomOriginConfig,
    CloudfrontDistributionRestrictions,
    CloudfrontDistributionRestrictionsGeoRestriction,
    CloudfrontDistributionViewerCertificate,
)


class LuffyStack(TerraformStack):
    def __init__(self, scope: Construct, id: str):
        super().__init__(scope, id)

        AwsProvider(self, "aws", region="us-east-1")
        CloudfrontDistribution(
            self,
            "media.bernat.ch",
            default_cache_behavior=CloudfrontDistributionDefaultCacheBehavior(
                allowed_methods=[
                    "GET",
                    "HEAD",
                ],
                cached_methods=[
                    "GET",
                    "HEAD",
                ],
                target_origin_id="MyOrigin",
                viewer_protocol_policy="allow-all",
                compress=True,
                min_ttl=0,
                default_ttl=86400,
                max_ttl=31536000,
                forwarded_values=CloudfrontDistributionDefaultCacheBehaviorForwardedValues(
                    # No cookies
                    cookies=CloudfrontDistributionDefaultCacheBehaviorForwardedValuesCookies(
                        forward="none",
                        whitelisted_names=[],
                    ),
                    # Forward the "Accept" header
                    headers=["Accept"],
                    # No need for the query string
                    query_string=False,
                ),
            ),
            enabled=True,
            http_version="http2and3",
            is_ipv6_enabled=True,
            origin=[
                CloudfrontDistributionOrigin(
                    domain_name="media.bernat.ch",
                    origin_id="MyOrigin",
                    origin_path="",
                    custom_origin_config=CloudfrontDistributionOriginCustomOriginConfig(
                        http_port=80,
                        https_port=443,
                        origin_keepalive_timeout=5,
                        origin_protocol_policy="https-only",
                        origin_read_timeout=30,
                        origin_ssl_protocols=["TLSv1.2"],
                    ),
                )
            ],
            price_class="PriceClass_All",
            restrictions=CloudfrontDistributionRestrictions(
                geo_restriction=CloudfrontDistributionRestrictionsGeoRestriction(
                    restriction_type="none",
                ),
            ),
            viewer_certificate=CloudfrontDistributionViewerCertificate(
                cloudfront_default_certificate=True,
            ),
        )


app = App()
LuffyStack(app, "cdktf-take1")
app.synth()
