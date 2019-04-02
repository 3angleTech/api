#!/bin/bash
set -e

export AWS_DEFAULT_PROFILE=open-source
export AWS_DEFAULT_REGION="eu-central-1"
ACCOUNT_ID=`aws sts get-caller-identity --output text --query 'Account'`
DOCKER_NAMESPACE="${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com"

# extract build version via package.json
BUILD_VER=$(cat ./web-api/package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",\t ]//g')

# build image with tag
docker build -t node-api:$BUILD_VER ./web-api/

# login to AWS
$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)

# tag the image w/ BUILD_VER
docker tag node-api:$BUILD_VER $DOCKER_NAMESPACE/node-api:$BUILD_VER

# push image
docker push $DOCKER_NAMESPACE/node-api:$BUILD_VER

exit 0
