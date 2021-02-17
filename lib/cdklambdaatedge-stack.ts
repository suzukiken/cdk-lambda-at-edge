import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as ssm from "@aws-cdk/aws-ssm";
import * as route53 from "@aws-cdk/aws-route53";
import * as targets from "@aws-cdk/aws-route53-targets/lib";
import * as acm from "@aws-cdk/aws-certificatemanager";

const sha256File = require("sha256-file"); // npm install sha256-file

export class CdklambdaatedgeStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //-------------------------- import

    // ssmパラメーターストアはCDKとリージョンが同じでないとアクセスできないので同じリージョンにあらかじめ置いておく
    // そのためにはリージョン間をまたがってパラメーターをコピーしてくるEventBrigeとLambda関数を別のCDKプロジェクトで用意している。

    const role_arn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_role_arn",
      "cdkadmincognito-iam-authenticated-role-arn"
    ).stringValue;

    const auth_role = iam.Role.fromRoleArn(
      this,
      "iam_authenticated_role",
      role_arn
    );

    const bucket_name = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_bucket_name",
      "lambdaatedge-bucket-name"
    ).stringValue;

    /*
    const domain_name = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_domain_name",
      "lambdaatedge-domain-name"
    ).stringValue;
    */

    // https://docs.aws.amazon.com/cdk/latest/guide/get_ssm_value.html
    // Reading Systems Manager values at synthesis time
    const domain_name = ssm.StringParameter.valueFromLookup(
      this,
      "lambdaatedge-domain-name"
    );

    const subdomain_name = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_subdomain_name",
      "lambdaatedge-subdomain-name"
    ).stringValue;

    const bucket = new s3.Bucket(this, "derivery-figment-research", {
      bucketName: bucket_name,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      publicReadAccess: true, // this line activates static website hosting
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.HEAD,
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: [
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2",
            "ETag",
          ],
          maxAge: 3000,
        },
      ],
    });

    //-------------------------- lambda

    const resizer_function = new lambda.Function(this, "lambda_function", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset("lambda", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_8.bundlingDockerImage,
          command: [
            "bash",
            "-c",
            `pip install -r requirements.txt -t /asset-output && cp -au . /asset-output`,
          ],
        },
      }),
      handler: "image-resizer.handler",
      functionName: "cdklambdaatedge-imageresizer",
      timeout: cdk.Duration.seconds(15),
    });

    const version = resizer_function.addVersion(
      sha256File("lambda/image-resizer.py")
    );

    //-------------------------- permission

    const iam_s3_obj_policy_statement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });

    iam_s3_obj_policy_statement.addActions("s3:PutObject");
    iam_s3_obj_policy_statement.addActions("s3:GetObject");
    iam_s3_obj_policy_statement.addActions("s3:DeleteObject");
    iam_s3_obj_policy_statement.addResources(bucket.arnForObjects("*"));
    /*
    iam_s3_obj_public_policy_statement.addResources(
      bucket.arnForObjects("public/*")
    );
    iam_s3_obj_public_policy_statement.addResources(
      bucket.arnForObjects("private/${cognito-identity.amazonaws.com:sub}/*")
    );
    iam_s3_obj_public_policy_statement.addResources(
      bucket.arnForObjects("protected/${cognito-identity.amazonaws.com:sub}/*")
    );
    */
    const iam_s3_buc_policy_statement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });

    iam_s3_buc_policy_statement.addActions("s3:ListBucket");
    iam_s3_buc_policy_statement.addResources(bucket.bucketArn);

    const iam_s3_policy = new iam.Policy(this, "iam_s3_policy", {
      policyName: "cdklambdaatedge-s3-policy",
      statements: [iam_s3_obj_policy_statement, iam_s3_buc_policy_statement],
    });

    auth_role.attachInlinePolicy(iam_s3_policy);

    bucket.grantReadWrite(resizer_function);

    const oai = new cloudfront.OriginAccessIdentity(this, "oai");

    // oai の権限にPut権限をつける
    const policyStatement = new iam.PolicyStatement();
    policyStatement.addActions("s3:PutObject");
    policyStatement.addActions("s3:PutObjectAcl");
    policyStatement.addResources(bucket.arnForObjects("*"));
    policyStatement.addCanonicalUserPrincipal(
      oai.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    bucket.addToResourcePolicy(policyStatement);

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "certificate",
      "arn:aws:acm:us-east-1:656169322665:certificate/1e64805a-e07e-4b0c-b485-7889811bbf15"
    );

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "distribution",
      {
        aliasConfiguration: {
          acmCertRef: certificate.certificateArn,
          names: [cdk.Fn.join(".", [subdomain_name, domain_name])], // subdomain_name + "." + domain_name,
          sslMethod: cloudfront.SSLMethod.SNI,
          securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016,
        },
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: bucket,
              originAccessIdentity: oai,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
                defaultTtl: cdk.Duration.seconds(3),
                lambdaFunctionAssociations: [
                  {
                    eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
                    lambdaFunction: version,
                  },
                ],
              },
            ],
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      }
    );

    // Cannot determine scope for context provider hosted-zone.
    // This usually happens when one or more of the provider props have unresolved tokens
    const zone = route53.HostedZone.fromLookup(this, "zone", {
      domainName: domain_name,
    });

    const record = new route53.ARecord(this, "record", {
      recordName: subdomain_name,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      zone: zone,
    });
  }
}
