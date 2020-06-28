#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdklambdaatedgeStack } from '../lib/cdklambdaatedge-stack';

const app = new cdk.App();
new CdklambdaatedgeStack(app, 'CdklambdaatedgeStack');
