import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
const sha256File = require("sha256-file");

/*
npm install @aws-cdk/aws-s3
npm install @aws-cdk/aws-iam
npm install @aws-cdk/aws-lambda
npm install @aws-cdk/aws-cloudfront
npm install sha256-file
*/

export class CdklambdaatedgeStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "derivery-figment-research", {
      bucketName: "derivery.figment-research.com",
    });

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
