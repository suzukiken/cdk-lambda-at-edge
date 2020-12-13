import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as ssm from "@aws-cdk/aws-ssm";

const sha256File = require("sha256-file"); // npm install sha256-file

export class CdklambdaatedgeStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //-------------------------- import

    // ssmパラメーターストアはCDKとリージョンが同じでないとアクセスできないので同じリージョンに置く

    const role_arn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_role_arn",
      "cdkadmincognito-iam-authenticated-role"
    ).stringValue;

    const auth_role = iam.Role.fromRoleArn(
      this,
      "iam_authenticated_role",
      role_arn
    );

    const bucket_name = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_bucket_name",
      "lambdaatedge-derivery-bucket-name"
    ).stringValue;

    const bucket = new s3.Bucket(this, "derivery-figment-research", {
      bucketName: bucket_name,
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

    const iam_s3_policy_statement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });

    iam_s3_policy_statement.addActions("s3:GetObject", "s3:PutObject");
    iam_s3_policy_statement.addResources(bucket.bucketArn);

    const iam_s3_policy = new iam.Policy(this, "iam_s3_policy", {
      policyName: "cdklambdaatedge-s3-policy",
      statements: [iam_s3_policy_statement],
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

    new cloudfront.CloudFrontWebDistribution(this, "cf_distribution", {
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
    });
  }
}
