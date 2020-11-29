#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdklambdaatedgeStack } from '../lib/cdklambdaatedge-stack';

const env = { account: '656169322665', region: 'us-east-1' };

const app = new cdk.App();
new CdklambdaatedgeStack(app, 'CdklambdaatedgeStack', { env: env });
